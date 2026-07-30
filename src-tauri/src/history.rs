//! Run history and persisted service output.
//!
//! Until now nothing about a run outlived the process: close the app and every
//! record of what ran, when, and whether it succeeded was gone. This module keeps
//! a bounded history on disk so that context survives a restart.
//!
//! Two stores, chosen to match how the data is written and read:
//!
//! - `history/runs.json` — the index. Rewritten only when a run starts or ends,
//!   so a whole-file write is cheap, and written atomically via a temporary file
//!   so a crash mid-write cannot leave a truncated index.
//! - `history/logs/<run id>.log` — one append-only file per run. Output arrives a
//!   line at a time and is read back sequentially, which appends suit and a
//!   single rewritten document does not. Pruning a run is then just a file
//!   deletion.
//!
//! Persistence is best-effort by design: a service must keep running even if its
//! history cannot be written. Every failure here is logged and swallowed rather
//! than propagated into the process lifecycle.

use serde::{Deserialize, Serialize};
use std::fs::{File, OpenOptions};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use ts_rs::TS;

/// Runs kept in the index. Older runs are dropped and their logs deleted.
const MAX_RUNS: usize = 200;

/// Cap per run log. A chatty dev server can emit megabytes a minute, so the file
/// stops growing rather than filling the disk over a long session.
const MAX_LOG_BYTES: u64 = 2 * 1024 * 1024;

/// Note appended once when a log hits its cap, so truncation is visible rather
/// than looking like the process fell silent.
const TRUNCATION_NOTICE: &str = "\n[localhost-hub] log truncated: this run reached its size limit\n";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "../../src/generated/")]
pub enum RunOutcome {
    /// Started and believed to be running.
    Running,
    /// Exited on its own with a status.
    Exited,
    /// Stopped through the interface.
    Stopped,
    /// Could not be started at all.
    Failed,
    /// Was still marked running when the application last closed, so its real
    /// fate is unknown. Set by reconciliation at startup, never by a live run.
    Interrupted,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
pub struct RunRecord {
    pub run_id: String,
    pub service_id: String,
    pub cwd: String,
    pub cmd: String,
    #[ts(type = "number")]
    pub pid: u32,
    #[ts(type = "number")]
    pub started_at_ms: u128,
    #[ts(type = "number | null")]
    pub ended_at_ms: Option<u128>,
    #[ts(type = "number | null")]
    pub exit_code: Option<i32>,
    pub outcome: RunOutcome,
    /// True once the log file hit its cap.
    pub log_truncated: bool,
}

impl RunRecord {
    #[cfg(test)]
    fn duration_ms(&self) -> Option<u128> {
        self.ended_at_ms.map(|end| end.saturating_sub(self.started_at_ms))
    }
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
pub struct RunLog {
    pub run_id: String,
    pub lines: Vec<String>,
    /// True when the returned lines are only the tail of a longer log.
    pub truncated: bool,
}

/// Appends one run's output. Held by the reader threads for the run's lifetime.
pub struct RunLogWriter {
    writer: Mutex<Option<BufWriter<File>>>,
    written: Mutex<u64>,
    truncated: Mutex<bool>,
}

impl RunLogWriter {
    fn new(path: &Path) -> Option<Self> {
        let file = OpenOptions::new().create(true).append(true).open(path).ok()?;
        Some(Self {
            writer: Mutex::new(Some(BufWriter::new(file))),
            written: Mutex::new(0),
            truncated: Mutex::new(false),
        })
    }

    /// Writes one line. Silent on failure: losing a log line must never disturb
    /// the process producing it.
    pub fn append(&self, line: &str) {
        let mut written = match self.written.lock() {
            Ok(guard) => guard,
            Err(_) => return,
        };
        let mut truncated = match self.truncated.lock() {
            Ok(guard) => guard,
            Err(_) => return,
        };
        let Ok(mut guard) = self.writer.lock() else {
            return;
        };
        let Some(writer) = guard.as_mut() else {
            return;
        };

        if *truncated {
            return;
        }
        if *written + line.len() as u64 + 1 > MAX_LOG_BYTES {
            let _ = writer.write_all(TRUNCATION_NOTICE.as_bytes());
            let _ = writer.flush();
            *truncated = true;
            return;
        }
        if writer.write_all(line.as_bytes()).is_ok() && writer.write_all(b"\n").is_ok() {
            *written += line.len() as u64 + 1;
        }
    }

    pub fn is_truncated(&self) -> bool {
        self.truncated.lock().map(|value| *value).unwrap_or(false)
    }

    /// Flushes and closes. Called when the run ends so the tail is not left in
    /// the buffer.
    pub fn finish(&self) {
        if let Ok(mut guard) = self.writer.lock() {
            if let Some(mut writer) = guard.take() {
                let _ = writer.flush();
            }
        }
    }
}

/// The on-disk history for one application data directory.
#[derive(Clone)]
pub struct History {
    directory: PathBuf,
}

impl History {
    pub fn new(app_data_dir: &Path) -> Self {
        Self {
            directory: app_data_dir.join("history"),
        }
    }

    fn index_path(&self) -> PathBuf {
        self.directory.join("runs.json")
    }

    fn logs_dir(&self) -> PathBuf {
        self.directory.join("logs")
    }

    fn log_path(&self, run_id: &str) -> PathBuf {
        self.logs_dir().join(format!("{run_id}.log"))
    }

    pub fn load(&self) -> Vec<RunRecord> {
        let path = self.index_path();
        if !path.exists() {
            return Vec::new();
        }
        match std::fs::read_to_string(&path)
            .ok()
            .and_then(|text| serde_json::from_str::<Vec<RunRecord>>(&text).ok())
        {
            Some(records) => records,
            None => {
                // A corrupt index is not worth failing over; history is
                // recoverable-by-losing in a way that a config file is not.
                log::warn!("run history index is unreadable; starting a fresh one");
                Vec::new()
            }
        }
    }

    fn store(&self, records: &[RunRecord]) -> Result<(), String> {
        std::fs::create_dir_all(&self.directory).map_err(|error| error.to_string())?;
        let text = serde_json::to_string_pretty(records).map_err(|error| error.to_string())?;

        // Write to a sibling then rename, so a crash cannot leave the index
        // half-written. Rename within a directory is atomic on the platforms
        // this ships to.
        let temporary = self.index_path().with_extension("json.tmp");
        {
            let mut file = File::create(&temporary).map_err(|error| error.to_string())?;
            file.write_all(text.as_bytes()).map_err(|error| error.to_string())?;
            file.sync_all().map_err(|error| error.to_string())?;
        }
        std::fs::rename(&temporary, self.index_path()).map_err(|error| error.to_string())
    }

    /// Records a started run and returns its log writer.
    ///
    /// Returns `None` for the writer if history is unwritable, which leaves the
    /// run un-persisted but otherwise unaffected.
    pub fn begin_run(
        &self,
        run_id: String,
        service_id: String,
        cwd: String,
        cmd: String,
        pid: u32,
        started_at_ms: u128,
    ) -> Option<Arc<RunLogWriter>> {
        let record = RunRecord {
            run_id: run_id.clone(),
            service_id,
            cwd,
            cmd,
            pid,
            started_at_ms,
            ended_at_ms: None,
            exit_code: None,
            outcome: RunOutcome::Running,
            log_truncated: false,
        };

        let mut records = self.load();
        records.push(record);
        self.prune(&mut records);
        if let Err(error) = self.store(&records) {
            log::warn!("could not record run start: {error}");
            return None;
        }

        if let Err(error) = std::fs::create_dir_all(self.logs_dir()) {
            log::warn!("could not create the log directory: {error}");
            return None;
        }
        match RunLogWriter::new(&self.log_path(&run_id)) {
            Some(writer) => Some(Arc::new(writer)),
            None => {
                log::warn!("could not open a log file for run {run_id}");
                None
            }
        }
    }

    /// Marks a run finished. `exit_code` is absent when the process was stopped
    /// or never produced a status.
    ///
    /// The first outcome wins. Stopping a service closes the run, and the exit
    /// watcher then observes the same process exiting and tries to close it
    /// again; without this the deliberate stop would be overwritten by the exit
    /// that the stop itself caused.
    pub fn end_run(
        &self,
        run_id: &str,
        outcome: RunOutcome,
        exit_code: Option<i32>,
        ended_at_ms: u128,
        log_truncated: bool,
    ) {
        let mut records = self.load();
        let Some(record) = records.iter_mut().find(|record| record.run_id == run_id) else {
            return;
        };
        if record.ended_at_ms.is_some() {
            return;
        }
        record.outcome = outcome;
        record.exit_code = exit_code;
        record.ended_at_ms = Some(ended_at_ms);
        record.log_truncated = log_truncated;
        if let Err(error) = self.store(&records) {
            log::warn!("could not record run completion: {error}");
        }
    }

    /// Resolves runs left marked running by a previous session.
    ///
    /// The service manager's process table lives in memory, so nothing started
    /// before this launch is managed any more. Rather than guess, such runs are
    /// marked interrupted. Adopting a live process by its recorded PID is
    /// deliberately not attempted: PIDs are recycled, and claiming to manage a
    /// process that merely inherited a number would be worse than admitting the
    /// outcome is unknown. Externally running dev servers are already surfaced
    /// separately by process scanning.
    ///
    /// Returns the runs it reconciled.
    pub fn reconcile_interrupted_runs(&self, now_ms: u128) -> Vec<RunRecord> {
        let mut records = self.load();
        let mut reconciled = Vec::new();
        for record in records.iter_mut() {
            if record.outcome == RunOutcome::Running {
                record.outcome = RunOutcome::Interrupted;
                record.ended_at_ms = Some(record.ended_at_ms.unwrap_or(now_ms));
                reconciled.push(record.clone());
            }
        }
        if reconciled.is_empty() {
            return reconciled;
        }
        if let Err(error) = self.store(&records) {
            log::warn!("could not reconcile interrupted runs: {error}");
        }
        reconciled
    }

    /// Newest first, which is the order the interface shows them in.
    pub fn list(&self) -> Vec<RunRecord> {
        let mut records = self.load();
        records.sort_by_key(|record| std::cmp::Reverse(record.started_at_ms));
        records
    }

    /// Reads back a run's output, returning at most `limit` lines from the tail.
    pub fn read_log(&self, run_id: &str, limit: usize) -> Result<RunLog, String> {
        // The identifier reaches the filesystem, so it must not be able to point
        // anywhere but the log directory.
        validate_run_id(run_id)?;
        let path = self.log_path(run_id);
        if !path.exists() {
            return Ok(RunLog {
                run_id: run_id.to_string(),
                lines: Vec::new(),
                truncated: false,
            });
        }
        let text = std::fs::read_to_string(&path)
            .map_err(|error| format!("Could not read the run log: {error}"))?;
        let all: Vec<&str> = text.lines().collect();
        let truncated = all.len() > limit;
        let lines = all
            .iter()
            .skip(all.len().saturating_sub(limit))
            .map(|line| (*line).to_string())
            .collect();
        Ok(RunLog {
            run_id: run_id.to_string(),
            lines,
            truncated,
        })
    }

    /// Empties the history and deletes every stored log.
    pub fn clear(&self) -> Result<(), String> {
        if self.logs_dir().exists() {
            std::fs::remove_dir_all(self.logs_dir())
                .map_err(|error| format!("Could not remove stored logs: {error}"))?;
        }
        if self.index_path().exists() {
            std::fs::remove_file(self.index_path())
                .map_err(|error| format!("Could not remove the run history: {error}"))?;
        }
        Ok(())
    }

    /// Trims the index to `MAX_RUNS`, deleting the logs of whatever it drops so
    /// the log directory cannot outgrow the index that references it.
    fn prune(&self, records: &mut Vec<RunRecord>) {
        if records.len() <= MAX_RUNS {
            return;
        }
        records.sort_by_key(|record| record.started_at_ms);
        let excess = records.len() - MAX_RUNS;
        for record in records.drain(..excess) {
            let _ = std::fs::remove_file(self.log_path(&record.run_id));
        }
    }
}

/// Run identifiers are generated internally, but this is the boundary where one
/// becomes a path, so it is checked rather than trusted.
fn validate_run_id(run_id: &str) -> Result<(), String> {
    if run_id.is_empty()
        || run_id.len() > 64
        || !run_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
    {
        return Err("Invalid run identifier.".to_string());
    }
    Ok(())
}

/// Identifier for a run: sortable by time, with a random suffix so two services
/// starting in the same millisecond cannot collide.
pub fn new_run_id(started_at_ms: u128) -> String {
    let entropy = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.subsec_nanos())
        .unwrap_or(0);
    format!("{started_at_ms:x}-{entropy:08x}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temporary_dir(label: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "localhost-hub-history-{label}-{}-{}",
            std::process::id(),
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    fn begin(history: &History, service: &str, at: u128) -> String {
        let run_id = new_run_id(at);
        history.begin_run(
            run_id.clone(),
            service.to_string(),
            "/tmp".to_string(),
            "npm run dev".to_string(),
            4242,
            at,
        );
        run_id
    }

    #[test]
    fn a_run_survives_a_restart() {
        let dir = temporary_dir("survives");
        let run_id = {
            // A distinct History value stands in for a previous session.
            let history = History::new(&dir);
            let run_id = begin(&history, "web", 1_000);
            history.end_run(&run_id, RunOutcome::Exited, Some(0), 2_500, false);
            run_id
        };

        let reopened = History::new(&dir);
        let records = reopened.list();
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].run_id, run_id);
        assert_eq!(records[0].outcome, RunOutcome::Exited);
        assert_eq!(records[0].exit_code, Some(0));
        assert_eq!(records[0].duration_ms(), Some(1_500));

        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn output_is_written_and_read_back() {
        let dir = temporary_dir("output");
        let history = History::new(&dir);
        let run_id = new_run_id(10);
        let writer = history
            .begin_run(
                run_id.clone(),
                "web".to_string(),
                "/tmp".to_string(),
                "npm run dev".to_string(),
                1,
                10,
            )
            .expect("writer");
        writer.append("listening on 3000");
        writer.append("compiled successfully");
        writer.finish();

        let log = history.read_log(&run_id, 100).unwrap();
        assert_eq!(log.lines, vec!["listening on 3000", "compiled successfully"]);
        assert!(!log.truncated);

        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn reading_a_log_returns_the_tail_and_says_so() {
        let dir = temporary_dir("tail");
        let history = History::new(&dir);
        let run_id = new_run_id(10);
        let writer = history
            .begin_run(run_id.clone(), "web".into(), "/tmp".into(), "x".into(), 1, 10)
            .expect("writer");
        for index in 0..50 {
            writer.append(&format!("line {index}"));
        }
        writer.finish();

        let log = history.read_log(&run_id, 10).unwrap();
        assert_eq!(log.lines.len(), 10);
        assert_eq!(log.lines.first().unwrap(), "line 40");
        assert_eq!(log.lines.last().unwrap(), "line 49");
        assert!(log.truncated, "should report that earlier lines exist");

        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_log_stops_growing_at_its_cap() {
        let dir = temporary_dir("cap");
        let history = History::new(&dir);
        let run_id = new_run_id(10);
        let writer = history
            .begin_run(run_id.clone(), "web".into(), "/tmp".into(), "x".into(), 1, 10)
            .expect("writer");

        let chunk = "x".repeat(4096);
        // Comfortably past the cap.
        for _ in 0..(MAX_LOG_BYTES / 4096 + 16) {
            writer.append(&chunk);
        }
        writer.finish();
        assert!(writer.is_truncated(), "writer should report truncation");

        let size = std::fs::metadata(history.log_path(&run_id)).unwrap().len();
        assert!(
            size <= MAX_LOG_BYTES + TRUNCATION_NOTICE.len() as u64,
            "log grew past its cap: {size}"
        );

        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn runs_left_running_by_a_previous_session_are_marked_interrupted() {
        let dir = temporary_dir("interrupted");
        let run_id = {
            let history = History::new(&dir);
            begin(&history, "web", 1_000)
        };

        // A fresh session: nothing is managed, so a Running record is stale.
        let reopened = History::new(&dir);
        let reconciled = reopened.reconcile_interrupted_runs(9_000);
        assert_eq!(reconciled.len(), 1);
        assert_eq!(reconciled[0].run_id, run_id);

        let records = reopened.list();
        assert_eq!(records[0].outcome, RunOutcome::Interrupted);
        assert_eq!(records[0].ended_at_ms, Some(9_000));

        // Idempotent: a second launch has nothing left to reconcile.
        assert!(reopened.reconcile_interrupted_runs(10_000).is_empty());

        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn closing_a_run_twice_keeps_the_first_outcome() {
        let dir = temporary_dir("idempotent");
        let history = History::new(&dir);
        let run_id = begin(&history, "web", 1_000);

        // Stopping a service closes the run, then the exit watcher sees the
        // process it just killed exit and tries to close it again.
        history.end_run(&run_id, RunOutcome::Stopped, None, 2_000, false);
        history.end_run(&run_id, RunOutcome::Exited, Some(143), 2_100, false);

        let record = &history.list()[0];
        assert_eq!(record.outcome, RunOutcome::Stopped, "a deliberate stop must not be overwritten");
        assert_eq!(record.exit_code, None);
        assert_eq!(record.ended_at_ms, Some(2_000));

        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn reconciliation_leaves_finished_runs_alone() {
        let dir = temporary_dir("finished");
        let history = History::new(&dir);
        let run_id = begin(&history, "web", 1_000);
        history.end_run(&run_id, RunOutcome::Stopped, None, 2_000, false);

        assert!(history.reconcile_interrupted_runs(9_000).is_empty());
        assert_eq!(history.list()[0].outcome, RunOutcome::Stopped);

        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn the_index_is_bounded_and_drops_the_logs_it_forgets() {
        let dir = temporary_dir("bounded");
        let history = History::new(&dir);

        let mut ids = Vec::new();
        for index in 0..(MAX_RUNS + 5) {
            let run_id = new_run_id(index as u128);
            let writer = history
                .begin_run(run_id.clone(), "web".into(), "/tmp".into(), "x".into(), 1, index as u128)
                .expect("writer");
            writer.append("some output");
            writer.finish();
            ids.push(run_id);
        }

        let records = history.list();
        assert_eq!(records.len(), MAX_RUNS, "index must stay bounded");

        // The five oldest were dropped, and their logs with them.
        for old in &ids[..5] {
            assert!(
                !history.log_path(old).exists(),
                "log for a forgotten run should be deleted"
            );
        }
        assert!(history.log_path(ids.last().unwrap()).exists());

        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn newest_runs_come_first() {
        let dir = temporary_dir("order");
        let history = History::new(&dir);
        begin(&history, "old", 1_000);
        begin(&history, "new", 5_000);

        let records = history.list();
        assert_eq!(records[0].service_id, "new");
        assert_eq!(records[1].service_id, "old");

        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_run_identifier_cannot_escape_the_log_directory() {
        let dir = temporary_dir("traversal");
        let history = History::new(&dir);
        for attempt in ["../../etc/passwd", "..", "a/b", "with space", "", "a\0b"] {
            assert!(
                history.read_log(attempt, 10).is_err(),
                "should reject {attempt:?}"
            );
        }
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn clearing_removes_both_the_index_and_the_logs() {
        let dir = temporary_dir("clear");
        let history = History::new(&dir);
        let run_id = new_run_id(10);
        let writer = history
            .begin_run(run_id.clone(), "web".into(), "/tmp".into(), "x".into(), 1, 10)
            .expect("writer");
        writer.append("output");
        writer.finish();

        history.clear().unwrap();
        assert!(history.list().is_empty());
        assert!(!history.log_path(&run_id).exists());
        // Clearing an already-empty history is not an error.
        history.clear().unwrap();

        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_corrupt_index_does_not_prevent_recording_new_runs() {
        let dir = temporary_dir("corrupt");
        let history = History::new(&dir);
        std::fs::create_dir_all(&history.directory).unwrap();
        std::fs::write(history.index_path(), b"{ not json").unwrap();

        assert!(history.list().is_empty(), "unreadable index reads as empty");
        let run_id = begin(&history, "web", 1_000);
        assert_eq!(history.list().len(), 1);
        assert_eq!(history.list()[0].run_id, run_id);

        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn identifiers_are_unique_within_a_millisecond() {
        let ids: std::collections::HashSet<String> =
            (0..64).map(|_| new_run_id(1_000)).collect();
        assert!(ids.len() > 1, "identifiers must not all collide");
    }
}
