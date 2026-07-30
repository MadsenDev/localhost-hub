//! Secret storage backed by the operating system credential store.
//!
//! The GitHub OAuth token and any environment variable a profile marks secret are
//! held here rather than in `config.json`. A `repo`-scoped token in a plaintext
//! file is readable by every process running as the user, which on this machine
//! includes each tool in each project the app scans.
//!
//! Not every desktop has a working credential store — a Linux session without
//! gnome-keyring, KWallet, or another Secret Service provider has none, and so do
//! most CI containers. Rather than refuse to save, the store falls back to a file
//! with the tightest permissions the platform allows and reports which backend is
//! in use, so the interface can tell the user the truth about where their token
//! lives.

use std::collections::BTreeMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use ts_rs::TS;

/// Credential-store service name. Shares the bundle identifier so entries are
/// attributable to this app in Keychain Access, Credential Manager, and Seahorse.
const SERVICE: &str = "dev.madsens.localhost-hub";

/// Key under which the GitHub OAuth token is stored.
pub const GITHUB_TOKEN: &str = "github-token";

/// Builds the key for one secret environment variable.
pub fn env_var_key(profile_id: &str, variable_key: &str) -> String {
    format!("env:{profile_id}:{variable_key}")
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "../../src/generated/")]
pub enum SecretBackend {
    /// The OS credential store; secrets are not on disk in readable form.
    Keyring,
    /// A permission-restricted file, used when no credential store is available.
    File,
}

/// Cached so a missing Secret Service provider costs one probe, not one per call.
static BACKEND: Mutex<Option<SecretBackend>> = Mutex::new(None);

fn detect_backend() -> SecretBackend {
    match keyring::Entry::new(SERVICE, "__probe__") {
        // `get_password` returning NoEntry proves the backend is reachable.
        Ok(entry) => match entry.get_password() {
            Ok(_) | Err(keyring::Error::NoEntry) => SecretBackend::Keyring,
            Err(error) => {
                log::warn!("credential store unavailable ({error}); falling back to a restricted file");
                SecretBackend::File
            }
        },
        Err(error) => {
            log::warn!("credential store unavailable ({error}); falling back to a restricted file");
            SecretBackend::File
        }
    }
}

pub fn backend() -> SecretBackend {
    let mut cached = BACKEND.lock().expect("secret backend lock");
    *cached.get_or_insert_with(detect_backend)
}

/// Overrides backend detection. Tests use this to exercise the file fallback on
/// machines that do have a credential store, and vice versa.
#[cfg(test)]
pub(crate) fn force_backend(value: SecretBackend) {
    *BACKEND.lock().expect("secret backend lock") = Some(value);
}

pub fn set(directory: &Path, key: &str, value: &str) -> Result<(), String> {
    match backend() {
        SecretBackend::Keyring => keyring::Entry::new(SERVICE, key)
            .and_then(|entry| entry.set_password(value))
            .map_err(|error| format!("Could not save the secret: {error}")),
        SecretBackend::File => {
            let mut secrets = read_file(directory)?;
            secrets.insert(key.to_string(), value.to_string());
            write_file(directory, &secrets)
        }
    }
}

pub fn get(directory: &Path, key: &str) -> Result<Option<String>, String> {
    match backend() {
        SecretBackend::Keyring => match keyring::Entry::new(SERVICE, key) {
            Ok(entry) => match entry.get_password() {
                Ok(value) => Ok(Some(value)),
                Err(keyring::Error::NoEntry) => Ok(None),
                Err(error) => Err(format!("Could not read the secret: {error}")),
            },
            Err(error) => Err(format!("Could not read the secret: {error}")),
        },
        SecretBackend::File => Ok(read_file(directory)?.get(key).cloned()),
    }
}

pub fn delete(directory: &Path, key: &str) -> Result<(), String> {
    match backend() {
        SecretBackend::Keyring => match keyring::Entry::new(SERVICE, key) {
            Ok(entry) => match entry.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
                Err(error) => Err(format!("Could not remove the secret: {error}")),
            },
            Err(error) => Err(format!("Could not remove the secret: {error}")),
        },
        SecretBackend::File => {
            let mut secrets = read_file(directory)?;
            if secrets.remove(key).is_none() {
                return Ok(());
            }
            write_file(directory, &secrets)
        }
    }
}

fn file_path(directory: &Path) -> PathBuf {
    directory.join("secrets.json")
}

fn read_file(directory: &Path) -> Result<BTreeMap<String, String>, String> {
    let path = file_path(directory);
    if !path.exists() {
        return Ok(BTreeMap::new());
    }
    let text = std::fs::read_to_string(&path)
        .map_err(|error| format!("Could not read stored secrets: {error}"))?;
    serde_json::from_str(&text).map_err(|error| format!("Stored secrets are unreadable: {error}"))
}

fn write_file(directory: &Path, secrets: &BTreeMap<String, String>) -> Result<(), String> {
    std::fs::create_dir_all(directory)
        .map_err(|error| format!("Could not create the configuration directory: {error}"))?;
    let path = file_path(directory);
    let text = serde_json::to_string_pretty(secrets)
        .map_err(|error| format!("Could not serialize secrets: {error}"))?;
    write_restricted(&path, text.as_bytes())
}

/// Writes with the tightest permissions the platform offers: mode 0600 on Unix,
/// and on Windows an ACL granting only the current user.
fn write_restricted(path: &Path, content: &[u8]) -> Result<(), String> {
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
    file.sync_all().map_err(|error| error.to_string())?;

    #[cfg(windows)]
    restrict_to_current_user(path)?;

    Ok(())
}

/// Removes inherited ACEs and grants full control to the current user only.
///
/// Windows has no `chmod`, and a file in the roaming profile otherwise inherits
/// whatever the parent directory allows.
#[cfg(windows)]
fn restrict_to_current_user(path: &Path) -> Result<(), String> {
    use std::process::Command;

    let path = path.to_string_lossy().to_string();
    let username = std::env::var("USERNAME")
        .map_err(|_| "Could not determine the current user for file permissions.".to_string())?;

    // /inheritance:r drops inherited entries; /grant:r replaces any existing
    // grant for that user rather than adding to it.
    let status = Command::new("icacls")
        .args([&path, "/inheritance:r", "/grant:r", &format!("{username}:(F)")])
        .status()
        .map_err(|error| format!("Could not restrict secret file permissions: {error}"))?;
    if !status.success() {
        return Err("Could not restrict secret file permissions.".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temporary_directory(label: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "localhost-hub-secrets-{label}-{}-{}",
            std::process::id(),
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    /// The file backend is the one that must work everywhere, including the CI
    /// containers and headless Linux sessions that have no credential store.
    #[test]
    fn file_backend_round_trips_and_deletes() {
        force_backend(SecretBackend::File);
        let directory = temporary_directory("roundtrip");

        assert_eq!(get(&directory, GITHUB_TOKEN).unwrap(), None);
        set(&directory, GITHUB_TOKEN, "gho_example").unwrap();
        assert_eq!(get(&directory, GITHUB_TOKEN).unwrap(), Some("gho_example".to_string()));

        // Overwriting must replace rather than append.
        set(&directory, GITHUB_TOKEN, "gho_rotated").unwrap();
        assert_eq!(get(&directory, GITHUB_TOKEN).unwrap(), Some("gho_rotated".to_string()));

        delete(&directory, GITHUB_TOKEN).unwrap();
        assert_eq!(get(&directory, GITHUB_TOKEN).unwrap(), None);
        // Deleting an absent key is not an error.
        delete(&directory, GITHUB_TOKEN).unwrap();

        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn file_backend_restricts_permissions() {
        force_backend(SecretBackend::File);
        let directory = temporary_directory("permissions");
        set(&directory, GITHUB_TOKEN, "gho_example").unwrap();

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(file_path(&directory)).unwrap().permissions().mode();
            assert_eq!(mode & 0o777, 0o600, "secret file must not be group or world readable");
        }

        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn secret_environment_values_are_scoped_per_profile_and_key() {
        force_backend(SecretBackend::File);
        let directory = temporary_directory("scoping");

        set(&directory, &env_var_key("profile-a", "TOKEN"), "a-token").unwrap();
        set(&directory, &env_var_key("profile-b", "TOKEN"), "b-token").unwrap();
        set(&directory, &env_var_key("profile-a", "OTHER"), "a-other").unwrap();

        assert_eq!(
            get(&directory, &env_var_key("profile-a", "TOKEN")).unwrap(),
            Some("a-token".to_string())
        );
        assert_eq!(
            get(&directory, &env_var_key("profile-b", "TOKEN")).unwrap(),
            Some("b-token".to_string())
        );

        // Removing one profile's keys must not disturb another's values.
        delete(&directory, &env_var_key("profile-a", "TOKEN")).unwrap();
        delete(&directory, &env_var_key("profile-a", "OTHER")).unwrap();
        assert_eq!(get(&directory, &env_var_key("profile-a", "TOKEN")).unwrap(), None);
        assert_eq!(get(&directory, &env_var_key("profile-a", "OTHER")).unwrap(), None);
        assert_eq!(
            get(&directory, &env_var_key("profile-b", "TOKEN")).unwrap(),
            Some("b-token".to_string())
        );

        std::fs::remove_dir_all(directory).unwrap();
    }
}
