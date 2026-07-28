use tauri::{AppHandle, State};

use crate::ports::{scan_live_ports, LivePort};
use crate::processes::{get_dev_processes, get_system_stats as sys_stats, ProcessInfo, SystemStats};
use crate::git::{get_git_status as git_status, GitStatus};
use crate::workspace::{scan_for_projects, scan_as_workspace_groups, DetectedProject, WorkspaceGroup};
use crate::config::{AppConfig, load as load_cfg, save as save_cfg};
use crate::github::{fetch_repos, request_device_code, poll_token, DeviceCodeResponse, GitHubRepo, GitHubUser};
use crate::services::{terminate_process_tree, ManagedServiceInfo, ServiceManager};

// ── Config ────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn load_config(app: AppHandle) -> Result<Option<AppConfig>, String> {
    load_cfg(&app)
}

#[tauri::command]
pub fn save_config(app: AppHandle, config: AppConfig) -> Result<(), String> {
    save_cfg(&app, &config)
}

// ── GitHub OAuth (device flow) ────────────────────────────────────────────────

#[tauri::command]
pub async fn github_request_device_code() -> Result<DeviceCodeResponse, String> {
    request_device_code().await
}

#[tauri::command]
pub async fn github_poll_token(app: AppHandle, device_code: String) -> Result<GitHubUser, String> {
    let (token, user) = poll_token(&device_code).await?;
    // Save token + user to config atomically — token never reaches the frontend
    let mut cfg = load_cfg(&app)?.unwrap_or_default();
    cfg.github_token = Some(token);
    cfg.github_user = Some(crate::config::GitHubUser {
        login: user.login.clone(),
        name: user.name.clone(),
        avatar_url: user.avatar_url.clone(),
    });
    save_cfg(&app, &cfg)?;
    Ok(user)
}

#[tauri::command]
pub async fn github_list_repos(app: AppHandle) -> Result<Vec<GitHubRepo>, String> {
    let cfg = load_cfg(&app)?.ok_or_else(|| "GitHub is not connected.".to_string())?;
    let token = cfg.github_token.ok_or_else(|| "GitHub is not connected.".to_string())?;
    fetch_repos(&token).await
}

// ── Ports ─────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn scan_ports() -> Vec<LivePort> {
    scan_live_ports()
}

// ── Processes ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_processes() -> Vec<ProcessInfo> {
    get_dev_processes()
}

#[tauri::command]
pub fn kill_process(pid: u32) -> Result<(), String> {
    terminate_process_tree(pid)
}

#[tauri::command]
pub fn start_service(
    app: AppHandle,
    services: State<ServiceManager>,
    service_id: String,
    cwd: String,
    cmd: String,
) -> Result<u32, String> {
    services.start(app, service_id, cwd, cmd)
}

#[tauri::command]
pub fn stop_service(
    app: AppHandle,
    services: State<ServiceManager>,
    service_id: String,
) -> Result<(), String> {
    services.stop(app, service_id)
}

#[tauri::command]
pub fn restart_service(
    app: AppHandle,
    services: State<ServiceManager>,
    service_id: String,
) -> Result<u32, String> {
    services.restart(app, service_id)
}

#[tauri::command]
pub fn list_managed_services(
    services: State<ServiceManager>,
) -> Result<Vec<ManagedServiceInfo>, String> {
    services.list()
}

// ── System stats ──────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_system_stats() -> SystemStats {
    sys_stats()
}

// ── Git ───────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_git_status(path: String) -> Option<GitStatus> {
    git_status(&path)
}

// ── Workspace / project scanning ──────────────────────────────────────────────

#[tauri::command]
pub fn scan_workspaces(
    root: String,
    max_depth: Option<usize>,
    ignore_patterns: Option<Vec<String>>,
) -> Vec<DetectedProject> {
    scan_for_projects(&root, max_depth.unwrap_or(4), ignore_patterns)
}

#[tauri::command]
pub fn scan_workspace_groups(
    roots: Vec<String>,
    max_depth: Option<usize>,
    ignore_patterns: Option<Vec<String>>,
) -> Vec<WorkspaceGroup> {
    scan_as_workspace_groups(&roots, max_depth, ignore_patterns)
}

#[tauri::command]
pub fn find_default_workspace_roots() -> Vec<String> {
    let home = match std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE")) {
        Ok(h) => std::path::PathBuf::from(h),
        Err(_) => return vec![],
    };

    let candidates = [
        "Documents/GitHub",
        "Documents/GitLab",
        "code",
        "Code",
        "projects",
        "Projects",
        "dev",
        "Dev",
        "src",
        "workspace",
        "repos",
    ];

    candidates
        .iter()
        .map(|c| home.join(c))
        .filter(|p| p.is_dir())
        .map(|p| p.to_string_lossy().to_string())
        .collect()
}

// ── Shell integration ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn open_in_editor(path: String, _app: AppHandle) -> Result<(), String> {
    let editors = ["code", "cursor", "zed", "subl", "idea"];
    for editor in &editors {
        if std::process::Command::new(editor).arg(&path).spawn().is_ok() {
            return Ok(());
        }
    }
    // Fallback: OS default
    #[cfg(target_os = "macos")]
    std::process::Command::new("open").arg(&path).spawn().map_err(|e| e.to_string())?;
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open").arg(&path).spawn().map_err(|e| e.to_string())?;
    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer").arg(&path).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    std::thread::spawn(move || {
        let _ = open::that(url);
    });
    Ok(())
}

// ── Env file ──────────────────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct EnvEntry {
    pub key: String,
    pub value: String,
    pub redacted: bool,
}

#[tauri::command]
pub fn read_env_file(path: String) -> Vec<EnvEntry> {
    let Ok(content) = std::fs::read_to_string(&path) else {
        return vec![];
    };

    let secret_hints = ["secret", "key", "token", "password", "pass", "pwd", "auth", "api_key", "private"];

    content
        .lines()
        .filter(|l| !l.starts_with('#') && l.contains('='))
        .filter_map(|l| {
            let (key, rest) = l.split_once('=')?;
            let key = key.trim().to_string();
            let value = rest.trim().trim_matches('"').trim_matches('\'').to_string();
            let lower = key.to_lowercase();
            let redacted = secret_hints.iter().any(|h| lower.contains(h));
            Some(EnvEntry {
                key,
                value: if redacted { "•••••••••".to_string() } else { value },
                redacted,
            })
        })
        .collect()
}
