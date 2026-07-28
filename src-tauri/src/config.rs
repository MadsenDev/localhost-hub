use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

pub use crate::github::GitHubUser;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppConfig {
    pub onboarding_complete: bool,
    pub github_token: Option<String>,
    pub github_user: Option<GitHubUser>,
    #[serde(default)]
    pub workspace_roots: Vec<String>,
    #[serde(default)]
    pub user_workspaces: Vec<StoredWorkspace>,
    #[serde(default)]
    pub appearance: AppearanceConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppearanceConfig {
    pub theme: String,
    pub accent: String,
    pub density: String,
    pub sidebar: String,
}

impl Default for AppearanceConfig {
    fn default() -> Self {
        Self {
            theme: "charcoal".to_string(),
            accent: "#4a78c4".to_string(),
            density: "balanced".to_string(),
            sidebar: "labeled".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredWorkspace {
    pub id: String,
    pub name: String,
    pub color: String,
    pub services: Vec<StoredService>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredService {
    pub id: String,
    pub name: String,
    pub repo_path: String,
    pub script: String,
    pub cmd: String,
    #[serde(default = "default_run_mode")]
    pub run_mode: String,
    #[serde(default)]
    pub order: usize,
}

fn default_run_mode() -> String {
    "parallel".to_string()
}

fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("config.json"))
}

pub fn load(app: &tauri::AppHandle) -> Result<Option<AppConfig>, String> {
    let path = config_path(app)?;
    if !path.exists() {
        return Ok(None);
    }
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let cfg: AppConfig = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    Ok(Some(cfg))
}

pub fn save(app: &tauri::AppHandle, cfg: &AppConfig) -> Result<(), String> {
    let path = config_path(app)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| e.to_string())?;
    Ok(())
}
