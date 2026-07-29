use crate::ports::{
    extract_local_urls, find_port_conflicts, port_from_local_url, scan_live_ports, LivePort,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    io::{BufRead, BufReader},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use sysinfo::{Pid, ProcessRefreshKind, RefreshKind, System};
use tauri::{AppHandle, Emitter};

const STOP_POLL_INTERVAL: Duration = Duration::from_millis(50);
const GRACEFUL_STOP_ATTEMPTS: usize = 30;
const FORCE_STOP_ATTEMPTS: usize = 20;

#[derive(Default)]
pub struct ServiceManager {
    children: Arc<Mutex<HashMap<String, ManagedProcess>>>,
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
}

#[derive(Clone, Debug, Deserialize)]
pub struct ServiceEnvironmentVariable {
    pub key: String,
    pub value: String,
}

#[derive(Clone, Debug, Deserialize)]
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

#[derive(Clone, Debug, Serialize)]
pub struct ManagedServiceInfo {
    pub service_id: String,
    pub cwd: String,
    pub cmd: String,
    pub pid: u32,
    pub started_at_ms: u128,
    pub uptime_ms: u128,
    pub cpu_usage: f32,
    pub memory_mb: u64,
    pub ports: Vec<u16>,
    pub urls: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
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

#[derive(Clone, Debug, Serialize)]
pub struct ServiceEvent {
    pub service_id: String,
    pub kind: ServiceEventKind,
    pub message: String,
    pub pid: Option<u32>,
    pub code: Option<i32>,
}

trait EventSink: Send + Sync {
    fn emit(&self, event: ServiceEvent);
}

#[derive(Clone)]
struct TauriEventSink(AppHandle);

impl EventSink for TauriEventSink {
    fn emit(&self, event: ServiceEvent) {
        let _ = self.0.emit("service://event", event);
    }
}

impl ServiceManager {
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

        sink.emit(ServiceEvent {
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

    fn start_with_sink(
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

        sink.emit(ServiceEvent {
            service_id: service_id.clone(),
            kind: ServiceEventKind::Starting,
            message: format!("starting `{cmd}`"),
            pid: None,
            code: None,
        });

        let mut command = shell_command(&cmd);
        if !environment.inherit_system {
            command.env_clear();
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
                },
            );

        sink.emit(ServiceEvent {
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
            );
        }
        if let Some(stderr) = stderr {
            spawn_reader(
                sink.clone(),
                service_id.clone(),
                stderr,
                ServiceEventKind::Stderr,
                detected_urls,
            );
        }

        spawn_exit_watcher(sink, self.children.clone(), service_id, child, pid);
        Ok(pid)
    }

    fn stop_with_sink(
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

        let result = {
            let mut child = managed.child.lock().map_err(|e| e.to_string())?;
            terminate_child(&mut child)
        };

        if let Err(error) = result {
            self.children
                .lock()
                .map_err(|e| e.to_string())?
                .insert(service_id, managed);
            return Err(error);
        }

        if emit_stopped {
            sink.emit(ServiceEvent {
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
        sink.emit(ServiceEvent {
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

#[cfg(unix)]
fn shell_command(command: &str) -> Command {
    let mut shell = Command::new("sh");
    shell.args(["-lc", command]);
    shell
}

#[cfg(windows)]
fn shell_command(command: &str) -> Command {
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
        if signal_unix_process_group(child.id(), "TERM")? {
            if wait_for_exit(child, GRACEFUL_STOP_ATTEMPTS)? {
                return Ok(());
            }
        }
        signal_unix_process_group(child.id(), "KILL")?;
        if wait_for_exit(child, FORCE_STOP_ATTEMPTS)? {
            return Ok(());
        }
        return Err(format!("process group {} did not stop", child.id()));
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

pub fn terminate_process_tree(pid: u32) -> Result<(), String> {
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
        return Err(format!("failed to terminate PID {pid}"));
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
) where
    R: std::io::Read + Send + 'static,
{
    std::thread::spawn(move || {
        let reader = BufReader::new(reader);
        for line in reader.lines() {
            match line {
                Ok(message) => {
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
                            sink.emit(ServiceEvent {
                                service_id: service_id.clone(),
                                kind: ServiceEventKind::Url,
                                message: url,
                                pid: None,
                                code: None,
                            });
                        }
                    }
                    sink.emit(ServiceEvent {
                        service_id: service_id.clone(),
                        kind: kind.clone(),
                        message,
                        pid: None,
                        code: None,
                    });
                }
                Err(error) => {
                    sink.emit(ServiceEvent {
                        service_id: service_id.clone(),
                        kind: ServiceEventKind::Stderr,
                        message: format!("failed to read process output: {error}"),
                        pid: None,
                        code: None,
                    });
                    break;
                }
            }
        }
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

fn spawn_exit_watcher(
    sink: Arc<dyn EventSink>,
    children: Arc<Mutex<HashMap<String, ManagedProcess>>>,
    service_id: String,
    child: Arc<Mutex<Child>>,
    pid: u32,
) {
    std::thread::spawn(move || loop {
        let status = {
            let mut child = match child.lock() {
                Ok(child) => child,
                Err(error) => {
                    sink.emit(ServiceEvent {
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
                if should_emit {
                    sink.emit(ServiceEvent {
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
                if should_emit {
                    sink.emit(ServiceEvent {
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

    #[derive(Default)]
    struct TestSink {
        events: Mutex<Vec<ServiceEvent>>,
    }

    impl EventSink for TestSink {
        fn emit(&self, event: ServiceEvent) {
            self.events.lock().expect("events").push(event);
        }
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
