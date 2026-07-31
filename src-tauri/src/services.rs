use crate::events::{EventSink, NoopEventSink, TauriEventSink};
use crate::history::{History, RunLogWriter, RunOutcome};
use crate::ports::{
    extract_local_urls, find_port_conflicts, port_from_local_url, scan_all_live_ports,
    scan_live_ports, LivePort,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    io::{BufReader, Read},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use sysinfo::{Pid, ProcessRefreshKind, RefreshKind, System};
use tauri::AppHandle;
use ts_rs::TS;

/// Largest line buffered before it is forced out as its own log event.
const MAX_LOG_LINE_BYTES: usize = 8 * 1024;

const STOP_POLL_INTERVAL: Duration = Duration::from_millis(50);
const GRACEFUL_STOP_ATTEMPTS: usize = 30;
const FORCE_STOP_ATTEMPTS: usize = 20;

#[derive(Default)]
pub struct ServiceManager {
    children: Arc<Mutex<HashMap<String, ManagedProcess>>>,
    /// Set once at startup. `None` leaves runs unrecorded but otherwise working.
    history: Mutex<Option<History>>,
}

impl ServiceManager {
    /// Attaches run history. Called during setup, once the application data
    /// directory is known.
    pub fn attach_history(&self, history: History) {
        if let Ok(mut slot) = self.history.lock() {
            *slot = Some(history);
        }
    }

    fn history(&self) -> Option<History> {
        self.history.lock().ok().and_then(|slot| slot.clone())
    }
}

#[derive(Clone)]
struct ManagedProcess {
    child: Arc<Mutex<Child>>,
    cwd: String,
    cmd: String,
    environment: ServiceEnvironment,
    expected_ports: Vec<u16>,
    allow_port_conflicts: bool,
    pid: u32,
    started_at_ms: u128,
    detected_urls: Arc<Mutex<Vec<String>>>,
    /// Present when this run is being recorded.
    run: Option<RunHandle>,
}

/// Ties a live process to its history record.
///
/// Exactly one writer closes a run: the exit watcher. Stopping a service sets
/// `stopping` and lets the watcher record the outcome, because `terminate_child`
/// waits for the process to die and the watcher therefore observes the exit
/// first. Two closers racing would make the recorded outcome a coin toss.
#[derive(Clone)]
struct RunHandle {
    run_id: String,
    log: Arc<RunLogWriter>,
    stopping: Arc<AtomicBool>,
}

#[derive(Clone, Debug, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
pub struct ServiceEnvironmentVariable {
    pub key: String,
    pub value: String,
}

#[derive(Clone, Debug, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
pub struct ServiceEnvironment {
    #[serde(default = "default_true")]
    pub inherit_system: bool,
    #[serde(default)]
    pub vars: Vec<ServiceEnvironmentVariable>,
}

impl Default for ServiceEnvironment {
    fn default() -> Self {
        Self {
            inherit_system: true,
            vars: Vec::new(),
        }
    }
}

fn default_true() -> bool {
    true
}

#[derive(Clone, Debug, Serialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
pub struct ManagedServiceInfo {
    pub service_id: String,
    pub cwd: String,
    pub cmd: String,
    pub pid: u32,
    // Tauri serializes through serde_json, so this arrives as a JSON number.
    #[ts(type = "number")]
    pub started_at_ms: u128,
    // Tauri serializes through serde_json, so this arrives as a JSON number.
    #[ts(type = "number")]
    pub uptime_ms: u128,
    pub cpu_usage: f32,
    // Tauri serializes through serde_json, so this arrives as a JSON number.
    #[ts(type = "number")]
    pub memory_mb: u64,
    pub ports: Vec<u16>,
    pub urls: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "../../src/generated/")]
pub enum ServiceEventKind {
    Starting,
    Started,
    Restarting,
    Stdout,
    Stderr,
    Url,
    Exited,
    Error,
    Stopped,
}

#[derive(Clone, Debug, Serialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
pub struct ServiceEvent {
    pub service_id: String,
    pub kind: ServiceEventKind,
    pub message: String,
    pub pid: Option<u32>,
    pub code: Option<i32>,
}

impl ServiceManager {
    // The parameter list mirrors the start_service IPC payload; grouping it into
    // a struct would only move the same fields behind another name.
    #[allow(clippy::too_many_arguments)]
    pub fn start(
        &self,
        app: AppHandle,
        service_id: String,
        cwd: String,
        cmd: String,
        environment: ServiceEnvironment,
        expected_ports: Vec<u16>,
        allow_port_conflicts: bool,
    ) -> Result<u32, String> {
        self.start_with_sink(
            Arc::new(TauriEventSink(app)),
            service_id,
            cwd,
            cmd,
            environment,
            expected_ports,
            allow_port_conflicts,
        )
    }

    pub fn restart(&self, app: AppHandle, service_id: String) -> Result<u32, String> {
        let sink: Arc<dyn EventSink> = Arc::new(TauriEventSink(app));
        let (cwd, cmd, environment, expected_ports, allow_port_conflicts, pid) = {
            let children = self.children.lock().map_err(|e| e.to_string())?;
            let managed = children
                .get(&service_id)
                .ok_or_else(|| "service is not managed by Localhost Hub".to_string())?;
            (
                managed.cwd.clone(),
                managed.cmd.clone(),
                managed.environment.clone(),
                managed.expected_ports.clone(),
                managed.allow_port_conflicts,
                managed.pid,
            )
        };

        sink.service(ServiceEvent {
            service_id: service_id.clone(),
            kind: ServiceEventKind::Restarting,
            message: "restarting".to_string(),
            pid: Some(pid),
            code: None,
        });
        self.stop_with_sink(sink.clone(), service_id.clone(), false)?;
        self.start_with_sink(
            sink,
            service_id,
            cwd,
            cmd,
            environment,
            expected_ports,
            allow_port_conflicts,
        )
    }

    pub fn stop(&self, app: AppHandle, service_id: String) -> Result<(), String> {
        self.stop_with_sink(
            Arc::new(TauriEventSink(app)),
            service_id,
            true,
        )
    }

    /// Stops every supervised service, for use when Localhost Hub is exiting.
    ///
    /// Without this, exiting orphaned everything Hub had started: the child
    /// processes were reparented to init and carried on serving, so ports stayed
    /// bound with nothing supervising them, and the next launch marked those runs
    /// interrupted while they were in fact still alive. Verified by closing Hub
    /// with three servers running — all three still answered on their ports
    /// afterwards.
    ///
    /// Returns the ids it stopped. Errors are collected per service rather than
    /// aborting: a service that refuses to die must not prevent the rest from
    /// being cleaned up, and by this point the process is leaving anyway.
    ///
    /// Emits nothing, because there is no interface left to receive it.
    pub fn stop_all(&self) -> Vec<String> {
        let ids: Vec<String> = match self.children.lock() {
            Ok(children) => children.keys().cloned().collect(),
            Err(error) => {
                log::warn!("could not enumerate supervised services to stop: {error}");
                return Vec::new();
            }
        };
        let sink: Arc<dyn EventSink> = Arc::new(NoopEventSink);
        let mut stopped = Vec::new();
        for service_id in ids {
            match self.stop_with_sink(sink.clone(), service_id.clone(), false) {
                Ok(()) => stopped.push(service_id),
                Err(error) => log::warn!("could not stop {service_id} while exiting: {error}"),
            }
        }
        stopped
    }

    pub fn list(&self) -> Result<Vec<ManagedServiceInfo>, String> {
        let snapshots = {
            let children = self.children.lock().map_err(|e| e.to_string())?;
            children
                .iter()
                .map(|(service_id, managed)| {
                    (
                        service_id.clone(),
                        managed.cwd.clone(),
                        managed.cmd.clone(),
                        managed.pid,
                        managed.started_at_ms,
                        managed
                            .detected_urls
                            .lock()
                            .map(|urls| urls.clone())
                            .unwrap_or_default(),
                    )
                })
                .collect::<Vec<_>>()
        };

        let mut system = System::new_with_specifics(
            RefreshKind::nothing().with_processes(ProcessRefreshKind::everything()),
        );
        system.refresh_all();
        let live_ports = scan_live_ports();
        let now = now_ms();

        Ok(snapshots
            .into_iter()
            .map(|(service_id, cwd, cmd, pid, started_at_ms, detected_urls)| {
                let process_ids = process_tree_ids(&system, pid);
                let mut ports = live_ports
                    .iter()
                    .filter(|port| {
                        port.pid
                            .map(|pid| process_ids.contains(&Pid::from_u32(pid)))
                            .unwrap_or(false)
                    })
                    .map(|port| port.port)
                    .collect::<Vec<_>>();
                ports.extend(
                    detected_urls
                        .iter()
                        .filter_map(|url| port_from_local_url(url)),
                );
                ports.sort_unstable();
                ports.dedup();
                let mut urls = detected_urls;
                for port in &ports {
                    let fallback = format!("http://localhost:{port}");
                    if !urls
                        .iter()
                        .any(|url| port_from_local_url(url) == Some(*port))
                    {
                        urls.push(fallback);
                    }
                }
                let cpu_usage = process_ids
                    .iter()
                    .filter_map(|pid| system.process(*pid))
                    .map(|process| process.cpu_usage())
                    .sum();
                let memory_mb = process_ids
                    .iter()
                    .filter_map(|pid| system.process(*pid))
                    .map(|process| process.memory())
                    .sum::<u64>()
                    / 1024
                    / 1024;

                ManagedServiceInfo {
                    service_id,
                    cwd,
                    cmd,
                    pid,
                    started_at_ms,
                    uptime_ms: now.saturating_sub(started_at_ms),
                    cpu_usage,
                    memory_mb,
                    ports,
                    urls,
                }
            })
            .collect())
    }

    pub fn is_running(&self, service_id: &str) -> Result<bool, String> {
        let children = self.children.lock().map_err(|e| e.to_string())?;
        let Some(managed) = children.get(service_id) else {
            return Ok(false);
        };
        let mut child = managed.child.lock().map_err(|e| e.to_string())?;
        Ok(matches!(child.try_wait(), Ok(None)))
    }

    pub fn is_managed(&self, service_id: &str) -> Result<bool, String> {
        Ok(self
            .children
            .lock()
            .map_err(|e| e.to_string())?
            .contains_key(service_id))
    }

    pub fn owns_listening_ports(
        &self,
        service_id: &str,
        expected_ports: &[u16],
    ) -> Result<bool, String> {
        if expected_ports.is_empty() {
            return Ok(true);
        }
        let pid = self
            .children
            .lock()
            .map_err(|error| error.to_string())?
            .get(service_id)
            .map(|managed| managed.pid)
            .ok_or_else(|| "service is not managed by Localhost Hub".to_string())?;
        let mut system = System::new_with_specifics(
            RefreshKind::nothing().with_processes(ProcessRefreshKind::everything()),
        );
        system.refresh_all();
        let process_ids = process_tree_ids(&system, pid);
        let owned_ports = scan_all_live_ports()
            .into_iter()
            .filter(|port| {
                port.pid
                    .map(|pid| process_ids.contains(&Pid::from_u32(pid)))
                    .unwrap_or(false)
            })
            .map(|port| port.port)
            .collect::<HashSet<_>>();
        Ok(expected_ports
            .iter()
            .all(|port| owned_ports.contains(port)))
    }

    // The parameter list mirrors the start_service IPC payload; grouping it into
    // a struct would only move the same fields behind another name.
    #[allow(clippy::too_many_arguments)]
    pub(crate) fn start_with_sink(
        &self,
        sink: Arc<dyn EventSink>,
        service_id: String,
        cwd: String,
        cmd: String,
        environment: ServiceEnvironment,
        mut expected_ports: Vec<u16>,
        allow_port_conflicts: bool,
    ) -> Result<u32, String> {
        if service_id.trim().is_empty() {
            return Err("service id cannot be empty".to_string());
        }
        if cmd.trim().is_empty() {
            return Err("service command cannot be empty".to_string());
        }
        if !std::path::Path::new(&cwd).is_dir() {
            return Err(format!("service directory does not exist: {cwd}"));
        }
        validate_environment(&environment)?;
        expected_ports.retain(|port| *port > 0);
        expected_ports.sort_unstable();
        expected_ports.dedup();

        {
            let mut children = self.children.lock().map_err(|e| e.to_string())?;
            let stale = if let Some(existing) = children.get(&service_id) {
                let mut child = existing.child.lock().map_err(|e| e.to_string())?;
                match child.try_wait() {
                    Ok(None) => return Err("service is already running".to_string()),
                    Ok(Some(_)) | Err(_) => true,
                }
            } else {
                false
            };
            if stale {
                children.remove(&service_id);
            }
        }

        if !allow_port_conflicts {
            ensure_ports_available(&expected_ports)?;
        }

        sink.service(ServiceEvent {
            service_id: service_id.clone(),
            kind: ServiceEventKind::Starting,
            message: format!("starting `{cmd}`"),
            pid: None,
            code: None,
        });

        let mut command = shell_command(&cmd, environment.inherit_system);
        if !environment.inherit_system {
            command.env_clear();
            for (key, value) in baseline_environment() {
                command.env(key, value);
            }
        }
        for variable in &environment.vars {
            command.env(&variable.key, &variable.value);
        }
        command
            .current_dir(&cwd)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        configure_process_group(&mut command);

        let mut child = command
            .spawn()
            .map_err(|error| format!("failed to start `{cmd}` in {cwd}: {error}"))?;

        let pid = child.id();
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let child = Arc::new(Mutex::new(child));
        let started_at_ms = now_ms();
        let detected_urls = Arc::new(Mutex::new(Vec::new()));

        // Recorded only after a successful spawn, so the history holds runs that
        // really started. A failure here leaves `run` as None and the service
        // unaffected.
        let history = self.history();
        let run = history.as_ref().and_then(|history| {
            let run_id = crate::history::new_run_id(started_at_ms);
            history
                .begin_run(
                    run_id.clone(),
                    service_id.clone(),
                    cwd.clone(),
                    cmd.clone(),
                    pid,
                    started_at_ms,
                )
                .map(|log| RunHandle {
                    run_id,
                    log,
                    stopping: Arc::new(AtomicBool::new(false)),
                })
        });

        self.children
            .lock()
            .map_err(|e| e.to_string())?
            .insert(
                service_id.clone(),
                ManagedProcess {
                    child: child.clone(),
                    cwd,
                    cmd: cmd.clone(),
                    environment,
                    expected_ports,
                    allow_port_conflicts,
                    pid,
                    started_at_ms,
                    detected_urls: detected_urls.clone(),
                    run: run.clone(),
                },
            );

        sink.service(ServiceEvent {
            service_id: service_id.clone(),
            kind: ServiceEventKind::Started,
            message: format!("started `{cmd}`"),
            pid: Some(pid),
            code: None,
        });

        if let Some(stdout) = stdout {
            spawn_reader(
                sink.clone(),
                service_id.clone(),
                stdout,
                ServiceEventKind::Stdout,
                detected_urls.clone(),
                run.as_ref().map(|run| run.log.clone()),
            );
        }
        if let Some(stderr) = stderr {
            spawn_reader(
                sink.clone(),
                service_id.clone(),
                stderr,
                ServiceEventKind::Stderr,
                detected_urls,
                run.as_ref().map(|run| run.log.clone()),
            );
        }

        spawn_exit_watcher(sink, self.children.clone(), service_id, child, pid, history, run);
        Ok(pid)
    }

    pub(crate) fn stop_with_sink(
        &self,
        sink: Arc<dyn EventSink>,
        service_id: String,
        emit_stopped: bool,
    ) -> Result<(), String> {
        let managed = self
            .children
            .lock()
            .map_err(|e| e.to_string())?
            .remove(&service_id)
            .ok_or_else(|| "service is not managed by Localhost Hub".to_string())?;

        // Announced before terminating, so the exit watcher knows the exit it is
        // about to observe was deliberate.
        if let Some(run) = &managed.run {
            run.stopping.store(true, Ordering::SeqCst);
        }

        let result = {
            let mut child = managed.child.lock().map_err(|e| e.to_string())?;
            terminate_child(&mut child)
        };

        if let Err(error) = result {
            // Still running after all, so withdraw the claim.
            if let Some(run) = &managed.run {
                run.stopping.store(false, Ordering::SeqCst);
            }
            self.children
                .lock()
                .map_err(|e| e.to_string())?
                .insert(service_id, managed);
            return Err(error);
        }

        if emit_stopped {
            sink.service(ServiceEvent {
                service_id,
                kind: ServiceEventKind::Stopped,
                message: "stopped".to_string(),
                pid: Some(managed.pid),
                code: None,
            });
        }
        Ok(())
    }

    #[cfg(test)]
    fn start_for_test(
        &self,
        sink: Arc<dyn EventSink>,
        service_id: &str,
        cwd: &str,
        cmd: &str,
    ) -> Result<u32, String> {
        self.start_with_sink(
            sink,
            service_id.to_string(),
            cwd.to_string(),
            cmd.to_string(),
            ServiceEnvironment::default(),
            Vec::new(),
            false,
        )
    }

    #[cfg(test)]
    fn restart_for_test(
        &self,
        sink: Arc<dyn EventSink>,
        service_id: &str,
    ) -> Result<u32, String> {
        let (cwd, cmd, environment, expected_ports, allow_port_conflicts, pid) = {
            let children = self.children.lock().map_err(|e| e.to_string())?;
            let managed = children
                .get(service_id)
                .ok_or_else(|| "service is not managed by Localhost Hub".to_string())?;
            (
                managed.cwd.clone(),
                managed.cmd.clone(),
                managed.environment.clone(),
                managed.expected_ports.clone(),
                managed.allow_port_conflicts,
                managed.pid,
            )
        };
        sink.service(ServiceEvent {
            service_id: service_id.to_string(),
            kind: ServiceEventKind::Restarting,
            message: "restarting".to_string(),
            pid: Some(pid),
            code: None,
        });
        self.stop_with_sink(sink.clone(), service_id.to_string(), false)?;
        self.start_with_sink(
            sink,
            service_id.to_string(),
            cwd,
            cmd,
            environment,
            expected_ports,
            allow_port_conflicts,
        )
    }

    #[cfg(test)]
    fn stop_for_test(
        &self,
        sink: Arc<dyn EventSink>,
        service_id: &str,
    ) -> Result<(), String> {
        self.stop_with_sink(sink, service_id.to_string(), true)
    }
}

fn ensure_ports_available(expected_ports: &[u16]) -> Result<(), String> {
    let conflicts = find_port_conflicts(expected_ports);
    if conflicts.is_empty() {
        return Ok(());
    }
    Err(format_port_conflicts(&conflicts))
}

fn format_port_conflicts(conflicts: &[LivePort]) -> String {
    let details = conflicts
        .iter()
        .map(|conflict| {
            let owner = match (&conflict.process_name, conflict.pid) {
                (Some(name), Some(pid)) => format!("{name} (PID {pid})"),
                (Some(name), None) => name.clone(),
                (None, Some(pid)) => format!("PID {pid}"),
                (None, None) => "an unknown process".to_string(),
            };
            format!(
                "{} is already used by {} on {}",
                conflict.port, owner, conflict.bind_address
            )
        })
        .collect::<Vec<_>>()
        .join("; ");
    format!("Port conflict: {details}. Stop the owning process or explicitly start anyway.")
}

fn validate_environment(environment: &ServiceEnvironment) -> Result<(), String> {
    let mut seen = HashSet::new();
    for variable in &environment.vars {
        if variable.key.is_empty() {
            return Err("environment variable key cannot be empty".to_string());
        }
        if variable.key.contains('=') || variable.key.contains('\0') {
            return Err(format!(
                "environment variable key contains an invalid character: {}",
                variable.key
            ));
        }
        if variable.value.contains('\0') {
            return Err(format!(
                "environment variable value contains a null byte: {}",
                variable.key
            ));
        }
        if !seen.insert(variable.key.clone()) {
            return Err(format!(
                "environment variable key is duplicated: {}",
                variable.key
            ));
        }
    }
    Ok(())
}

/// Variables kept when a profile asks not to inherit the system environment.
///
/// A truly empty environment is not useful: without `PATH` the shell cannot find
/// any external program, so every real command fails. These are the variables a
/// shell and ordinary developer tooling need in order to function at all —
/// deliberately narrow, and never anything project- or secret-shaped.
#[cfg(unix)]
const BASELINE_ENVIRONMENT_KEYS: &[&str] = &["PATH", "HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "TZ", "LANG"];

#[cfg(windows)]
const BASELINE_ENVIRONMENT_KEYS: &[&str] = &[
    "PATH",
    "PATHEXT",
    "SYSTEMROOT",
    "SYSTEMDRIVE",
    "WINDIR",
    "COMSPEC",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "NUMBER_OF_PROCESSORS",
    "PROCESSOR_ARCHITECTURE",
];

/// A `PATH` to fall back on when the parent process has none, so a non-inheriting
/// profile still resolves ordinary system binaries.
#[cfg(unix)]
const FALLBACK_PATH: &str = "/usr/local/bin:/usr/bin:/bin";

fn baseline_environment() -> Vec<(String, String)> {
    let mut baseline = Vec::new();
    for key in BASELINE_ENVIRONMENT_KEYS {
        // Windows environment names are case-insensitive but `var` is not, so try
        // the canonical spelling first and fall back to a case-insensitive match.
        let value = std::env::var(key).ok().or_else(|| {
            std::env::vars().find_map(|(name, value)| name.eq_ignore_ascii_case(key).then_some(value))
        });
        if let Some(value) = value {
            if !value.is_empty() {
                baseline.push(((*key).to_string(), value));
            }
        }
    }
    #[cfg(unix)]
    if !baseline.iter().any(|(key, _)| key == "PATH") {
        baseline.push(("PATH".to_string(), FALLBACK_PATH.to_string()));
    }
    baseline
}

/// Builds the shell invocation for a service command.
///
/// `inherit_system` decides whether this is a *login* shell. That matters more
/// than it looks: `sh -l` sources `/etc/profile` and the user's profile, which
/// re-export `PATH` and version-manager shims. That is what makes an inheriting
/// profile pick up nvm, rbenv, and friends — and it is also why pairing `-l`
/// with a cleared environment could not deliver isolation, since the profile put
/// the user's environment straight back. A non-inheriting profile therefore uses
/// a plain `sh -c` over an explicit baseline, so what a service sees is
/// predictable rather than dependent on the user's dotfiles.
#[cfg(unix)]
fn shell_command(command: &str, inherit_system: bool) -> Command {
    let mut shell = Command::new("sh");
    shell.args([if inherit_system { "-lc" } else { "-c" }, command]);
    shell
}

/// `cmd /S /C` does not source any profile, so the inheriting and
/// non-inheriting forms are identical on Windows.
#[cfg(windows)]
fn shell_command(command: &str, _inherit_system: bool) -> Command {
    let mut shell = Command::new("cmd");
    shell.args(["/S", "/C", command]);
    shell
}

#[cfg(unix)]
fn configure_process_group(command: &mut Command) {
    use std::os::unix::process::CommandExt;
    command.process_group(0);
}

#[cfg(windows)]
fn configure_process_group(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
    command.creation_flags(CREATE_NEW_PROCESS_GROUP);
}

fn terminate_child(child: &mut Child) -> Result<(), String> {
    if child.try_wait().map_err(|error| error.to_string())?.is_some() {
        return Ok(());
    }

    #[cfg(unix)]
    {
        if signal_unix_process_group(child.id(), "TERM")?
            && wait_for_exit(child, GRACEFUL_STOP_ATTEMPTS)? {
                return Ok(());
            }
        signal_unix_process_group(child.id(), "KILL")?;
        if wait_for_exit(child, FORCE_STOP_ATTEMPTS)? {
            return Ok(());
        }
        Err(format!("process group {} did not stop", child.id()))
    }

    #[cfg(windows)]
    {
        let status = Command::new("taskkill")
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .status()
            .map_err(|error| error.to_string())?;
        if !status.success() {
            return Err(format!("taskkill failed for PID {}", child.id()));
        }
        if wait_for_exit(child, FORCE_STOP_ATTEMPTS)? {
            return Ok(());
        }
        return Err(format!("process tree {} did not stop", child.id()));
    }
}

#[cfg(unix)]
fn signal_unix_process_group(pid: u32, signal: &str) -> Result<bool, String> {
    let process_group = format!("-{pid}");
    let status = Command::new("kill")
        .arg(format!("-{signal}"))
        .arg("--")
        .arg(process_group)
        .status()
        .map_err(|error| error.to_string())?;
    Ok(status.success())
}

fn wait_for_exit(child: &mut Child, attempts: usize) -> Result<bool, String> {
    for _ in 0..attempts {
        if child
            .try_wait()
            .map_err(|error| error.to_string())?
            .is_some()
        {
            return Ok(true);
        }
        std::thread::sleep(STOP_POLL_INTERVAL);
    }
    Ok(false)
}

/// Rejects process identifiers that no process can have.
///
/// This is not an authorization check — killing a process Hub did not start is the
/// point of the Ports view's kill action. It is a check that the number is a
/// process identifier at all, because two of them are aliases for something much
/// larger:
///
/// - `0` means "every process in my own process group" to `kill(2)`.
/// - `1` is init.
/// - Anything above `i32::MAX` truncates when it becomes a `pid_t`. `4294967295`
///   becomes `-1`, and `kill(-1, …)` signals *every process the caller may
///   signal*. `/bin/kill` accepts it and reports success.
///
/// Both `kill_process` and workspace stop specifications carry a caller-supplied
/// pid across the IPC boundary, so this is reachable from the interface rather
/// than only from Hub's own bookkeeping.
fn validate_pid(pid: u32) -> Result<(), String> {
    if pid <= 1 || pid > i32::MAX as u32 {
        return Err(format!("{pid} is not a valid process identifier"));
    }
    Ok(())
}

pub fn terminate_process_tree(pid: u32) -> Result<(), String> {
    validate_pid(pid)?;

    #[cfg(unix)]
    {
        if signal_unix_process_group(pid, "TERM")? {
            return Ok(());
        }
        let status = Command::new("kill")
            .args(["-TERM", "--", &pid.to_string()])
            .status()
            .map_err(|error| error.to_string())?;
        if status.success() {
            return Ok(());
        }
        Err(format!("failed to terminate PID {pid}"))
    }

    #[cfg(windows)]
    {
        let status = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .status()
            .map_err(|error| error.to_string())?;
        if status.success() {
            return Ok(());
        }
        return Err(format!("failed to terminate PID {pid}"));
    }
}

fn spawn_reader<R>(
    sink: Arc<dyn EventSink>,
    service_id: String,
    reader: R,
    kind: ServiceEventKind,
    detected_urls: Arc<Mutex<Vec<String>>>,
    log: Option<Arc<RunLogWriter>>,
) where
    R: std::io::Read + Send + 'static,
{
    std::thread::spawn(move || {
        let mut reader = BufReader::new(reader);
        let mut line: Vec<u8> = Vec::new();
        let mut chunk = [0u8; 4096];
        // A carriage return only terminates a line once we know what follows it:
        // in `\r\n` the pair is one terminator, while a bare `\r` is a progress
        // bar redrawing. Deferring the decision keeps blank CRLF lines intact.
        let mut saw_carriage_return = false;

        loop {
            let read = match reader.read(&mut chunk) {
                Ok(0) => break,
                Ok(read) => read,
                // A signal interrupting the read is not a stream failure.
                Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
                Err(error) => {
                    sink.service(ServiceEvent {
                        service_id: service_id.clone(),
                        kind: ServiceEventKind::Stderr,
                        message: format!("failed to read process output: {error}"),
                        pid: None,
                        code: None,
                    });
                    break;
                }
            };

            for &byte in &chunk[..read] {
                if saw_carriage_return {
                    saw_carriage_return = false;
                    emit_log_line(&sink, &service_id, &kind, &detected_urls, &log, &mut line);
                    if byte == b'\n' {
                        continue;
                    }
                }
                match byte {
                    b'\r' => saw_carriage_return = true,
                    b'\n' => {
                        emit_log_line(&sink, &service_id, &kind, &detected_urls, &log, &mut line)
                    }
                    _ => {
                        line.push(byte);
                        // Flush rather than buffer without bound: some tools emit
                        // very long single lines, and progress output may never
                        // send a terminator at all.
                        if line.len() >= MAX_LOG_LINE_BYTES {
                            emit_log_line(&sink, &service_id, &kind, &detected_urls, &log, &mut line);
                        }
                    }
                }
            }
        }

        // Surface whatever the process wrote without a trailing terminator.
        if !line.is_empty() {
            emit_log_line(&sink, &service_id, &kind, &detected_urls, &log, &mut line);
        }
    });
}

/// Emits one log line and drains the buffer.
///
/// Decodes lossily on purpose: invalid UTF-8 becomes replacement characters
/// instead of ending the stream, which is what `BufRead::lines` did — a service
/// emitting one non-UTF-8 byte would go silent for the rest of its life while
/// still running.
fn emit_log_line(
    sink: &Arc<dyn EventSink>,
    service_id: &str,
    kind: &ServiceEventKind,
    detected_urls: &Arc<Mutex<Vec<String>>>,
    log: &Option<Arc<RunLogWriter>>,
    line: &mut Vec<u8>,
) {
    let message = String::from_utf8_lossy(line).into_owned();
    line.clear();

    // Persisted before emitting, so a line the interface shows is a line the
    // history has, not the other way round.
    if let Some(log) = log {
        log.append(&message);
    }

    for url in extract_local_urls(&message) {
        let is_new = detected_urls
            .lock()
            .map(|mut urls| {
                if urls.contains(&url) {
                    false
                } else {
                    urls.push(url.clone());
                    true
                }
            })
            .unwrap_or(false);
        if is_new {
            sink.service(ServiceEvent {
                service_id: service_id.to_string(),
                kind: ServiceEventKind::Url,
                message: url,
                pid: None,
                code: None,
            });
        }
    }

    sink.service(ServiceEvent {
        service_id: service_id.to_string(),
        kind: kind.clone(),
        message,
        pid: None,
        code: None,
    });
}

fn process_tree_ids(system: &System, root_pid: u32) -> HashSet<Pid> {
    let root = Pid::from_u32(root_pid);
    system
        .processes()
        .keys()
        .copied()
        .filter(|candidate| is_descendant_or_self(system, *candidate, root))
        .collect()
}

fn is_descendant_or_self(system: &System, candidate: Pid, root: Pid) -> bool {
    let mut current = Some(candidate);
    let mut visited = HashSet::new();
    while let Some(pid) = current {
        if pid == root {
            return true;
        }
        if !visited.insert(pid) {
            return false;
        }
        current = system.process(pid).and_then(|process| process.parent());
    }
    false
}

#[allow(clippy::too_many_arguments)]
fn spawn_exit_watcher(
    sink: Arc<dyn EventSink>,
    children: Arc<Mutex<HashMap<String, ManagedProcess>>>,
    service_id: String,
    child: Arc<Mutex<Child>>,
    pid: u32,
    history: Option<History>,
    run: Option<RunHandle>,
) {
    std::thread::spawn(move || loop {
        let status = {
            let mut child = match child.lock() {
                Ok(child) => child,
                Err(error) => {
                    sink.service(ServiceEvent {
                        service_id: service_id.clone(),
                        kind: ServiceEventKind::Error,
                        message: error.to_string(),
                        pid: Some(pid),
                        code: None,
                    });
                    break;
                }
            };
            match child.try_wait() {
                Ok(Some(status)) => Some(Ok(status.code())),
                Ok(None) => None,
                Err(error) => Some(Err(error.to_string())),
            }
        };

        match status {
            Some(Ok(code)) => {
                let should_emit = children
                    .lock()
                    .map(|mut children| remove_if_current(&mut children, &service_id, pid))
                    .unwrap_or(true);
                // Closed regardless of `should_emit`: a restart supersedes the
                // event but the finished run still needs its outcome recorded.
                let stopped_deliberately = run
                    .as_ref()
                    .map(|run| run.stopping.load(Ordering::SeqCst))
                    .unwrap_or(false);
                let outcome = if stopped_deliberately {
                    RunOutcome::Stopped
                } else if code.unwrap_or(0) == 0 {
                    // A process reporting no code was terminated by a signal,
                    // which for our purposes is an ordinary exit.
                    RunOutcome::Exited
                } else {
                    RunOutcome::Failed
                };
                // A stop's exit status is an artefact of the signal, not a result.
                let recorded_code = if stopped_deliberately { None } else { code };
                finish_run(&history, &run, outcome, recorded_code);
                if should_emit {
                    sink.service(ServiceEvent {
                        service_id,
                        kind: ServiceEventKind::Exited,
                        message: format!(
                            "exited with code {}",
                            code.map_or_else(|| "signal".to_string(), |code| code.to_string())
                        ),
                        pid: Some(pid),
                        code,
                    });
                }
                break;
            }
            Some(Err(message)) => {
                let should_emit = children
                    .lock()
                    .map(|mut children| remove_if_current(&mut children, &service_id, pid))
                    .unwrap_or(true);
                finish_run(&history, &run, RunOutcome::Failed, None);
                if should_emit {
                    sink.service(ServiceEvent {
                        service_id,
                        kind: ServiceEventKind::Error,
                        message,
                        pid: Some(pid),
                        code: None,
                    });
                }
                break;
            }
            None => std::thread::sleep(Duration::from_millis(100)),
        }
    });
}

/// Closes a run's log and records its outcome. A no-op when the run was never
/// recorded, which is the case whenever history is unavailable.
fn finish_run(
    history: &Option<History>,
    run: &Option<RunHandle>,
    outcome: RunOutcome,
    exit_code: Option<i32>,
) {
    let (Some(history), Some(run)) = (history, run) else {
        return;
    };
    run.log.finish();
    history.end_run(&run.run_id, outcome, exit_code, now_ms(), run.log.is_truncated());
}

fn remove_if_current(
    children: &mut HashMap<String, ManagedProcess>,
    service_id: &str,
    pid: u32,
) -> bool {
    let matches_current = children
        .get(service_id)
        .map(|managed| managed.pid == pid)
        .unwrap_or(false);
    if matches_current {
        children.remove(service_id);
    }
    matches_current
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::time::Instant;

    /// `kill_process` and workspace stop specifications both carry a pid across the
    /// IPC boundary, and three values are not process identifiers but broadcast
    /// targets. `4294967295` is the dangerous one: it truncates to `-1`, which
    /// `kill(2)` reads as every process the caller may signal, and `/bin/kill`
    /// accepts it and reports success rather than failing.
    #[test]
    fn identifiers_that_are_not_processes_are_refused() {
        for pid in [0, 1, i32::MAX as u32 + 1, u32::MAX] {
            let error = terminate_process_tree(pid)
                .expect_err("should be refused before any signal is sent");
            assert!(
                error.contains("not a valid process identifier"),
                "unexpected error for {pid}: {error}"
            );
        }
    }

    #[test]
    fn a_plausible_identifier_passes_validation() {
        // Validation only; this pid is this test process, which is certainly real.
        assert!(validate_pid(std::process::id()).is_ok());
    }

    #[derive(Default)]
    struct TestSink {
        events: Mutex<Vec<ServiceEvent>>,
    }

    impl EventSink for TestSink {
        fn service(&self, event: ServiceEvent) {
            self.events.lock().expect("events").push(event);
        }

        fn workspace(&self, _event: crate::workspace::WorkspaceEvent) {}
    }

    impl TestSink {
        fn has(&self, kind: ServiceEventKind) -> bool {
            self.events
                .lock()
                .expect("events")
                .iter()
                .any(|event| event.kind == kind)
        }

        fn messages(&self, kind: ServiceEventKind) -> Vec<String> {
            self.events
                .lock()
                .expect("events")
                .iter()
                .filter(|event| event.kind == kind)
                .map(|event| event.message.clone())
                .collect()
        }
    }

    fn wait_until(predicate: impl Fn() -> bool) {
        let started = Instant::now();
        while !predicate() && started.elapsed() < Duration::from_secs(5) {
            std::thread::sleep(Duration::from_millis(25));
        }
        assert!(predicate(), "condition was not reached before timeout");
    }

    /// Drives spawn_reader directly over a fixed byte stream and returns the
    /// messages it produced for `kind`.
    fn read_all(bytes: &[u8], kind: ServiceEventKind, expected: usize) -> Vec<String> {
        let sink = Arc::new(TestSink::default());
        let urls = Arc::new(Mutex::new(Vec::new()));
        spawn_reader(
            sink.clone(),
            "reader".to_string(),
            std::io::Cursor::new(bytes.to_vec()),
            kind.clone(),
            urls,
            None,
        );
        // A Cursor hits EOF immediately so the total is deterministic; waiting
        // for `expected` avoids sampling a partially-drained stream.
        wait_until(|| sink.messages(kind.clone()).len() >= expected);
        sink.messages(kind)
    }

    #[test]
    fn invalid_utf8_does_not_end_the_log_stream() {
        // `BufRead::lines` yields Err here and the old reader broke out of its
        // loop, so a service went silent for the rest of its life.
        let bytes = b"before\n\xff\xfe invalid\nafter\n";
        let messages = read_all(bytes, ServiceEventKind::Stdout, 3);

        assert_eq!(messages.len(), 3, "got {messages:?}");
        assert_eq!(messages[0], "before");
        assert!(messages[1].contains("invalid"));
        assert!(messages[1].contains('\u{fffd}'), "expected replacement chars");
        assert_eq!(messages[2], "after");
    }

    #[test]
    fn carriage_return_progress_output_streams_line_by_line() {
        // Progress bars redraw with a bare `\r` and never send a newline, so the
        // old reader buffered the whole run as one unterminated line.
        let messages = read_all(b"25%\r50%\r100%\n", ServiceEventKind::Stdout, 3);
        assert_eq!(messages, vec!["25%", "50%", "100%"]);
    }

    #[test]
    fn crlf_is_one_terminator_and_blank_lines_survive() {
        let messages = read_all(b"first\r\n\r\nsecond\n\n", ServiceEventKind::Stdout, 4);
        assert_eq!(messages, vec!["first", "", "second", ""]);
    }

    #[test]
    fn output_without_a_trailing_newline_is_still_emitted() {
        let messages = read_all(b"no trailing newline", ServiceEventKind::Stdout, 1);
        assert_eq!(messages, vec!["no trailing newline"]);
    }

    #[test]
    fn an_overlong_line_is_flushed_instead_of_buffered_without_bound() {
        let long = vec![b'x'; MAX_LOG_LINE_BYTES + 32];
        let messages = read_all(&long, ServiceEventKind::Stdout, 2);

        assert_eq!(messages.len(), 2, "expected a forced flush then the remainder");
        assert_eq!(messages[0].len(), MAX_LOG_LINE_BYTES);
        assert_eq!(messages[1].len(), 32);
    }

    #[test]
    fn urls_are_detected_across_carriage_return_boundaries() {
        let sink = Arc::new(TestSink::default());
        let urls = Arc::new(Mutex::new(Vec::new()));
        spawn_reader(
            sink.clone(),
            "reader".to_string(),
            std::io::Cursor::new(b"ready on http://localhost:4321/\r".to_vec()),
            ServiceEventKind::Stdout,
            urls.clone(),
            None,
        );
        wait_until(|| !sink.messages(ServiceEventKind::Url).is_empty());

        assert_eq!(
            sink.messages(ServiceEventKind::Url),
            vec!["http://localhost:4321/"]
        );
    }

    fn history_dir(label: &str) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!(
            "localhost-hub-svc-history-{label}-{}-{}",
            std::process::id(),
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    /// End-to-end: the unit tests in `history` prove the store works, this proves
    /// the service lifecycle is actually wired to it.
    #[test]
    fn a_completed_run_and_its_output_are_recorded() {
        let dir = history_dir("recorded");
        let manager = ServiceManager::default();
        manager.attach_history(History::new(&dir));
        let sink = Arc::new(TestSink::default());

        manager
            .start_for_test(sink.clone(), "recorded", "/tmp", "printf 'hello from the run\\n'")
            .expect("start");
        wait_until(|| sink.has(ServiceEventKind::Exited));

        let history = History::new(&dir);
        // The exit watcher writes the outcome from its own thread.
        wait_until(|| {
            history
                .list()
                .first()
                .map(|record| record.outcome != crate::history::RunOutcome::Running)
                .unwrap_or(false)
        });

        let records = history.list();
        assert_eq!(records.len(), 1, "one run should be recorded: {records:?}");
        let record = &records[0];
        assert_eq!(record.service_id, "recorded");
        assert_eq!(record.cwd, "/tmp");
        assert_eq!(record.outcome, crate::history::RunOutcome::Exited);
        assert_eq!(record.exit_code, Some(0));
        assert!(record.ended_at_ms.is_some());

        let log = history.read_log(&record.run_id, 100).expect("log");
        assert!(
            log.lines.iter().any(|line| line == "hello from the run"),
            "the run's output should be persisted: {:?}",
            log.lines
        );

        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_failing_run_is_recorded_as_failed_with_its_status() {
        let dir = history_dir("failed");
        let manager = ServiceManager::default();
        manager.attach_history(History::new(&dir));
        let sink = Arc::new(TestSink::default());

        manager
            .start_for_test(sink.clone(), "failing", "/tmp", "exit 3")
            .expect("start");
        wait_until(|| sink.has(ServiceEventKind::Exited));

        let history = History::new(&dir);
        wait_until(|| {
            history
                .list()
                .first()
                .map(|record| record.outcome == crate::history::RunOutcome::Failed)
                .unwrap_or(false)
        });
        assert_eq!(history.list()[0].exit_code, Some(3));

        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn stopping_records_a_stop_rather_than_the_exit_it_causes() {
        let dir = history_dir("stopped");
        let manager = ServiceManager::default();
        manager.attach_history(History::new(&dir));
        let sink = Arc::new(TestSink::default());

        manager
            .start_for_test(sink.clone(), "long", "/tmp", "sleep 30")
            .expect("start");
        manager.stop_for_test(sink.clone(), "long").expect("stop");

        let history = History::new(&dir);
        wait_until(|| {
            history
                .list()
                .first()
                .map(|record| record.outcome != crate::history::RunOutcome::Running)
                .unwrap_or(false)
        });

        // Give the exit watcher a chance to try overwriting it.
        std::thread::sleep(Duration::from_millis(400));
        assert_eq!(
            history.list()[0].outcome,
            crate::history::RunOutcome::Stopped,
            "the deliberate stop must survive the exit it triggered"
        );

        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_service_runs_normally_when_history_is_unavailable() {
        // No history attached: runs must be unaffected, just unrecorded.
        let manager = ServiceManager::default();
        let sink = Arc::new(TestSink::default());
        manager
            .start_for_test(sink.clone(), "unrecorded", "/tmp", "printf 'still works\\n'")
            .expect("start");
        wait_until(|| sink.has(ServiceEventKind::Stdout));
        wait_until(|| sink.has(ServiceEventKind::Exited));
        assert!(sink
            .messages(ServiceEventKind::Stdout)
            .iter()
            .any(|message| message == "still works"));
    }

    #[test]
    fn streams_output_and_removes_exited_service() {
        let manager = ServiceManager::default();
        let sink = Arc::new(TestSink::default());
        manager
            .start_for_test(sink.clone(), "quick", "/tmp", "printf 'hello\\n'")
            .expect("start");

        wait_until(|| sink.has(ServiceEventKind::Stdout));
        wait_until(|| sink.has(ServiceEventKind::Exited));
        assert!(manager.list().expect("list").is_empty());
    }

    #[test]
    fn refuses_a_duplicate_running_service() {
        let manager = ServiceManager::default();
        let sink = Arc::new(TestSink::default());
        manager
            .start_for_test(sink.clone(), "duplicate", "/tmp", "sleep 10")
            .expect("start");
        let error = manager
            .start_for_test(sink.clone(), "duplicate", "/tmp", "sleep 10")
            .expect_err("duplicate should fail");
        assert!(error.contains("already running"));
        manager
            .stop_for_test(sink, "duplicate")
            .expect("cleanup");
    }

    #[test]
    fn captures_local_urls_from_service_output() {
        let manager = ServiceManager::default();
        let sink = Arc::new(TestSink::default());
        manager
            .start_for_test(
                sink.clone(),
                "url",
                "/tmp",
                "printf '\\033[32mLocal: http://0.0.0.0:4567/\\033[0m\\n'; sleep 10",
            )
            .expect("start");

        wait_until(|| sink.has(ServiceEventKind::Url));
        assert_eq!(
            sink.messages(ServiceEventKind::Url),
            vec!["http://localhost:4567/"]
        );
        let service = manager.list().expect("list").remove(0);
        assert_eq!(service.ports, vec![4567]);
        assert_eq!(service.urls, vec!["http://localhost:4567/"]);
        manager.stop_for_test(sink, "url").expect("cleanup");
    }

    #[test]
    fn stop_terminates_and_removes_service() {
        let manager = ServiceManager::default();
        let sink = Arc::new(TestSink::default());
        manager
            .start_for_test(sink.clone(), "stop", "/tmp", "sleep 10")
            .expect("start");
        manager
            .stop_for_test(sink.clone(), "stop")
            .expect("stop");
        assert!(sink.has(ServiceEventKind::Stopped));
        assert!(manager.list().expect("list").is_empty());
    }

    #[test]
    fn restart_replaces_the_process_without_losing_configuration() {
        let manager = ServiceManager::default();
        let sink = Arc::new(TestSink::default());
        let original_pid = manager
            .start_for_test(sink.clone(), "restart", "/tmp", "sleep 10")
            .expect("start");
        let restarted_pid = manager
            .restart_for_test(sink.clone(), "restart")
            .expect("restart");

        assert_ne!(original_pid, restarted_pid);
        assert!(sink.has(ServiceEventKind::Restarting));
        let services = manager.list().expect("list");
        assert_eq!(services.len(), 1);
        assert_eq!(services[0].cmd, "sleep 10");
        manager
            .stop_for_test(sink, "restart")
            .expect("cleanup");
    }

    /// Runs `cmd` under the given inheritance mode and returns its stdout lines.
    fn run_with_inheritance(
        service_id: &str,
        cmd: &str,
        inherit_system: bool,
        vars: Vec<ServiceEnvironmentVariable>,
    ) -> Vec<String> {
        let manager = ServiceManager::default();
        let sink = Arc::new(TestSink::default());
        manager
            .start_with_sink(
                sink.clone(),
                service_id.to_string(),
                "/tmp".to_string(),
                cmd.to_string(),
                ServiceEnvironment {
                    inherit_system,
                    vars,
                },
                Vec::new(),
                false,
            )
            .expect("start");
        wait_until(|| sink.has(ServiceEventKind::Exited));
        sink.messages(ServiceEventKind::Stdout)
    }

    #[test]
    fn a_non_inheriting_profile_hides_the_parent_environment() {
        // Safety: single-threaded within this test's own key, and the value is
        // only read by the child process it launches.
        std::env::set_var("LOCALHOST_HUB_LEAK_PROBE", "leaked");

        let messages = run_with_inheritance(
            "isolated",
            "printf '%s\\n' \"${LOCALHOST_HUB_LEAK_PROBE:-absent}\"",
            false,
            Vec::new(),
        );

        assert!(
            messages.iter().any(|message| message == "absent"),
            "parent variable leaked into a non-inheriting profile: {messages:?}"
        );
        std::env::remove_var("LOCALHOST_HUB_LEAK_PROBE");
    }

    #[test]
    fn an_inheriting_profile_still_sees_the_parent_environment() {
        std::env::set_var("LOCALHOST_HUB_INHERIT_PROBE", "inherited");

        let messages = run_with_inheritance(
            "inheriting",
            "printf '%s\\n' \"${LOCALHOST_HUB_INHERIT_PROBE:-absent}\"",
            true,
            Vec::new(),
        );

        assert!(
            messages.iter().any(|message| message == "inherited"),
            "inheriting profile lost the parent environment: {messages:?}"
        );
        std::env::remove_var("LOCALHOST_HUB_INHERIT_PROBE");
    }

    #[test]
    fn a_non_inheriting_profile_can_still_run_external_programs() {
        // Clearing the environment outright leaves no PATH, which would make
        // every external command fail. The baseline exists to prevent that.
        let messages = run_with_inheritance(
            "baseline",
            "env printf '%s\\n' resolved-external-binary",
            false,
            Vec::new(),
        );

        assert!(
            messages.iter().any(|m| m == "resolved-external-binary"),
            "a non-inheriting profile could not resolve a program on PATH: {messages:?}"
        );
    }

    #[test]
    fn profile_variables_apply_on_top_of_a_non_inheriting_baseline() {
        let messages = run_with_inheritance(
            "overlay",
            "printf '%s\\n' \"$LOCALHOST_HUB_OVERLAY\"",
            false,
            vec![ServiceEnvironmentVariable {
                key: "LOCALHOST_HUB_OVERLAY".to_string(),
                value: "from-profile".to_string(),
            }],
        );

        assert!(
            messages.iter().any(|message| message == "from-profile"),
            "profile variable was not applied: {messages:?}"
        );
    }

    #[test]
    fn the_baseline_carries_path_and_no_unexpected_extras() {
        let baseline = baseline_environment();
        assert!(
            baseline.iter().any(|(key, value)| key == "PATH" && !value.is_empty()),
            "baseline must always provide a PATH"
        );
        for (key, _) in &baseline {
            assert!(
                BASELINE_ENVIRONMENT_KEYS.contains(&key.as_str()),
                "unexpected key in baseline: {key}"
            );
        }
    }

    #[test]
    fn applies_environment_and_retains_it_across_restart() {
        let manager = ServiceManager::default();
        let sink = Arc::new(TestSink::default());
        let environment = ServiceEnvironment {
            inherit_system: true,
            vars: vec![ServiceEnvironmentVariable {
                key: "LOCALHOST_HUB_ENV_TEST".to_string(),
                value: "profile-value".to_string(),
            }],
        };
        manager
            .start_with_sink(
                sink.clone(),
                "environment".to_string(),
                "/tmp".to_string(),
                "printf '%s\\n' \"$LOCALHOST_HUB_ENV_TEST\"; sleep 10".to_string(),
                environment,
                Vec::new(),
                false,
            )
            .expect("start");

        wait_until(|| {
            sink.messages(ServiceEventKind::Stdout)
                .iter()
                .any(|message| message == "profile-value")
        });
        manager
            .restart_for_test(sink.clone(), "environment")
            .expect("restart");
        wait_until(|| {
            sink.messages(ServiceEventKind::Stdout)
                .iter()
                .filter(|message| *message == "profile-value")
                .count()
                >= 2
        });
        manager
            .stop_for_test(sink, "environment")
            .expect("cleanup");
    }

    #[test]
    fn describes_port_conflicts_with_available_owner_details() {
        let message = format_port_conflicts(&[LivePort {
            port: 5173,
            pid: Some(21842),
            process_name: Some("node".to_string()),
            protocol: "tcp".to_string(),
            bind_address: "127.0.0.1".to_string(),
            url: "http://localhost:5173".to_string(),
        }]);

        assert!(message.contains("5173"));
        assert!(message.contains("node (PID 21842)"));
        assert!(message.contains("explicitly start anyway"));
    }

    #[test]
    fn rejects_invalid_or_duplicate_environment_keys() {
        let invalid = ServiceEnvironment {
            inherit_system: true,
            vars: vec![ServiceEnvironmentVariable {
                key: "NOT=VALID".to_string(),
                value: "value".to_string(),
            }],
        };
        assert!(validate_environment(&invalid).unwrap_err().contains("invalid"));

        let duplicate = ServiceEnvironment {
            inherit_system: true,
            vars: vec![
                ServiceEnvironmentVariable {
                    key: "PORT".to_string(),
                    value: "3000".to_string(),
                },
                ServiceEnvironmentVariable {
                    key: "PORT".to_string(),
                    value: "3001".to_string(),
                },
            ],
        };
        assert!(validate_environment(&duplicate).unwrap_err().contains("duplicated"));
    }
}
