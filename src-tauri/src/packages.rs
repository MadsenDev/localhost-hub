use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::process::Command;
use tokio::time::timeout;

const PACKAGE_ACTION_TIMEOUT: Duration = Duration::from_secs(600);
const MAX_OUTPUT_BYTES: usize = 256 * 1024;

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PackageManager {
    Npm,
    Pnpm,
    Yarn,
    Bun,
}

impl PackageManager {
    fn executable(self) -> &'static str {
        #[cfg(target_os = "windows")]
        {
            match self {
                Self::Npm => "npm.cmd",
                Self::Pnpm => "pnpm.cmd",
                Self::Yarn => "yarn.cmd",
                Self::Bun => "bun.exe",
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            match self {
                Self::Npm => "npm",
                Self::Pnpm => "pnpm",
                Self::Yarn => "yarn",
                Self::Bun => "bun",
            }
        }
    }
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DependencyKind {
    Dependency,
    DevDependency,
    PeerDependency,
    OptionalDependency,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProjectPackage {
    pub name: String,
    pub requested_version: String,
    pub installed_version: Option<String>,
    pub kind: DependencyKind,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProjectPackages {
    pub package_manager: PackageManager,
    pub packages: Vec<ProjectPackage>,
    pub installed_count: usize,
    pub missing_count: usize,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PackageAction {
    InstallAll,
    Add,
    Remove,
    Update,
    Audit,
    Outdated,
    RegenerateLockfile,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PackageActionPayload {
    pub project_path: String,
    pub action: PackageAction,
    pub package_name: Option<String>,
    pub version: Option<String>,
    #[serde(default)]
    pub dev: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct PackageActionResult {
    pub package_manager: PackageManager,
    pub command: String,
    pub success: bool,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

pub fn inspect_project(project_path: String) -> Result<ProjectPackages, String> {
    let project = validate_project_path(&project_path)?;
    let manifest_path = project.join("package.json");
    let manifest_text = std::fs::read_to_string(&manifest_path)
        .map_err(|error| format!("Could not read {}: {error}", manifest_path.display()))?;
    let manifest: Value = serde_json::from_str(&manifest_text)
        .map_err(|error| format!("Invalid package.json: {error}"))?;
    let manager = detect_package_manager(&project, &manifest);
    let mut packages = Vec::new();
    for (field, kind) in [
        ("dependencies", DependencyKind::Dependency),
        ("devDependencies", DependencyKind::DevDependency),
        ("peerDependencies", DependencyKind::PeerDependency),
        ("optionalDependencies", DependencyKind::OptionalDependency),
    ] {
        let Some(entries) = manifest.get(field).and_then(Value::as_object) else {
            continue;
        };
        for (name, requested) in entries {
            let Some(requested_version) = requested.as_str() else {
                continue;
            };
            packages.push(ProjectPackage {
                name: name.clone(),
                requested_version: requested_version.to_string(),
                installed_version: installed_version(&project, name),
                kind,
            });
        }
    }
    packages.sort_by(|left, right| left.name.cmp(&right.name));
    let installed_count = packages
        .iter()
        .filter(|package| package.installed_version.is_some())
        .count();
    Ok(ProjectPackages {
        package_manager: manager,
        missing_count: packages.len().saturating_sub(installed_count),
        installed_count,
        packages,
    })
}

pub async fn run_action(payload: PackageActionPayload) -> Result<PackageActionResult, String> {
    let project = validate_project_path(&payload.project_path)?;
    let manifest_text = std::fs::read_to_string(project.join("package.json"))
        .map_err(|error| format!("Could not read package.json: {error}"))?;
    let manifest: Value = serde_json::from_str(&manifest_text)
        .map_err(|error| format!("Invalid package.json: {error}"))?;
    let manager = detect_package_manager(&project, &manifest);
    let args = action_args(
        manager,
        payload.action,
        payload.package_name.as_deref(),
        payload.version.as_deref(),
        payload.dev,
    )?;
    let command_label = std::iter::once(manager.executable().to_string())
        .chain(args.iter().cloned())
        .collect::<Vec<_>>()
        .join(" ");
    let mut command = Command::new(manager.executable());
    command
        .args(&args)
        .current_dir(&project)
        .kill_on_drop(true);
    let output = timeout(PACKAGE_ACTION_TIMEOUT, command.output())
        .await
        .map_err(|_| format!("Package action timed out after {} seconds.", PACKAGE_ACTION_TIMEOUT.as_secs()))?
        .map_err(|error| format!("Could not run {}: {error}", manager.executable()))?;
    let success = output.status.success()
        || matches!(payload.action, PackageAction::Audit | PackageAction::Outdated);
    Ok(PackageActionResult {
        package_manager: manager,
        command: command_label,
        success,
        exit_code: output.status.code(),
        stdout: bounded_output(output.stdout),
        stderr: bounded_output(output.stderr),
    })
}

fn validate_project_path(project_path: &str) -> Result<PathBuf, String> {
    let project = PathBuf::from(project_path)
        .canonicalize()
        .map_err(|error| format!("Project directory is unavailable: {error}"))?;
    if !project.is_dir() {
        return Err("Project path must be a directory.".to_string());
    }
    if !project.join("package.json").is_file() {
        return Err("Package management requires a package.json in the project root.".to_string());
    }
    Ok(project)
}

fn detect_package_manager(project: &Path, manifest: &Value) -> PackageManager {
    if project.join("pnpm-lock.yaml").is_file() {
        return PackageManager::Pnpm;
    }
    if project.join("yarn.lock").is_file() {
        return PackageManager::Yarn;
    }
    if project.join("bun.lock").is_file() || project.join("bun.lockb").is_file() {
        return PackageManager::Bun;
    }
    if project.join("package-lock.json").is_file() {
        return PackageManager::Npm;
    }
    match manifest
        .get("packageManager")
        .and_then(Value::as_str)
        .and_then(|declaration| declaration.split('@').next())
    {
        Some("pnpm") => PackageManager::Pnpm,
        Some("yarn") => PackageManager::Yarn,
        Some("bun") => PackageManager::Bun,
        _ => PackageManager::Npm,
    }
}

fn installed_version(project: &Path, package_name: &str) -> Option<String> {
    let package_path = package_name
        .split('/')
        .fold(project.join("node_modules"), |path, segment| path.join(segment))
        .join("package.json");
    let text = std::fs::read_to_string(package_path).ok()?;
    serde_json::from_str::<Value>(&text)
        .ok()?
        .get("version")?
        .as_str()
        .map(str::to_string)
}

fn action_args(
    manager: PackageManager,
    action: PackageAction,
    package_name: Option<&str>,
    version: Option<&str>,
    dev: bool,
) -> Result<Vec<String>, String> {
    let package = match action {
        PackageAction::Add | PackageAction::Remove | PackageAction::Update => {
            let name = package_name.ok_or_else(|| "Choose a package first.".to_string())?;
            validate_package_name(name)?;
            Some(name)
        }
        _ => None,
    };
    if let Some(version) = version {
        validate_version(version)?;
    }
    let package_spec = package.map(|name| match version {
        Some(version) if action == PackageAction::Add => format!("{name}@{version}"),
        _ => name.to_string(),
    });
    let args = match (manager, action) {
        (PackageManager::Yarn, PackageAction::InstallAll) => vec![],
        (_, PackageAction::InstallAll) => vec!["install".to_string()],
        (PackageManager::Npm, PackageAction::Add) => {
            let mut args = vec!["install".to_string()];
            if dev {
                args.push("--save-dev".to_string());
            }
            args.push(package_spec.expect("validated package"));
            args
        }
        (PackageManager::Pnpm, PackageAction::Add) => {
            let mut args = vec!["add".to_string()];
            if dev {
                args.push("--save-dev".to_string());
            }
            args.push(package_spec.expect("validated package"));
            args
        }
        (PackageManager::Yarn | PackageManager::Bun, PackageAction::Add) => {
            let mut args = vec!["add".to_string()];
            if dev {
                args.push("--dev".to_string());
            }
            args.push(package_spec.expect("validated package"));
            args
        }
        (PackageManager::Npm, PackageAction::Remove) => {
            vec!["uninstall".to_string(), package_spec.expect("validated package")]
        }
        (_, PackageAction::Remove) => {
            vec!["remove".to_string(), package_spec.expect("validated package")]
        }
        (PackageManager::Yarn, PackageAction::Update) => {
            vec!["up".to_string(), package_spec.expect("validated package")]
        }
        (PackageManager::Bun, PackageAction::Update) => {
            vec!["update".to_string(), package_spec.expect("validated package")]
        }
        (_, PackageAction::Update) => {
            vec!["update".to_string(), package_spec.expect("validated package")]
        }
        (_, PackageAction::Audit) => vec!["audit".to_string()],
        (_, PackageAction::Outdated) => vec!["outdated".to_string()],
        (PackageManager::Pnpm, PackageAction::RegenerateLockfile) => {
            vec!["install".to_string(), "--lockfile-only".to_string()]
        }
        (PackageManager::Yarn, PackageAction::RegenerateLockfile) => vec![
            "install".to_string(),
            "--mode=update-lockfile".to_string(),
        ],
        (PackageManager::Bun, PackageAction::RegenerateLockfile) => {
            vec!["install".to_string()]
        }
        (PackageManager::Npm, PackageAction::RegenerateLockfile) => vec![
            "install".to_string(),
            "--package-lock-only".to_string(),
        ],
    };
    Ok(args)
}

fn validate_package_name(name: &str) -> Result<(), String> {
    fn valid_component(component: &str) -> bool {
        !component.is_empty()
            && component != "."
            && component != ".."
            && !component.starts_with('-')
            && !component.starts_with('.')
            && component.chars().all(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '_' | '-' | '.')
            })
    }
    let valid = if let Some(scoped) = name.strip_prefix('@') {
        let mut parts = scoped.split('/');
        matches!(
            (parts.next(), parts.next(), parts.next()),
            (Some(scope), Some(package), None)
                if valid_component(scope) && valid_component(package)
        )
    } else {
        !name.contains('@') && !name.contains('/') && valid_component(name)
    };
    if !valid {
        return Err("Package names may contain letters, numbers, @, /, _, - and . only.".to_string());
    }
    Ok(())
}

fn validate_version(version: &str) -> Result<(), String> {
    let valid = !version.is_empty()
        && !version.starts_with('-')
        && version.chars().all(|character| {
            character.is_ascii_alphanumeric()
                || matches!(
                    character,
                    '.' | '-' | '+' | '_' | '^' | '~' | '<' | '>' | '=' | '|' | '*'
                )
        });
    if !valid {
        return Err("Use a semantic version, range, or package tag.".to_string());
    }
    Ok(())
}

fn bounded_output(bytes: Vec<u8>) -> String {
    if bytes.len() <= MAX_OUTPUT_BYTES {
        return String::from_utf8_lossy(&bytes).to_string();
    }
    let start = bytes.len() - MAX_OUTPUT_BYTES;
    format!(
        "[earlier output truncated]\n{}",
        String::from_utf8_lossy(&bytes[start..])
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn fixture() -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "localhost-hub-packages-{}-{nonce}",
            std::process::id()
        ));
        std::fs::create_dir_all(&path).expect("fixture");
        path
    }

    #[test]
    fn inspects_declared_and_installed_packages() {
        let path = fixture();
        std::fs::write(
            path.join("package.json"),
            r#"{
                "packageManager": "pnpm@10.0.0",
                "dependencies": { "react": "^19.2.0" },
                "devDependencies": { "@types/node": "^24.0.0" }
            }"#,
        )
        .expect("manifest");
        let installed = path.join("node_modules/react");
        std::fs::create_dir_all(&installed).expect("installed package");
        std::fs::write(installed.join("package.json"), r#"{"version":"19.2.0"}"#)
            .expect("installed manifest");

        let result = inspect_project(path.to_string_lossy().to_string()).expect("inspect");

        assert_eq!(result.package_manager, PackageManager::Pnpm);
        assert_eq!(result.packages.len(), 2);
        assert_eq!(result.installed_count, 1);
        assert_eq!(result.missing_count, 1);
        assert_eq!(result.packages[1].name, "react");
        assert_eq!(result.packages[1].installed_version.as_deref(), Some("19.2.0"));
        std::fs::remove_dir_all(path).expect("cleanup");
    }

    #[test]
    fn builds_manager_specific_argument_lists_without_a_shell() {
        assert_eq!(
            action_args(
                PackageManager::Npm,
                PackageAction::Add,
                Some("@types/node"),
                Some("^24.0.0"),
                true,
            )
            .expect("args"),
            vec!["install", "--save-dev", "@types/node@^24.0.0"]
        );
        assert_eq!(
            action_args(
                PackageManager::Yarn,
                PackageAction::RegenerateLockfile,
                None,
                None,
                false,
            )
            .expect("args"),
            vec!["install", "--mode=update-lockfile"]
        );
    }

    #[test]
    fn rejects_option_injection_and_non_semver_install_values() {
        assert!(validate_package_name("--ignore-scripts").is_err());
        assert!(validate_package_name("left-pad;touch").is_err());
        assert!(validate_package_name("..").is_err());
        assert!(validate_package_name("@scope/../package").is_err());
        assert!(validate_package_name("@scope/package").is_ok());
        assert!(validate_version("1.0.0 && echo").is_err());
        assert!(validate_version("latest").is_ok());
    }
}
