use tauri::{AppHandle, State};

use crate::ports::{normalize_local_url, scan_live_ports, LivePort};
use crate::processes::{get_dev_processes, get_system_stats as sys_stats, ProcessInfo, SystemStats};
use crate::git::{
    add_remote as git_add_remote, checkout_branch as git_checkout_branch,
    commit as git_commit_changes, create_branch as git_create_branch,
    delete_branch as git_delete_branch, get_git_diff as git_diff,
    get_git_status as git_status, get_repository_info as git_repository_info,
    fetch_remote as git_fetch_remote, pull_remote as git_pull_remote,
    push_remote as git_push_remote,
    remove_remote as git_remove_remote, rename_remote as git_rename_remote,
    stage_files as git_stage_files, unstage_files as git_unstage_files, GitCommitResult, GitDiff,
    GitNetworkResult, GitRepositoryInfo, GitStatus,
};
use crate::workspace::{
    scan_as_workspace_groups, scan_for_projects, start_workspace as start_workspace_runs,
    stop_workspace as stop_workspace_runs, DetectedProject, WorkspaceGroup, WorkspaceRunResult,
    WorkspaceServiceSpec, WorkspaceStopSpec,
};
use crate::config::{AppConfig, load as load_cfg, save as save_cfg};
use crate::github::{
    fetch_project_context, fetch_repos, open_github_url as open_github_link, poll_token,
    request_device_code, DeviceCodeResponse, GitHubProjectContext, GitHubRepo, GitHubUser,
};
use crate::services::{
    terminate_process_tree, ManagedServiceInfo, ServiceEnvironment, ServiceManager,
};
use crate::scaffold::{
    create_project as scaffold_project, CreateProjectPayload, CreateProjectResult,
};
use crate::health::{analyze_repositories, RepositoryHealth};
use crate::packages::{
    inspect_project as inspect_project_packages, run_action as execute_package_action,
    PackageActionPayload, PackageActionResult, ProjectPackages,
};
use crate::env_files::{
    export_file as write_env_file, import_file as parse_env_file, EnvFileImport, EnvFileVariable,
};

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
    // Save token + user in the Rust-owned config — the token never reaches the frontend.
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

#[tauri::command]
pub async fn github_get_project_context(
    app: AppHandle,
    path: String,
) -> Result<GitHubProjectContext, String> {
    let cfg = load_cfg(&app)?.ok_or_else(|| "GitHub is not connected.".to_string())?;
    let token = cfg
        .github_token
        .ok_or_else(|| "GitHub is not connected.".to_string())?;
    fetch_project_context(&token, &path).await
}

#[tauri::command]
pub fn open_github_url(url: String) -> Result<(), String> {
    open_github_link(&url)
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
    environment: ServiceEnvironment,
) -> Result<u32, String> {
    services.start(app, service_id, cwd, cmd, environment)
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

#[tauri::command]
pub fn start_workspace(
    app: AppHandle,
    services: State<ServiceManager>,
    workspace_id: String,
    workspace_services: Vec<WorkspaceServiceSpec>,
) -> Result<WorkspaceRunResult, String> {
    start_workspace_runs(app, services.inner(), workspace_id, workspace_services)
}

#[tauri::command]
pub fn stop_workspace(
    app: AppHandle,
    services: State<ServiceManager>,
    workspace_id: String,
    workspace_services: Vec<WorkspaceStopSpec>,
) -> Result<WorkspaceRunResult, String> {
    stop_workspace_runs(app, services.inner(), workspace_id, workspace_services)
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

#[tauri::command]
pub fn get_git_diff(
    path: String,
    file_path: Option<String>,
    staged: bool,
) -> Result<GitDiff, String> {
    git_diff(&path, file_path.as_deref(), staged)
}

#[tauri::command]
pub fn stage_git_files(path: String, files: Vec<String>) -> Result<GitStatus, String> {
    git_stage_files(&path, &files)
}

#[tauri::command]
pub fn unstage_git_files(path: String, files: Vec<String>) -> Result<GitStatus, String> {
    git_unstage_files(&path, &files)
}

#[tauri::command]
pub fn commit_git_changes(path: String, message: String) -> Result<GitCommitResult, String> {
    git_commit_changes(&path, &message)
}

#[tauri::command]
pub fn get_git_repository_info(
    path: String,
    history_limit: Option<usize>,
) -> Result<GitRepositoryInfo, String> {
    git_repository_info(&path, history_limit.unwrap_or(30))
}

#[tauri::command]
pub fn create_git_branch(path: String, name: String) -> Result<GitStatus, String> {
    git_create_branch(&path, &name)
}

#[tauri::command]
pub fn checkout_git_branch(path: String, name: String) -> Result<GitStatus, String> {
    git_checkout_branch(&path, &name)
}

#[tauri::command]
pub fn delete_git_branch(path: String, name: String) -> Result<(), String> {
    git_delete_branch(&path, &name)
}

#[tauri::command]
pub fn add_git_remote(
    path: String,
    name: String,
    url: String,
) -> Result<GitRepositoryInfo, String> {
    git_add_remote(&path, &name, &url)
}

#[tauri::command]
pub fn rename_git_remote(
    path: String,
    current_name: String,
    new_name: String,
) -> Result<GitRepositoryInfo, String> {
    git_rename_remote(&path, &current_name, &new_name)
}

#[tauri::command]
pub fn remove_git_remote(path: String, name: String) -> Result<GitRepositoryInfo, String> {
    git_remove_remote(&path, &name)
}

#[tauri::command]
pub async fn fetch_git_remote(path: String, remote: String) -> Result<GitNetworkResult, String> {
    git_fetch_remote(&path, &remote).await
}

#[tauri::command]
pub async fn pull_git_remote(path: String, remote: String) -> Result<GitNetworkResult, String> {
    git_pull_remote(&path, &remote).await
}

#[tauri::command]
pub async fn push_git_remote(path: String, remote: String) -> Result<GitNetworkResult, String> {
    git_push_remote(&path, &remote).await
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

#[tauri::command]
pub async fn create_project(payload: CreateProjectPayload) -> Result<CreateProjectResult, String> {
    scaffold_project(payload).await
}

#[tauri::command]
pub async fn analyze_repository_health(
    paths: Vec<String>,
) -> Result<Vec<RepositoryHealth>, String> {
    tauri::async_runtime::spawn_blocking(move || analyze_repositories(paths))
        .await
        .map_err(|error| format!("Repository health analysis failed: {error}"))
}

#[tauri::command]
pub async fn get_project_packages(path: String) -> Result<ProjectPackages, String> {
    tauri::async_runtime::spawn_blocking(move || inspect_project_packages(path))
        .await
        .map_err(|error| format!("Package inspection failed: {error}"))?
}

#[tauri::command]
pub async fn run_package_action(
    payload: PackageActionPayload,
) -> Result<PackageActionResult, String> {
    execute_package_action(payload).await
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
    let url = normalize_local_url(&url)
        .ok_or_else(|| "only local HTTP and HTTPS URLs can be opened".to_string())?;
    std::thread::spawn(move || {
        let _ = open::that(url);
    });
    Ok(())
}

// ── Environment files ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn import_env_file(path: String) -> Result<EnvFileImport, String> {
    parse_env_file(path)
}

#[tauri::command]
pub fn export_env_file(path: String, variables: Vec<EnvFileVariable>) -> Result<(), String> {
    write_env_file(path, variables)
}
