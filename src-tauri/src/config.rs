use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::PathBuf;
use tauri::Manager;
use ts_rs::TS;

pub use crate::github::GitHubUser;
use crate::workspace::WorkspaceRunMode;

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export, export_to = "../../src/generated/")]
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
    /// Closing the window hides it to the tray instead of exiting, so supervised
    /// services keep running. Defaults off: exiting on close is what a window is
    /// expected to do until asked otherwise.
    #[serde(default)]
    pub close_to_tray: bool,
    /// Start Localhost Hub when the user logs in, hidden to the tray.
    ///
    /// This exists for the cases where something other than the window needs Hub
    /// to be running — starting a workspace before sitting down at the computer,
    /// or a remote such as Localhost Companion having a host to reach. Closing to
    /// the tray keeps Hub alive once launched; this is what launches it.
    ///
    /// Defaults off. Whether the operating system actually honours it is not
    /// stored here: the registration lives with the OS, and `start_at_login` is
    /// read back from there rather than trusted from this file.
    #[serde(default)]
    pub start_at_login: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
pub struct EnvVariable {
    pub key: String,
    pub value: String,
    #[serde(default)]
    pub is_secret: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
pub struct StoredWorkspace {
    pub id: String,
    pub name: String,
    pub color: String,
    pub services: Vec<StoredService>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
pub struct StoredService {
    pub id: String,
    pub name: String,
    pub repo_path: String,
    pub script: String,
    pub cmd: String,
    #[serde(default)]
    pub depends_on: Vec<String>,
    #[serde(default, deserialize_with = "deserialize_run_mode")]
    pub run_mode: WorkspaceRunMode,
    #[serde(default)]
    // Tauri serializes through serde_json, so this arrives as a JSON number.
    #[ts(type = "number")]
    pub order: usize,
    #[serde(default)]
    pub env_profile_id: Option<String>,
    #[serde(default)]
    pub expected_port: Option<u16>,
    #[serde(default)]
    // Tauri serializes through serde_json, so this arrives as a JSON number.
    #[ts(type = "number")]
    pub startup_delay_ms: u64,
    #[serde(default)]
    // Tauri serializes through serde_json, so this arrives as a JSON number.
    #[ts(type = "number")]
    pub readiness_timeout_ms: u64,
}

/// Accepts an unrecognized run mode and falls back to the default rather than
/// failing the whole config, since this file can be edited by hand.
fn deserialize_run_mode<'de, D>(deserializer: D) -> Result<WorkspaceRunMode, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let raw = Option::<String>::deserialize(deserializer)?;
    Ok(match raw.as_deref() {
        Some("sequential") => WorkspaceRunMode::Sequential,
        _ => WorkspaceRunMode::Parallel,
    })
}

fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("config.json"))
}

pub fn load(app: &tauri::AppHandle) -> Result<Option<AppConfig>, String> {
    let path = config_path(app)?;
    if !path.exists() {
        return Ok(None);
    }
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut cfg: AppConfig = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let dir = data_dir(app)?;

    // Order matters: move anything still in plaintext into the secret store
    // before hydrating, since hydrating would otherwise overwrite the very
    // values being migrated.
    let migrated = migrate_plaintext_secrets(&dir, &cfg)?;
    hydrate_secrets(&dir, &mut cfg)?;
    if migrated {
        // Rewrites the file without the secrets it used to hold.
        save(app, &cfg)?;
    }
    Ok(Some(cfg))
}

pub fn save(app: &tauri::AppHandle, cfg: &AppConfig) -> Result<(), String> {
    let path = config_path(app)?;
    let dir = data_dir(app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    forget_removed_secrets(&dir, &path, cfg)?;
    persist_secrets(&dir, cfg)?;

    let text = serde_json::to_string_pretty(&redacted(cfg)).map_err(|e| e.to_string())?;
    write_private_config(&path, text.as_bytes())?;
    Ok(())
}

/// The form written to disk: identical to the live config except that every
/// secret is replaced by a placeholder, because the values live in the OS
/// credential store.
fn redacted(cfg: &AppConfig) -> AppConfig {
    let mut copy = cfg.clone();
    copy.github_token = None;
    for profile in &mut copy.env_profiles {
        for variable in &mut profile.vars {
            if variable.is_secret {
                variable.value.clear();
            }
        }
    }
    copy
}

fn secret_env_keys(cfg: &AppConfig) -> Vec<String> {
    cfg.env_profiles
        .iter()
        .flat_map(|profile| {
            profile
                .vars
                .iter()
                .filter(|variable| variable.is_secret)
                .map(move |variable| crate::secrets::env_var_key(&profile.id, &variable.key))
        })
        .collect()
}

/// Drops stored values whose variable or profile no longer exists, so deleting a
/// secret from the interface also removes it from the credential store.
fn forget_removed_secrets(
    dir: &std::path::Path,
    path: &std::path::Path,
    next: &AppConfig,
) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    let Ok(text) = std::fs::read_to_string(path) else {
        return Ok(());
    };
    let Ok(previous) = serde_json::from_str::<AppConfig>(&text) else {
        return Ok(());
    };
    let keep: std::collections::HashSet<String> = secret_env_keys(next).into_iter().collect();
    for key in secret_env_keys(&previous) {
        if !keep.contains(&key) {
            crate::secrets::delete(dir, &key)?;
        }
    }
    Ok(())
}

fn persist_secrets(dir: &std::path::Path, cfg: &AppConfig) -> Result<(), String> {
    match cfg.github_token.as_deref() {
        Some(token) if !token.is_empty() => {
            crate::secrets::set(dir, crate::secrets::GITHUB_TOKEN, token)?
        }
        // Signing out must clear the stored token, not merely forget it in memory.
        _ => crate::secrets::delete(dir, crate::secrets::GITHUB_TOKEN)?,
    }
    for profile in &cfg.env_profiles {
        for variable in profile.vars.iter().filter(|variable| variable.is_secret) {
            let key = crate::secrets::env_var_key(&profile.id, &variable.key);
            if variable.value.is_empty() {
                crate::secrets::delete(dir, &key)?;
            } else {
                crate::secrets::set(dir, &key, &variable.value)?;
            }
        }
    }
    Ok(())
}

fn hydrate_secrets(dir: &std::path::Path, cfg: &mut AppConfig) -> Result<(), String> {
    cfg.github_token = crate::secrets::get(dir, crate::secrets::GITHUB_TOKEN)?;
    for profile in &mut cfg.env_profiles {
        let profile_id = profile.id.clone();
        for variable in profile.vars.iter_mut().filter(|variable| variable.is_secret) {
            let key = crate::secrets::env_var_key(&profile_id, &variable.key);
            variable.value = crate::secrets::get(dir, &key)?.unwrap_or_default();
        }
    }
    Ok(())
}

/// Moves secrets that an older build wrote into `config.json` across to the
/// credential store. Existing stored values win, so a re-read of a stale file
/// cannot clobber a newer token.
fn migrate_plaintext_secrets(dir: &std::path::Path, cfg: &AppConfig) -> Result<bool, String> {
    let mut migrated = false;

    if let Some(token) = cfg.github_token.as_deref().filter(|token| !token.is_empty()) {
        if crate::secrets::get(dir, crate::secrets::GITHUB_TOKEN)?.is_none() {
            crate::secrets::set(dir, crate::secrets::GITHUB_TOKEN, token)?;
        }
        migrated = true;
    }

    for profile in &cfg.env_profiles {
        for variable in profile.vars.iter().filter(|variable| variable.is_secret) {
            if variable.value.is_empty() {
                continue;
            }
            let key = crate::secrets::env_var_key(&profile.id, &variable.key);
            if crate::secrets::get(dir, &key)?.is_none() {
                crate::secrets::set(dir, &key, &variable.value)?;
            }
            migrated = true;
        }
    }

    Ok(migrated)
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

    use crate::secrets::{force_backend, SecretBackend};

    fn temporary_data_dir(label: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "localhost-hub-cfg-{label}-{}-{}",
            std::process::id(),
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    fn config_with_secrets() -> AppConfig {
        AppConfig {
            onboarding_complete: true,
            github_token: Some("gho_live_token".to_string()),
            github_user: None,
            workspace_roots: vec!["/code".to_string()],
            user_workspaces: Vec::new(),
            appearance: AppearanceConfig::default(),
            close_to_tray: false,
            start_at_login: false,
            env_profiles: vec![EnvProfile {
                id: "profile-1".to_string(),
                project_path: "/code/app".to_string(),
                name: "dev".to_string(),
                description: String::new(),
                is_default: true,
                vars: vec![
                    EnvVariable {
                        key: "DATABASE_URL".to_string(),
                        value: "postgres://secret".to_string(),
                        is_secret: true,
                    },
                    EnvVariable {
                        key: "LOG_LEVEL".to_string(),
                        value: "debug".to_string(),
                        is_secret: false,
                    },
                ],
            }],
        }
    }

    /// The point of the whole change: nothing secret reaches the config file.
    #[test]
    fn serialized_config_contains_no_secret_values() {
        let cfg = config_with_secrets();
        let text = serde_json::to_string_pretty(&redacted(&cfg)).unwrap();

        assert!(!text.contains("gho_live_token"), "OAuth token was written to disk:\n{text}");
        assert!(!text.contains("postgres://secret"), "secret variable was written to disk:\n{text}");
        // Non-secret configuration must survive untouched.
        assert!(text.contains("LOG_LEVEL"));
        assert!(text.contains("debug"));
        assert!(text.contains("DATABASE_URL"), "the key is not secret, only the value");
    }

    #[test]
    fn secrets_round_trip_through_the_store() {
        force_backend(SecretBackend::File);
        let dir = temporary_data_dir("roundtrip");
        let cfg = config_with_secrets();

        persist_secrets(&dir, &cfg).unwrap();
        let mut restored = redacted(&cfg);
        assert_eq!(restored.github_token, None);
        assert!(restored.env_profiles[0].vars[0].value.is_empty());

        hydrate_secrets(&dir, &mut restored).unwrap();
        assert_eq!(restored.github_token.as_deref(), Some("gho_live_token"));
        assert_eq!(restored.env_profiles[0].vars[0].value, "postgres://secret");
        assert_eq!(restored.env_profiles[0].vars[1].value, "debug");

        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn plaintext_secrets_from_an_older_build_are_migrated() {
        force_backend(SecretBackend::File);
        let dir = temporary_data_dir("migrate");
        let legacy = config_with_secrets();

        assert!(migrate_plaintext_secrets(&dir, &legacy).unwrap(), "should report a migration");
        assert_eq!(
            crate::secrets::get(&dir, crate::secrets::GITHUB_TOKEN).unwrap().as_deref(),
            Some("gho_live_token")
        );
        assert_eq!(
            crate::secrets::get(&dir, &crate::secrets::env_var_key("profile-1", "DATABASE_URL"))
                .unwrap()
                .as_deref(),
            Some("postgres://secret")
        );

        // A config with nothing in plaintext reports no migration, so load() does
        // not rewrite the file on every launch.
        assert!(!migrate_plaintext_secrets(&dir, &redacted(&legacy)).unwrap());

        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn an_existing_stored_secret_is_not_clobbered_by_a_stale_file() {
        force_backend(SecretBackend::File);
        let dir = temporary_data_dir("noclobber");
        crate::secrets::set(&dir, crate::secrets::GITHUB_TOKEN, "gho_newer").unwrap();

        migrate_plaintext_secrets(&dir, &config_with_secrets()).unwrap();

        assert_eq!(
            crate::secrets::get(&dir, crate::secrets::GITHUB_TOKEN).unwrap().as_deref(),
            Some("gho_newer"),
            "a stale plaintext file must not overwrite a newer stored token"
        );
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn clearing_the_token_removes_it_from_the_store() {
        force_backend(SecretBackend::File);
        let dir = temporary_data_dir("signout");
        let cfg = config_with_secrets();
        persist_secrets(&dir, &cfg).unwrap();

        let mut signed_out = cfg.clone();
        signed_out.github_token = None;
        persist_secrets(&dir, &signed_out).unwrap();

        assert_eq!(crate::secrets::get(&dir, crate::secrets::GITHUB_TOKEN).unwrap(), None);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn removing_a_secret_variable_forgets_its_stored_value() {
        force_backend(SecretBackend::File);
        let dir = temporary_data_dir("orphan");
        let path = dir.join("config.json");
        let cfg = config_with_secrets();
        persist_secrets(&dir, &cfg).unwrap();
        std::fs::write(&path, serde_json::to_string(&redacted(&cfg)).unwrap()).unwrap();

        // The variable is gone from the incoming config.
        let mut next = cfg.clone();
        next.env_profiles[0].vars.retain(|variable| !variable.is_secret);
        forget_removed_secrets(&dir, &path, &next).unwrap();

        assert_eq!(
            crate::secrets::get(&dir, &crate::secrets::env_var_key("profile-1", "DATABASE_URL"))
                .unwrap(),
            None,
            "a removed secret variable must not linger in the store"
        );
        std::fs::remove_dir_all(dir).unwrap();
    }

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
        assert_eq!(service.run_mode, WorkspaceRunMode::Parallel);
        assert!(service.depends_on.is_empty());
        assert_eq!(service.startup_delay_ms, 0);
        assert_eq!(service.readiness_timeout_ms, 0);
    }
}
