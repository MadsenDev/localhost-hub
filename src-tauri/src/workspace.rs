use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceGroup {
    pub id: String,
    pub name: String,
    pub path: String,
    pub projects: Vec<DetectedProject>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedProject {
    pub path: String,
    pub name: String,
    pub framework: String,
    pub package_manager: String,
    pub scripts: Vec<ScriptEntry>,
    pub has_git: bool,
    pub has_env: bool,
    pub env_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptEntry {
    pub name: String,
    pub cmd: String,
}

/// Scan roots for git repositories. Each .git dir = one workspace.
pub fn scan_as_workspace_groups(roots: &[String]) -> Vec<WorkspaceGroup> {
    let mut repos: Vec<DetectedProject> = Vec::new();
    for root in roots {
        find_git_repos(Path::new(root), 0, 4, &mut repos);
    }
    repos.sort_by(|a, b| a.name.cmp(&b.name));

    // Deduplicate IDs in case two repos share the same folder name
    let mut id_counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    repos
        .into_iter()
        .map(|repo| {
            let base_id = slugify(&repo.name);
            let count = id_counts.entry(base_id.clone()).or_insert(0);
            let id = if *count == 0 {
                base_id
            } else {
                format!("{}-{}", base_id, count)
            };
            *count += 1;
            WorkspaceGroup {
                id,
                name: repo.name.clone(),
                path: repo.path.clone(),
                projects: vec![repo],
            }
        })
        .collect()
}

fn find_git_repos(path: &Path, depth: usize, max_depth: usize, acc: &mut Vec<DetectedProject>) {
    if depth > max_depth {
        return;
    }

    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
        if name.starts_with('.') || matches!(name, "node_modules" | "target" | "dist" | "__pycache__" | "vendor") {
            return;
        }
    }

    // Found a git repo — characterise it and stop recursing
    if path.join(".git").exists() {
        if let Some(proj) = detect_repo(path) {
            acc.push(proj);
        }
        return;
    }

    if let Ok(entries) = fs::read_dir(path) {
        let mut children: Vec<PathBuf> = entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.is_dir())
            .collect();
        children.sort();
        for child in children {
            find_git_repos(&child, depth + 1, max_depth, acc);
        }
    }
}

fn detect_repo(path: &Path) -> Option<DetectedProject> {
    let name = path.file_name()?.to_str()?.to_string();
    let (framework, package_manager, scripts) = detect_stack(path);

    let env_files: Vec<String> = [".env", ".env.local", ".env.development", ".env.production"]
        .iter()
        .filter(|f| path.join(f).exists())
        .map(|f| f.to_string())
        .collect();

    Some(DetectedProject {
        path: path.to_string_lossy().to_string(),
        name,
        framework,
        package_manager,
        scripts,
        has_git: true,
        has_env: !env_files.is_empty(),
        env_files,
    })
}

fn detect_stack(path: &Path) -> (String, String, Vec<ScriptEntry>) {
    // JavaScript / TypeScript (package.json at root)
    if let Ok(content) = fs::read_to_string(path.join("package.json")) {
        if let Ok(pkg) = serde_json::from_str::<serde_json::Value>(&content) {
            let framework = detect_js_framework(&pkg);
            let pm = detect_js_pm(path);
            let scripts = pkg["scripts"]
                .as_object()
                .map(|obj| obj.iter().map(|(k, v)| ScriptEntry {
                    name: k.clone(),
                    cmd: v.as_str().unwrap_or("").to_string(),
                }).collect())
                .unwrap_or_default();
            return (framework, pm, scripts);
        }
    }

    // Rust
    if path.join("Cargo.toml").exists() {
        let pkg_name = fs::read_to_string(path.join("Cargo.toml")).ok()
            .and_then(|s| toml::from_str::<toml::Value>(&s).ok())
            .and_then(|v| v.get("package")?.get("name")?.as_str().map(String::from));
        let label = match pkg_name.as_deref() {
            Some(n) if n != path.file_name().and_then(|x| x.to_str()).unwrap_or("") => {
                format!("Rust · {}", n)
            }
            _ => "Rust".to_string(),
        };
        return (label, "cargo".to_string(), vec![
            ScriptEntry { name: "build".into(), cmd: "cargo build".into() },
            ScriptEntry { name: "run".into(),   cmd: "cargo run".into() },
            ScriptEntry { name: "test".into(),  cmd: "cargo test".into() },
            ScriptEntry { name: "check".into(), cmd: "cargo check".into() },
        ]);
    }

    // Go
    if path.join("go.mod").exists() {
        return ("Go".to_string(), "go".to_string(), vec![
            ScriptEntry { name: "run".into(),   cmd: "go run .".into() },
            ScriptEntry { name: "build".into(), cmd: "go build".into() },
            ScriptEntry { name: "test".into(),  cmd: "go test ./...".into() },
        ]);
    }

    // Python
    if path.join("pyproject.toml").exists() {
        let pm = if which("uv") { "uv" } else { "pip" };
        return ("Python".to_string(), pm.to_string(), vec![
            ScriptEntry { name: "run".into(), cmd: "python -m main".into() },
            ScriptEntry { name: "test".into(), cmd: format!("{} run pytest", pm) },
        ]);
    }
    if path.join("requirements.txt").exists() {
        return ("Python".to_string(), "pip".to_string(), vec![
            ScriptEntry { name: "run".into(), cmd: "python main.py".into() },
        ]);
    }

    // Ruby
    if path.join("Gemfile").exists() {
        return ("Ruby".to_string(), "bundler".to_string(), vec![
            ScriptEntry { name: "run".into(),   cmd: "bundle exec ruby".into() },
            ScriptEntry { name: "test".into(),  cmd: "bundle exec rspec".into() },
        ]);
    }

    // PHP
    if path.join("composer.json").exists() {
        return ("PHP".to_string(), "composer".to_string(), vec![
            ScriptEntry { name: "install".into(), cmd: "composer install".into() },
        ]);
    }

    // Generic — we still detected the git repo, just no known build system
    ("Project".to_string(), String::new(), vec![])
}

fn detect_js_framework(pkg: &serde_json::Value) -> String {
    let has = |name: &str| -> bool {
        pkg["dependencies"].get(name).is_some() || pkg["devDependencies"].get(name).is_some()
    };
    if has("next")              { return "Next.js".into(); }
    if has("@remix-run/node")   { return "Remix".into(); }
    if has("@sveltejs/kit")     { return "SvelteKit".into(); }
    if has("nuxt")              { return "Nuxt".into(); }
    if has("astro")             { return "Astro".into(); }
    if has("@tauri-apps/api")   { return "Tauri".into(); }
    if has("vite") || pkg["devDependencies"].get("vite").is_some() {
        if has("react") { return "Vite + React".into(); }
        if has("vue")   { return "Vite + Vue".into(); }
        return "Vite".into();
    }
    if has("react")             { return "React".into(); }
    if has("vue")               { return "Vue".into(); }
    if has("express")           { return "Express".into(); }
    if has("fastify")           { return "Fastify".into(); }
    if has("hono")              { return "Hono".into(); }
    if has("elysia")            { return "Elysia".into(); }
    "Node.js".into()
}

fn detect_js_pm(path: &Path) -> String {
    if path.join("bun.lockb").exists() || path.join("bun.lock").exists() { return "bun".into(); }
    if path.join("pnpm-lock.yaml").exists()                               { return "pnpm".into(); }
    if path.join("yarn.lock").exists()                                    { return "yarn".into(); }
    "npm".into()
}

fn slugify(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

fn which(bin: &str) -> bool {
    std::process::Command::new("which").arg(bin).output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

// kept for legacy command compatibility
pub fn scan_for_projects(root_path: &str, max_depth: usize) -> Vec<DetectedProject> {
    let mut repos = Vec::new();
    find_git_repos(Path::new(root_path), 0, max_depth, &mut repos);
    repos
}
