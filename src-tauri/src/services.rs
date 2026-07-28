use serde::Serialize;
use std::{
    collections::HashMap,
    io::{BufRead, BufReader},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter};

#[derive(Default)]
pub struct ServiceManager {
    children: Arc<Mutex<HashMap<String, ManagedProcess>>>,
}

#[derive(Clone)]
struct ManagedProcess {
    child: Arc<Mutex<Child>>,
    cwd: String,
    cmd: String,
    pid: u32,
    started_at_ms: u128,
}

#[derive(Clone, Serialize)]
pub struct ManagedServiceInfo {
    pub service_id: String,
    pub cwd: String,
    pub cmd: String,
    pub pid: u32,
    pub started_at_ms: u128,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ServiceEventKind {
    Started,
    Stdout,
    Stderr,
    Exited,
    Error,
    Stopped,
}

#[derive(Clone, Serialize)]
pub struct ServiceEvent {
    pub service_id: String,
    pub kind: ServiceEventKind,
    pub message: String,
    pub pid: Option<u32>,
    pub code: Option<i32>,
}

impl ServiceManager {
    pub fn start(
        &self,
        app: AppHandle,
        service_id: String,
        cwd: String,
        cmd: String,
    ) -> Result<u32, String> {
        {
            let mut children = self.children.lock().map_err(|e| e.to_string())?;
            if let Some(existing) = children.get(&service_id) {
                let mut existing = existing.child.lock().map_err(|e| e.to_string())?;
                match existing.try_wait() {
                    Ok(None) => return Err("service is already running".to_string()),
                    Ok(Some(_)) | Err(_) => {
                        drop(existing);
                        children.remove(&service_id);
                    }
                }
            }
        }

        let mut command = Command::new("sh");
        command
            .arg("-lc")
            .arg(&cmd)
            .current_dir(&cwd)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.process_group(0);
        }

        let mut child = command
            .spawn()
            .map_err(|e| format!("failed to start `{cmd}` in {cwd}: {e}"))?;

        let pid = child.id();
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        emit(
            &app,
            ServiceEvent {
                service_id: service_id.clone(),
                kind: ServiceEventKind::Started,
                message: format!("started `{cmd}`"),
                pid: Some(pid),
                code: None,
            },
        );

        if let Some(stdout) = stdout {
            spawn_reader(app.clone(), service_id.clone(), stdout, ServiceEventKind::Stdout);
        }
        if let Some(stderr) = stderr {
            spawn_reader(app.clone(), service_id.clone(), stderr, ServiceEventKind::Stderr);
        }

        let child = Arc::new(Mutex::new(child));
        let started_at_ms = now_ms();
        self.children
            .lock()
            .map_err(|e| e.to_string())?
            .insert(service_id.clone(), ManagedProcess {
                child: child.clone(),
                cwd,
                cmd,
                pid,
                started_at_ms,
            });

        spawn_exit_watcher(app, self.children.clone(), service_id, child, pid);

        Ok(pid)
    }

    pub fn list(&self) -> Result<Vec<ManagedServiceInfo>, String> {
        let children = self.children.lock().map_err(|e| e.to_string())?;
        Ok(children
            .iter()
            .map(|(service_id, managed)| ManagedServiceInfo {
                service_id: service_id.clone(),
                cwd: managed.cwd.clone(),
                cmd: managed.cmd.clone(),
                pid: managed.pid,
                started_at_ms: managed.started_at_ms,
            })
            .collect())
    }

    pub fn stop(&self, app: AppHandle, service_id: String) -> Result<(), String> {
        let managed = self
            .children
            .lock()
            .map_err(|e| e.to_string())?
            .remove(&service_id)
            .ok_or_else(|| "service is not managed by Localhost Hub".to_string())?;

        let mut child = managed.child.lock().map_err(|e| e.to_string())?;
        let pid = child.id();
        terminate_child(&mut child)?;
        let _ = child.wait();
        emit(
            &app,
            ServiceEvent {
                service_id,
                kind: ServiceEventKind::Stopped,
                message: "stopped".to_string(),
                pid: Some(pid),
                code: None,
            },
        );
        Ok(())
    }
}

fn terminate_child(child: &mut Child) -> Result<(), String> {
    #[cfg(unix)]
    {
        let pgid = format!("-{}", child.id());
        if Command::new("kill").args(["-TERM", &pgid]).status().is_ok() {
            return Ok(());
        }
    }

    child.kill().map_err(|e| e.to_string())
}

fn spawn_reader<R>(app: AppHandle, service_id: String, reader: R, kind: ServiceEventKind)
where
    R: std::io::Read + Send + 'static,
{
    std::thread::spawn(move || {
        let reader = BufReader::new(reader);
        for line in reader.lines() {
            match line {
                Ok(message) => emit(
                    &app,
                    ServiceEvent {
                        service_id: service_id.clone(),
                        kind: kind.clone(),
                        message,
                        pid: None,
                        code: None,
                    },
                ),
                Err(err) => {
                    emit(
                        &app,
                        ServiceEvent {
                            service_id: service_id.clone(),
                            kind: ServiceEventKind::Error,
                            message: err.to_string(),
                            pid: None,
                            code: None,
                        },
                    );
                    break;
                }
            }
        }
    });
}

fn spawn_exit_watcher(
    app: AppHandle,
    children: Arc<Mutex<HashMap<String, ManagedProcess>>>,
    service_id: String,
    child: Arc<Mutex<Child>>,
    pid: u32,
) {
    std::thread::spawn(move || {
        loop {
            let status = {
                let mut child = match child.lock() {
                    Ok(child) => child,
                    Err(err) => {
                        emit(
                            &app,
                            ServiceEvent {
                                service_id: service_id.clone(),
                                kind: ServiceEventKind::Error,
                                message: err.to_string(),
                                pid: Some(pid),
                                code: None,
                            },
                        );
                        break;
                    }
                };
                match child.try_wait() {
                    Ok(Some(status)) => Some(Ok(status.code())),
                    Ok(None) => None,
                    Err(err) => Some(Err(err.to_string())),
                }
            };

            match status {
                Some(Ok(code)) => {
                    let should_emit = if let Ok(mut children) = children.lock() {
                        children.remove(&service_id).is_some()
                    } else {
                        true
                    };
                    if !should_emit {
                        break;
                    }
                    emit(
                        &app,
                        ServiceEvent {
                            service_id,
                            kind: ServiceEventKind::Exited,
                            message: format!("exited with code {}", code.map_or_else(|| "signal".to_string(), |c| c.to_string())),
                            pid: Some(pid),
                            code,
                        },
                    );
                    break;
                }
                Some(Err(message)) => {
                    let should_emit = if let Ok(mut children) = children.lock() {
                        children.remove(&service_id).is_some()
                    } else {
                        true
                    };
                    if !should_emit {
                        break;
                    }
                    emit(
                        &app,
                        ServiceEvent {
                            service_id,
                            kind: ServiceEventKind::Error,
                            message,
                            pid: Some(pid),
                            code: None,
                        },
                    );
                    break;
                }
                None => std::thread::sleep(Duration::from_millis(500)),
            }
        }
    });
}

fn emit(app: &AppHandle, event: ServiceEvent) {
    let _ = app.emit("service://event", event);
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}
