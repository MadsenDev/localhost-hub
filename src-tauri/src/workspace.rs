use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

const DEFAULT_MAX_DEPTH: usize = 4;
const DEFAULT_IGNORED_DIRS: &[&str] = &[
    ".git",
    ".next",
    ".turbo",
    ".venv",
    "__pycache__",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "out",
    "target",
    "vendor",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceGroup {
    pub id: String,
    pub name: String,
    pub path: String,
    pub projects: Vec<DetectedProject>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedProject {
    pub id: String,
    pub path: String,
    pub name: String,
    pub framework: String,
    pub package_manager: String,
    pub scripts: Vec<ScriptEntry>,
    pub has_git: bool,
    pub git_root: Option<String>,
    pub has_env: bool,
    pub env_files: Vec<String>,
    pub manifests: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptEntry {
    pub name: String,
    /// A command that can be executed directly in the project directory.
    pub cmd: String,
    /// The manifest value before Localhost Hub wraps it with a runner.
    pub raw_cmd: String,
    pub runner: String,
    pub description: Option<String>,
}

#[derive(Debug)]
struct ScanOptions {
    max_depth: usize,
    ignored_dirs: HashSet<String>,
}

impl ScanOptions {
    fn new(max_depth: Option<usize>, ignore_patterns: Option<Vec<String>>) -> Self {
        let mut ignored_dirs = DEFAULT_IGNORED_DIRS
            .iter()
            .map(|value| value.to_string())
            .collect::<HashSet<_>>();

        for pattern in ignore_patterns.unwrap_or_default() {
            let normalized = pattern.trim().trim_end_matches('/').to_string();
            if !normalized.is_empty() {
                ignored_dirs.insert(normalized);
            }
        }

        Self {
            max_depth: max_depth.unwrap_or(DEFAULT_MAX_DEPTH),
            ignored_dirs,
        }
    }
}

/// Scan configured roots for projects. Manifest directories are projects even
/// when they are not Git repositories, and discovery continues inside a
/// project so monorepo packages are not lost.
pub fn scan_as_workspace_groups(
    roots: &[String],
    max_depth: Option<usize>,
    ignore_patterns: Option<Vec<String>>,
) -> Vec<WorkspaceGroup> {
    let projects = scan_roots(roots, max_depth, ignore_patterns);
    let mut id_counts: HashMap<String, usize> = HashMap::new();

    projects
        .into_iter()
        .map(|project| {
            let base_id = slugify(&project.name);
            let count = id_counts.entry(base_id.clone()).or_insert(0);
            let id = if *count == 0 {
                base_id
            } else {
                format!("{base_id}-{}", stable_path_id(Path::new(&project.path)))
            };
            *count += 1;

            WorkspaceGroup {
                id,
                name: project.name.clone(),
                path: project.path.clone(),
                projects: vec![project],
            }
        })
        .collect()
}

pub fn scan_for_projects(
    root_path: &str,
    max_depth: usize,
    ignore_patterns: Option<Vec<String>>,
) -> Vec<DetectedProject> {
    scan_roots(&[root_path.to_string()], Some(max_depth), ignore_patterns)
}

fn scan_roots(
    roots: &[String],
    max_depth: Option<usize>,
    ignore_patterns: Option<Vec<String>>,
) -> Vec<DetectedProject> {
    let options = ScanOptions::new(max_depth, ignore_patterns);
    let mut projects = Vec::new();
    let mut visited_dirs = HashSet::new();
    let mut seen_projects = HashSet::new();

    for root in roots {
        let trimmed = root.trim();
        if trimmed.is_empty() {
            continue;
        }

        let root_path = canonical_or_original(Path::new(trimmed));
        walk_projects(
            &root_path,
            0,
            &options,
            &mut visited_dirs,
            &mut seen_projects,
            &mut projects,
        );
    }

    projects.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then_with(|| a.path.cmp(&b.path))
    });
    projects
}

fn walk_projects(
    path: &Path,
    depth: usize,
    options: &ScanOptions,
    visited_dirs: &mut HashSet<PathBuf>,
    seen_projects: &mut HashSet<PathBuf>,
    projects: &mut Vec<DetectedProject>,
) {
    if options.max_depth > 0 && depth > options.max_depth {
        return;
    }

    let canonical = canonical_or_original(path);
    if !visited_dirs.insert(canonical.clone()) {
        return;
    }

    if depth > 0 && should_ignore(&canonical, &options.ignored_dirs) {
        return;
    }

    let Ok(entries) = fs::read_dir(&canonical) else {
        return;
    };

    let mut children = Vec::new();
    let mut file_names = HashSet::new();
    for entry in entries.flatten() {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        let name = entry.file_name().to_string_lossy().to_string();
        if file_type.is_file() || file_type.is_symlink() {
            file_names.insert(name);
        } else if file_type.is_dir() {
            children.push(entry.path());
        }
    }

    let manifests = detected_manifests(&file_names);
    let has_local_git = file_names.contains(".git") || canonical.join(".git").exists();
    if (!manifests.is_empty() || has_local_git) && seen_projects.insert(canonical.clone()) {
        projects.push(detect_project(&canonical, manifests));
    }

    children.sort();
    for child in children {
        walk_projects(
            &child,
            depth + 1,
            options,
            visited_dirs,
            seen_projects,
            projects,
        );
    }
}

fn should_ignore(path: &Path, ignored_dirs: &HashSet<String>) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.starts_with('.') || ignored_dirs.contains(name))
        .unwrap_or(false)
}

fn detected_manifests(file_names: &HashSet<String>) -> Vec<String> {
    let candidates = [
        "package.json",
        "Cargo.toml",
        "go.mod",
        "pyproject.toml",
        "requirements.txt",
        "Gemfile",
        "composer.json",
    ];
    candidates
        .iter()
        .filter(|candidate| file_names.contains(*candidate))
        .map(|candidate| candidate.to_string())
        .collect()
}

fn detect_project(path: &Path, manifests: Vec<String>) -> DetectedProject {
    let stack = detect_stack(path);
    let fallback_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("project");
    let name = stack.name.unwrap_or_else(|| fallback_name.to_string());
    let git_root = find_git_root(path).map(|root| root.to_string_lossy().to_string());
    let env_files = detect_env_files(path);

    DetectedProject {
        id: stable_path_id(path),
        path: path.to_string_lossy().to_string(),
        name,
        framework: stack.framework,
        package_manager: stack.package_manager,
        scripts: stack.scripts,
        has_git: git_root.is_some(),
        git_root,
        has_env: env_files.iter().any(|name| !is_env_template(name)),
        env_files,
        manifests,
    }
}

struct DetectedStack {
    name: Option<String>,
    framework: String,
    package_manager: String,
    scripts: Vec<ScriptEntry>,
}

fn detect_stack(path: &Path) -> DetectedStack {
    let package = read_json(path.join("package.json"));
    let cargo = read_toml(path.join("Cargo.toml"));

    if let Some(package) = package {
        let package_manager = detect_js_package_manager(path, &package);
        let mut scripts = extract_js_scripts(&package, &package_manager);
        if let Some(cargo) = cargo.as_ref() {
            for mut cargo_script in extract_cargo_scripts(path, cargo) {
                if scripts
                    .iter()
                    .any(|script| script.name == cargo_script.name)
                {
                    cargo_script.name = format!("cargo:{}", cargo_script.name);
                }
                scripts.push(cargo_script);
            }
        }
        return DetectedStack {
            name: package
                .get("name")
                .and_then(JsonValue::as_str)
                .map(ToOwned::to_owned),
            framework: detect_js_framework(&package),
            scripts,
            package_manager,
        };
    }

    if let Some(cargo) = cargo {
        let name = cargo
            .get("package")
            .and_then(|package| package.get("name"))
            .and_then(toml::Value::as_str)
            .map(ToOwned::to_owned);
        return DetectedStack {
            name,
            framework: "Rust".to_string(),
            package_manager: "cargo".to_string(),
            scripts: extract_cargo_scripts(path, &cargo),
        };
    }

    if path.join("go.mod").exists() {
        return DetectedStack {
            name: read_go_module_name(path),
            framework: "Go".to_string(),
            package_manager: "go".to_string(),
            scripts: vec![
                script("run", "go run .", "go", None),
                script("build", "go build", "go", None),
                script("test", "go test ./...", "go", None),
            ],
        };
    }

    if let Some(pyproject) = read_toml(path.join("pyproject.toml")) {
        let name = pyproject
            .get("project")
            .and_then(|project| project.get("name"))
            .and_then(toml::Value::as_str)
            .or_else(|| {
                pyproject
                    .get("tool")
                    .and_then(|tool| tool.get("poetry"))
                    .and_then(|poetry| poetry.get("name"))
                    .and_then(toml::Value::as_str)
            })
            .map(ToOwned::to_owned);
        let package_manager = detect_python_package_manager(path);
        return DetectedStack {
            name,
            framework: detect_python_framework(path, &pyproject),
            scripts: python_scripts(&package_manager),
            package_manager,
        };
    }

    if path.join("requirements.txt").exists() {
        return DetectedStack {
            name: None,
            framework: detect_python_framework(path, &toml::Value::Table(Default::default())),
            package_manager: "pip".to_string(),
            scripts: python_scripts("pip"),
        };
    }

    if path.join("Gemfile").exists() {
        return DetectedStack {
            name: None,
            framework: if file_contains(path.join("Gemfile"), "rails") {
                "Rails".to_string()
            } else {
                "Ruby".to_string()
            },
            package_manager: "bundler".to_string(),
            scripts: vec![
                script("run", "bundle exec ruby", "bundler", None),
                script("test", "bundle exec rspec", "bundler", None),
            ],
        };
    }

    if let Some(composer) = read_json(path.join("composer.json")) {
        return DetectedStack {
            name: composer
                .get("name")
                .and_then(JsonValue::as_str)
                .and_then(|name| name.rsplit('/').next())
                .map(ToOwned::to_owned),
            framework: if json_has_dependency(&composer, "laravel/framework") {
                "Laravel".to_string()
            } else {
                "PHP".to_string()
            },
            package_manager: "composer".to_string(),
            scripts: vec![script(
                "install",
                "composer install",
                "composer",
                None,
            )],
        };
    }

    DetectedStack {
        name: None,
        framework: "Project".to_string(),
        package_manager: String::new(),
        scripts: Vec::new(),
    }
}

fn extract_js_scripts(package: &JsonValue, package_manager: &str) -> Vec<ScriptEntry> {
    let metadata = package
        .get("scripts-meta")
        .or_else(|| package.get("scriptsMeta"));

    package
        .get("scripts")
        .and_then(JsonValue::as_object)
        .map(|scripts| {
            scripts
                .iter()
                .filter_map(|(name, value)| {
                    let raw_cmd = value.as_str()?.to_string();
                    let description = metadata
                        .and_then(|meta| meta.get(name))
                        .and_then(|entry| {
                            entry.as_str().map(ToOwned::to_owned).or_else(|| {
                                entry
                                    .get("description")
                                    .and_then(JsonValue::as_str)
                                    .map(ToOwned::to_owned)
                            })
                        });
                    Some(ScriptEntry {
                        name: name.clone(),
                        cmd: js_script_command(package_manager, name),
                        raw_cmd,
                        runner: package_manager.to_string(),
                        description,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn extract_cargo_scripts(path: &Path, cargo: &toml::Value) -> Vec<ScriptEntry> {
    let mut scripts = vec![
        script(
            "build",
            "cargo build",
            "cargo",
            Some("Compile the current package and dependencies."),
        ),
        script(
            "check",
            "cargo check",
            "cargo",
            Some("Type-check the package without producing binaries."),
        ),
        script(
            "run",
            "cargo run",
            "cargo",
            Some("Build and run the current package."),
        ),
        script(
            "test",
            "cargo test",
            "cargo",
            Some("Execute all tests."),
        ),
        script("fmt", "cargo fmt", "cargo", Some("Format with rustfmt.")),
        script(
            "clippy",
            "cargo clippy",
            "cargo",
            Some("Lint with Clippy."),
        ),
        script(
            "doc",
            "cargo doc",
            "cargo",
            Some("Build project documentation."),
        ),
    ];

    let config = read_toml(path.join(".cargo/config.toml"))
        .or_else(|| read_toml(path.join(".cargo/config")));
    let aliases = config
        .as_ref()
        .and_then(|value| value.get("alias"))
        .or_else(|| cargo.get("alias"))
        .and_then(toml::Value::as_table);

    if let Some(aliases) = aliases {
        for (name, target) in aliases {
            let Some(raw_cmd) = target.as_str() else {
                continue;
            };
            scripts.push(ScriptEntry {
                name: name.clone(),
                cmd: format!("cargo {name}"),
                raw_cmd: raw_cmd.to_string(),
                runner: "cargo".to_string(),
                description: Some(format!("Cargo alias for \"{raw_cmd}\".")),
            });
        }
    }

    scripts
}

fn script(
    name: &str,
    command: &str,
    runner: &str,
    description: Option<&str>,
) -> ScriptEntry {
    ScriptEntry {
        name: name.to_string(),
        cmd: command.to_string(),
        raw_cmd: command.to_string(),
        runner: runner.to_string(),
        description: description.map(ToOwned::to_owned),
    }
}

fn js_script_command(package_manager: &str, name: &str) -> String {
    match package_manager {
        "yarn" => format!("yarn {name}"),
        "bun" => format!("bun run {name}"),
        "pnpm" => format!("pnpm run {name}"),
        _ => format!("npm run {name}"),
    }
}

fn detect_js_framework(package: &JsonValue) -> String {
    if json_has_dependency(package, "@tauri-apps/api") {
        return "Tauri".to_string();
    }
    if json_has_dependency(package, "electron") {
        return "Electron".to_string();
    }
    if json_has_dependency(package, "next") {
        return "Next.js".to_string();
    }
    if json_has_dependency(package, "@remix-run/node") {
        return "Remix".to_string();
    }
    if json_has_dependency(package, "@sveltejs/kit") {
        return "SvelteKit".to_string();
    }
    if json_has_dependency(package, "nuxt") {
        return "Nuxt".to_string();
    }
    if json_has_dependency(package, "astro") {
        return "Astro".to_string();
    }
    if json_has_dependency(package, "@angular/core") {
        return "Angular".to_string();
    }

    let has_vite = json_has_dependency(package, "vite");
    if has_vite && json_has_dependency(package, "react") {
        return "React + Vite".to_string();
    }
    if has_vite && json_has_dependency(package, "vue") {
        return "Vue + Vite".to_string();
    }
    if has_vite && json_has_dependency(package, "solid-js") {
        return "Solid + Vite".to_string();
    }
    if has_vite {
        return "Vite".to_string();
    }
    if json_has_dependency(package, "react") {
        return "React".to_string();
    }
    if json_has_dependency(package, "vue") {
        return "Vue".to_string();
    }
    if json_has_dependency(package, "express") {
        return "Express".to_string();
    }
    if json_has_dependency(package, "fastify") {
        return "Fastify".to_string();
    }
    if json_has_dependency(package, "hono") {
        return "Hono".to_string();
    }
    if json_has_dependency(package, "elysia") {
        return "Elysia".to_string();
    }
    if json_has_dependency(package, "typescript") {
        return "TypeScript".to_string();
    }
    "Node.js".to_string()
}

fn json_has_dependency(package: &JsonValue, name: &str) -> bool {
    ["dependencies", "devDependencies", "peerDependencies"]
        .iter()
        .any(|section| package.get(section).and_then(|deps| deps.get(name)).is_some())
}

fn detect_js_package_manager(path: &Path, package: &JsonValue) -> String {
    if let Some(declared) = package.get("packageManager").and_then(JsonValue::as_str) {
        let manager = declared.split('@').next().unwrap_or_default();
        if matches!(manager, "npm" | "pnpm" | "yarn" | "bun") {
            return manager.to_string();
        }
    }
    if path.join("bun.lockb").exists() || path.join("bun.lock").exists() {
        return "bun".to_string();
    }
    if path.join("pnpm-lock.yaml").exists() {
        return "pnpm".to_string();
    }
    if path.join("yarn.lock").exists() {
        return "yarn".to_string();
    }
    "npm".to_string()
}

fn detect_python_package_manager(path: &Path) -> String {
    if path.join("uv.lock").exists() {
        "uv".to_string()
    } else if path.join("poetry.lock").exists() {
        "poetry".to_string()
    } else if path.join("Pipfile").exists() {
        "pipenv".to_string()
    } else {
        "pip".to_string()
    }
}

fn detect_python_framework(path: &Path, pyproject: &toml::Value) -> String {
    let serialized = pyproject.to_string().to_lowercase();
    if serialized.contains("fastapi") || file_contains(path.join("requirements.txt"), "fastapi") {
        "FastAPI".to_string()
    } else if serialized.contains("django")
        || file_contains(path.join("requirements.txt"), "django")
    {
        "Django".to_string()
    } else if serialized.contains("flask") || file_contains(path.join("requirements.txt"), "flask") {
        "Flask".to_string()
    } else {
        "Python".to_string()
    }
}

fn python_scripts(package_manager: &str) -> Vec<ScriptEntry> {
    let test_command = match package_manager {
        "uv" => "uv run pytest",
        "poetry" => "poetry run pytest",
        "pipenv" => "pipenv run pytest",
        _ => "python -m pytest",
    };
    vec![
        script("run", "python -m main", package_manager, None),
        script("test", test_command, package_manager, None),
    ]
}

fn read_go_module_name(path: &Path) -> Option<String> {
    fs::read_to_string(path.join("go.mod"))
        .ok()?
        .lines()
        .find_map(|line| line.trim().strip_prefix("module "))
        .and_then(|module| module.rsplit('/').next())
        .map(ToOwned::to_owned)
}

fn detect_env_files(path: &Path) -> Vec<String> {
    let mut env_files = fs::read_dir(path)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| {
            let file_type = entry.file_type().ok()?;
            if !file_type.is_file() {
                return None;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            (name == ".env" || name.starts_with(".env.")).then_some(name)
        })
        .collect::<Vec<_>>();
    env_files.sort();
    env_files
}

fn is_env_template(name: &str) -> bool {
    [".example", ".sample", ".template"]
        .iter()
        .any(|suffix| name.ends_with(suffix))
}

fn find_git_root(path: &Path) -> Option<PathBuf> {
    path.ancestors()
        .find(|candidate| candidate.join(".git").exists())
        .map(canonical_or_original)
}

fn read_json(path: PathBuf) -> Option<JsonValue> {
    serde_json::from_str(&fs::read_to_string(path).ok()?).ok()
}

fn read_toml(path: PathBuf) -> Option<toml::Value> {
    toml::from_str(&fs::read_to_string(path).ok()?).ok()
}

fn file_contains(path: PathBuf, needle: &str) -> bool {
    fs::read_to_string(path)
        .map(|content| content.to_lowercase().contains(&needle.to_lowercase()))
        .unwrap_or(false)
}

fn canonical_or_original(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
}

fn slugify(value: &str) -> String {
    let slug = value
        .to_lowercase()
        .chars()
        .map(|character| {
            if character.is_alphanumeric() {
                character
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    if slug.is_empty() {
        "project".to_string()
    } else {
        slug
    }
}

fn stable_path_id(path: &Path) -> String {
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in path.to_string_lossy().as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:012x}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn fixture(name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "localhost-hub-workspace-test-{}-{name}-{nonce}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("create fixture");
        path
    }

    #[test]
    fn discovers_non_git_and_nested_manifest_projects() {
        let root = fixture("nested");
        fs::write(
            root.join("package.json"),
            r#"{"name":"root-app","scripts":{"dev":"vite"},"devDependencies":{"vite":"1"}}"#,
        )
        .expect("root manifest");
        fs::create_dir_all(root.join("packages/api")).expect("nested dir");
        fs::write(
            root.join("packages/api/package.json"),
            r#"{"name":"api","scripts":{"start":"node index.js"}}"#,
        )
        .expect("nested manifest");

        let projects = scan_for_projects(root.to_str().unwrap(), 4, None);
        assert_eq!(projects.len(), 2);
        assert!(projects.iter().any(|project| project.name == "root-app"));
        assert!(projects.iter().any(|project| project.name == "api"));

        fs::remove_dir_all(root).expect("remove fixture");
    }

    #[test]
    fn ignores_dependency_directories() {
        let root = fixture("ignored");
        fs::create_dir_all(root.join("node_modules/fake")).expect("dependency dir");
        fs::write(
            root.join("node_modules/fake/package.json"),
            r#"{"name":"should-not-appear"}"#,
        )
        .expect("dependency manifest");

        assert!(scan_for_projects(root.to_str().unwrap(), 0, None).is_empty());
        fs::remove_dir_all(root).expect("remove fixture");
    }

    #[test]
    fn detects_declared_package_manager_and_builds_runnable_scripts() {
        let root = fixture("package-manager");
        fs::write(
            root.join("package.json"),
            r#"{
                "name":"web",
                "packageManager":"pnpm@10.0.0",
                "scripts":{"dev":"vite"},
                "scripts-meta":{"dev":{"description":"Run the dev server"}},
                "dependencies":{"react":"19"},
                "devDependencies":{"vite":"7"}
            }"#,
        )
        .expect("manifest");

        let project = scan_for_projects(root.to_str().unwrap(), 2, None)
            .into_iter()
            .next()
            .expect("project");
        assert_eq!(project.framework, "React + Vite");
        assert_eq!(project.package_manager, "pnpm");
        assert_eq!(project.scripts[0].cmd, "pnpm run dev");
        assert_eq!(project.scripts[0].raw_cmd, "vite");
        assert_eq!(
            project.scripts[0].description.as_deref(),
            Some("Run the dev server")
        );

        fs::remove_dir_all(root).expect("remove fixture");
    }

    #[test]
    fn nested_project_inherits_git_detection() {
        let root = fixture("git");
        fs::create_dir(root.join(".git")).expect("git dir");
        fs::create_dir_all(root.join("packages/app")).expect("app dir");
        fs::write(
            root.join("packages/app/package.json"),
            r#"{"name":"nested-app"}"#,
        )
        .expect("manifest");

        let projects = scan_for_projects(root.to_str().unwrap(), 4, None);
        let nested = projects
            .iter()
            .find(|project| project.name == "nested-app")
            .expect("nested project");
        assert!(nested.has_git);
        let expected_root = root.canonicalize().unwrap().to_string_lossy().to_string();
        assert_eq!(nested.git_root.as_deref(), Some(expected_root.as_str()));

        fs::remove_dir_all(root).expect("remove fixture");
    }
}
