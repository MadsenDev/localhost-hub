use serde::{Deserialize, Serialize};
use std::io::Write;
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
    #[serde(default)]
    pub env_profiles: Vec<EnvProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvProfile {
    pub id: String,
    pub project_path: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub is_default: bool,
    #[serde(default)]
    pub vars: Vec<EnvVariable>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvVariable {
    pub key: String,
    pub value: String,
    #[serde(default)]
    pub is_secret: bool,
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
    #[serde(default)]
    pub env_profile_id: Option<String>,
    #[serde(default)]
    pub expected_port: Option<u16>,
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
    write_private_config(&path, text.as_bytes())?;
    Ok(())
}

fn write_private_config(path: &std::path::Path, content: &[u8]) -> Result<(), String> {
    let mut options = std::fs::OpenOptions::new();
    options.create(true).write(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
        options.mode(0o600);
        if path.exists() {
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
                .map_err(|error| error.to_string())?;
        }
    }
    let mut file = options.open(path).map_err(|error| error.to_string())?;
    file.write_all(content).map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn private_config_write_truncates_existing_content() {
        let path = std::env::temp_dir().join(format!(
            "localhost-hub-config-{}-{}.json",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::write(&path, b"content that is much longer than the replacement").unwrap();

        write_private_config(&path, b"short").unwrap();

        assert_eq!(std::fs::read(&path).unwrap(), b"short");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(std::fs::metadata(&path).unwrap().permissions().mode() & 0o777, 0o600);
        }
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn older_config_without_environment_profiles_still_loads() {
        let config: AppConfig = serde_json::from_str(
            r##"{
                "onboarding_complete": true,
                "github_token": null,
                "github_user": null,
                "workspace_roots": [],
                "user_workspaces": [],
                "appearance": {
                    "theme": "charcoal",
                    "accent": "#4a78c4",
                    "density": "balanced",
                    "sidebar": "labeled"
                }
            }"##,
        )
        .expect("deserialize old config");

        assert!(config.env_profiles.is_empty());
    }

    #[test]
    fn older_workspace_services_default_to_no_expected_port() {
        let service: StoredService = serde_json::from_str(
            r#"{
                "id": "web",
                "name": "web",
                "repo_path": "/code/web",
                "script": "dev",
                "cmd": "npm run dev"
            }"#,
        )
        .expect("deserialize old service");

        assert_eq!(service.expected_port, None);
        assert_eq!(service.run_mode, "parallel");
    }
}
