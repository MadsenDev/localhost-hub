use git2::Repository;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::Duration;
use tokio::process::Command;
use tokio::time::timeout;
use ts_rs::TS;

const INSTALL_TIMEOUT: Duration = Duration::from_secs(600);

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "kebab-case")]
#[ts(export, export_to = "../../src/generated/")]
pub enum ProjectTemplate {
    Empty,
    NodeHttp,
    ReactVite,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export, export_to = "../../src/generated/")]
pub enum ProjectLanguage {
    Javascript,
    Typescript,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export, export_to = "../../src/generated/")]
pub enum PackageManager {
    Npm,
    Pnpm,
    Yarn,
    Bun,
}

impl PackageManager {
    fn as_str(self) -> &'static str {
        match self {
            Self::Npm => "npm",
            Self::Pnpm => "pnpm",
            Self::Yarn => "yarn",
            Self::Bun => "bun",
        }
    }

    fn declaration(self) -> &'static str {
        match self {
            Self::Npm => "npm@11.9.0",
            Self::Pnpm => "pnpm@10.14.0",
            Self::Yarn => "yarn@4.9.2",
            Self::Bun => "bun@1.2.19",
        }
    }

    fn install_executable(self) -> &'static str {
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
            self.as_str()
        }
    }
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "kebab-case")]
#[ts(export, export_to = "../../src/generated/")]
pub enum StylingPreset {
    None,
    TailwindV4,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
pub struct CreateProjectPayload {
    pub name: String,
    pub directory: String,
    #[serde(default)]
    pub description: String,
    pub template: ProjectTemplate,
    pub language: ProjectLanguage,
    pub package_manager: PackageManager,
    #[serde(default)]
    pub dependencies: Vec<String>,
    #[serde(default)]
    pub dev_dependencies: Vec<String>,
    #[serde(default)]
    pub scripts: BTreeMap<String, String>,
    pub styling: StylingPreset,
    #[serde(default)]
    pub icon_packs: Vec<String>,
    #[serde(default)]
    pub include_readme: bool,
    #[serde(default)]
    pub readme_notes: String,
    #[serde(default)]
    pub initialize_git: bool,
    #[serde(default)]
    pub install_dependencies: bool,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
pub struct CreateProjectResult {
    pub path: String,
    pub files: Vec<String>,
    pub git_initialized: bool,
    pub dependencies_installed: bool,
    pub warnings: Vec<String>,
}

pub async fn create_project(payload: CreateProjectPayload) -> Result<CreateProjectResult, String> {
    validate_payload(&payload)?;

    let base = PathBuf::from(&payload.directory);
    if !base.is_dir() {
        return Err("Choose an existing parent folder.".to_string());
    }
    let project_path = base.join(&payload.name);
    if project_path.exists() {
        return Err(format!(
            "A file or folder already exists at {}.",
            project_path.display()
        ));
    }

    fs::create_dir(&project_path)
        .map_err(|error| format!("Could not create {}: {error}", project_path.display()))?;

    let mut generated = Vec::new();
    write_project_files(&project_path, &payload, &mut generated)?;

    let mut warnings = Vec::new();
    let git_initialized = if payload.initialize_git {
        match Repository::init(&project_path) {
            Ok(_) => true,
            Err(error) => {
                warnings.push(format!("Project created, but Git initialization failed: {error}"));
                false
            }
        }
    } else {
        false
    };

    let dependencies_installed = if payload.install_dependencies {
        match install_dependencies(&project_path, payload.package_manager).await {
            Ok(()) => true,
            Err(error) => {
                warnings.push(format!("Project created, but dependency installation failed: {error}"));
                false
            }
        }
    } else {
        false
    };

    generated.sort();
    Ok(CreateProjectResult {
        path: project_path.to_string_lossy().to_string(),
        files: generated,
        git_initialized,
        dependencies_installed,
        warnings,
    })
}

fn validate_payload(payload: &CreateProjectPayload) -> Result<(), String> {
    let name = payload.name.trim();
    if name.is_empty() {
        return Err("Enter a project name.".to_string());
    }
    if name != payload.name || name.len() > 100 {
        return Err("Project names must be 1–100 characters without surrounding spaces.".to_string());
    }
    let mut components = Path::new(name).components();
    if !matches!(components.next(), Some(Component::Normal(_))) || components.next().is_some() {
        return Err("Project name must be a single folder name.".to_string());
    }
    if name == "." || name == ".." || name.starts_with('.') {
        return Err("Project name cannot be hidden or use a relative path.".to_string());
    }
    if !name
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.'))
    {
        return Err("Use only letters, numbers, hyphens, underscores, and dots in the project name.".to_string());
    }
    if payload.directory.trim().is_empty() {
        return Err("Choose a parent folder.".to_string());
    }
    for script in payload.scripts.keys() {
        if script.trim().is_empty()
            || !script
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || matches!(character, ':' | '-' | '_'))
        {
            return Err(format!("Invalid script name: {script}"));
        }
    }
    if payload.scripts.values().any(|command| command.trim().is_empty()) {
        return Err("Custom script commands cannot be empty.".to_string());
    }
    for package in payload
        .dependencies
        .iter()
        .chain(payload.dev_dependencies.iter())
        .chain(payload.icon_packs.iter())
    {
        parse_package_spec(package)?;
    }
    Ok(())
}

fn write_project_files(
    root: &Path,
    payload: &CreateProjectPayload,
    generated: &mut Vec<String>,
) -> Result<(), String> {
    let mut dependencies = BTreeMap::new();
    let mut dev_dependencies = BTreeMap::new();
    let mut scripts = default_scripts(payload);

    match payload.template {
        ProjectTemplate::ReactVite => {
            dependencies.insert("react".to_string(), "^19.2.0".to_string());
            dependencies.insert("react-dom".to_string(), "^19.2.0".to_string());
            dev_dependencies.insert("@vitejs/plugin-react".to_string(), "^5.1.1".to_string());
            dev_dependencies.insert("vite".to_string(), "^7.2.2".to_string());
            if payload.language == ProjectLanguage::Typescript {
                dev_dependencies.insert("@types/react".to_string(), "^19.2.5".to_string());
                dev_dependencies.insert("@types/react-dom".to_string(), "^19.2.3".to_string());
            }
        }
        ProjectTemplate::NodeHttp if payload.language == ProjectLanguage::Typescript => {
            dev_dependencies.insert("@types/node".to_string(), "^24.10.1".to_string());
            dev_dependencies.insert("tsx".to_string(), "^4.20.6".to_string());
        }
        ProjectTemplate::Empty if payload.language == ProjectLanguage::Typescript => {
            dev_dependencies.insert("@types/node".to_string(), "^24.10.1".to_string());
            dev_dependencies.insert("tsx".to_string(), "^4.20.6".to_string());
        }
        _ => {}
    }

    if payload.language == ProjectLanguage::Typescript {
        dev_dependencies.insert("typescript".to_string(), "^5.9.3".to_string());
    }
    if payload.styling == StylingPreset::TailwindV4
        && payload.template == ProjectTemplate::ReactVite
    {
        dev_dependencies.insert("@tailwindcss/vite".to_string(), "^4.1.17".to_string());
        dev_dependencies.insert("tailwindcss".to_string(), "^4.1.17".to_string());
    }
    for package in &payload.dependencies {
        let (name, version) = parse_package_spec(package)?;
        dependencies.insert(name, version);
    }
    for package in &payload.dev_dependencies {
        let (name, version) = parse_package_spec(package)?;
        dev_dependencies.insert(name, version);
    }
    for package in &payload.icon_packs {
        let (name, version) = parse_package_spec(package)?;
        dependencies.insert(name, version);
    }
    scripts.extend(payload.scripts.clone());

    let package_json = json!({
        "name": payload.name.to_ascii_lowercase(),
        "version": "0.1.0",
        "private": true,
        "description": payload.description.trim(),
        "type": "module",
        "scripts": scripts,
        "dependencies": dependencies,
        "devDependencies": dev_dependencies,
        "packageManager": payload.package_manager.declaration(),
    });
    write_json(root, "package.json", &package_json, generated)?;
    write_text(root, ".gitignore", gitignore(), generated)?;

    match payload.template {
        ProjectTemplate::Empty => write_empty_starter(root, payload, generated)?,
        ProjectTemplate::NodeHttp => write_node_starter(root, payload, generated)?,
        ProjectTemplate::ReactVite => write_react_starter(root, payload, generated)?,
    }

    if payload.language == ProjectLanguage::Typescript {
        write_json(root, "tsconfig.json", &typescript_config(payload.template), generated)?;
    }
    if payload.include_readme {
        write_text(root, "README.md", &readme(payload), generated)?;
    }
    Ok(())
}

fn default_scripts(payload: &CreateProjectPayload) -> BTreeMap<String, String> {
    let mut scripts = BTreeMap::new();
    match payload.template {
        ProjectTemplate::ReactVite => {
            scripts.insert("build".to_string(), "vite build".to_string());
            scripts.insert("dev".to_string(), "vite".to_string());
            scripts.insert("preview".to_string(), "vite preview".to_string());
        }
        ProjectTemplate::NodeHttp | ProjectTemplate::Empty => {
            let extension = if payload.language == ProjectLanguage::Typescript {
                "ts"
            } else {
                "js"
            };
            if payload.language == ProjectLanguage::Typescript {
                scripts.insert("build".to_string(), "tsc".to_string());
                scripts.insert("dev".to_string(), format!("tsx watch src/index.{extension}"));
                scripts.insert("start".to_string(), format!("tsx src/index.{extension}"));
            } else {
                scripts.insert("dev".to_string(), format!("node --watch src/index.{extension}"));
                scripts.insert("start".to_string(), format!("node src/index.{extension}"));
            }
        }
    }
    scripts
}

fn write_empty_starter(
    root: &Path,
    payload: &CreateProjectPayload,
    generated: &mut Vec<String>,
) -> Result<(), String> {
    let extension = language_extension(payload.language, false);
    write_text(
        root,
        &format!("src/index.{extension}"),
        "console.log('Hello from Localhost Hub.');\n",
        generated,
    )
}

fn write_node_starter(
    root: &Path,
    payload: &CreateProjectPayload,
    generated: &mut Vec<String>,
) -> Result<(), String> {
    let extension = language_extension(payload.language, false);
    let type_annotation = if payload.language == ProjectLanguage::Typescript {
        ": number"
    } else {
        ""
    };
    let source = format!(
        "import {{ createServer }} from 'node:http';\n\nconst port{type_annotation} = Number(process.env.PORT ?? 3000);\n\nconst server = createServer((_request, response) => {{\n  response.writeHead(200, {{ 'content-type': 'application/json' }});\n  response.end(JSON.stringify({{ ok: true, service: '{}' }}));\n}});\n\nserver.listen(port, '0.0.0.0', () => {{\n  console.log(`Server ready at http://localhost:${{port}}`);\n}});\n",
        payload.name
    );
    write_text(root, &format!("src/index.{extension}"), &source, generated)
}

fn write_react_starter(
    root: &Path,
    payload: &CreateProjectPayload,
    generated: &mut Vec<String>,
) -> Result<(), String> {
    let extension = language_extension(payload.language, true);
    write_text(
        root,
        "index.html",
        "<!doctype html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"UTF-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n    <title>Localhost Hub project</title>\n  </head>\n  <body>\n    <div id=\"root\"></div>\n    <script type=\"module\" src=\"/src/main.EXT\"></script>\n  </body>\n</html>\n"
            .replace("EXT", extension)
            .as_str(),
        generated,
    )?;
    let main = if payload.language == ProjectLanguage::Typescript {
        "import { StrictMode } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App';\nimport './index.css';\n\ncreateRoot(document.getElementById('root')!).render(\n  <StrictMode>\n    <App />\n  </StrictMode>,\n);\n"
    } else {
        "import { StrictMode } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App';\nimport './index.css';\n\ncreateRoot(document.getElementById('root')).render(\n  <StrictMode>\n    <App />\n  </StrictMode>,\n);\n"
    };
    write_text(root, &format!("src/main.{extension}"), main, generated)?;
    write_text(
        root,
        &format!("src/App.{extension}"),
        &format!(
            "export default function App() {{\n  return (\n    <main>\n      <p className=\"eyebrow\">Localhost Hub</p>\n      <h1>{}</h1>\n      <p>Your new project is running.</p>\n    </main>\n  );\n}}\n",
            payload.name
        ),
        generated,
    )?;
    let css = if payload.styling == StylingPreset::TailwindV4 {
        "@import \"tailwindcss\";\n\n:root { font-family: Inter, system-ui, sans-serif; color-scheme: dark; }\nbody { margin: 0; background: #101216; color: #f2f4f8; }\nmain { max-width: 48rem; margin: 18vh auto; padding: 2rem; }\n.eyebrow { color: #7ba7f7; text-transform: uppercase; letter-spacing: .12em; }\n"
    } else {
        ":root { font-family: Inter, system-ui, sans-serif; color-scheme: dark; }\nbody { margin: 0; background: #101216; color: #f2f4f8; }\nmain { max-width: 48rem; margin: 18vh auto; padding: 2rem; }\n.eyebrow { color: #7ba7f7; text-transform: uppercase; letter-spacing: .12em; }\n"
    };
    write_text(root, "src/index.css", css, generated)?;

    let tailwind_import = if payload.styling == StylingPreset::TailwindV4 {
        "import tailwindcss from '@tailwindcss/vite';\n"
    } else {
        ""
    };
    let plugins = if payload.styling == StylingPreset::TailwindV4 {
        "plugins: [react(), tailwindcss()]"
    } else {
        "plugins: [react()]"
    };
    let vite_config = format!(
        "import {{ defineConfig }} from 'vite';\nimport react from '@vitejs/plugin-react';\n{tailwind_import}\nexport default defineConfig({{\n  {plugins},\n  server: {{ host: true }},\n}});\n"
    );
    let config_extension = if payload.language == ProjectLanguage::Typescript {
        "ts"
    } else {
        "js"
    };
    write_text(
        root,
        &format!("vite.config.{config_extension}"),
        &vite_config,
        generated,
    )
}

fn typescript_config(template: ProjectTemplate) -> Value {
    let mut compiler = Map::new();
    compiler.insert("esModuleInterop".to_string(), json!(true));
    compiler.insert("forceConsistentCasingInFileNames".to_string(), json!(true));
    compiler.insert("module".to_string(), json!("ESNext"));
    compiler.insert("moduleResolution".to_string(), json!("Bundler"));
    compiler.insert("noEmit".to_string(), json!(template == ProjectTemplate::ReactVite));
    compiler.insert("skipLibCheck".to_string(), json!(true));
    compiler.insert("strict".to_string(), json!(true));
    compiler.insert("target".to_string(), json!("ES2022"));
    if template == ProjectTemplate::ReactVite {
        compiler.insert("jsx".to_string(), json!("react-jsx"));
        compiler.insert("lib".to_string(), json!(["ES2022", "DOM", "DOM.Iterable"]));
    }
    let include = if template == ProjectTemplate::ReactVite {
        json!(["src", "vite.config.ts"])
    } else {
        json!(["src"])
    };
    json!({
        "compilerOptions": Value::Object(compiler),
        "include": include
    })
}

fn readme(payload: &CreateProjectPayload) -> String {
    let description = if payload.description.trim().is_empty() {
        "Created and managed with Localhost Hub."
    } else {
        payload.description.trim()
    };
    let command = format!("{} run dev", payload.package_manager.as_str());
    let mut output = format!(
        "# {}\n\n{}\n\n## Getting started\n\n```bash\n{} install\n{}\n```\n",
        payload.name,
        description,
        payload.package_manager.as_str(),
        command
    );
    if !payload.readme_notes.trim().is_empty() {
        output.push_str("\n## Notes\n\n");
        output.push_str(payload.readme_notes.trim());
        output.push('\n');
    }
    output
}

fn gitignore() -> &'static str {
    "node_modules/\ndist/\n.env\n.env.*\n!.env.example\n*.log\n.DS_Store\n"
}

fn language_extension(language: ProjectLanguage, react: bool) -> &'static str {
    match (language, react) {
        (ProjectLanguage::Javascript, false) => "js",
        (ProjectLanguage::Javascript, true) => "jsx",
        (ProjectLanguage::Typescript, false) => "ts",
        (ProjectLanguage::Typescript, true) => "tsx",
    }
}

fn parse_package_spec(spec: &str) -> Result<(String, String), String> {
    let spec = spec.trim();
    if spec.is_empty() || spec.chars().any(char::is_whitespace) {
        return Err(format!("Invalid package specification: {spec:?}"));
    }
    let split = spec.rfind('@').filter(|index| *index > 0);
    let (name, version) = match split {
        Some(index) => (&spec[..index], &spec[index + 1..]),
        None => (spec, "*"),
    };
    let valid_segment = |segment: &str| {
        !segment.is_empty()
            && !segment.starts_with('.')
            && segment.chars().all(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
            })
    };
    let valid_name = if let Some(scoped) = name.strip_prefix('@') {
        scoped
            .split_once('/')
            .is_some_and(|(scope, package)| valid_segment(scope) && valid_segment(package))
    } else {
        valid_segment(name)
    };
    let valid_version = !version.is_empty()
        && version.chars().all(|character| {
            character.is_ascii_alphanumeric()
                || matches!(character, '-' | '+' | '.' | '^' | '~' | '<' | '>' | '=' | '*' | '|')
        });
    if !valid_name || !valid_version {
        return Err(format!("Invalid package specification: {spec}"));
    }
    Ok((name.to_string(), version.to_string()))
}

fn write_text(
    root: &Path,
    relative: &str,
    content: &str,
    generated: &mut Vec<String>,
) -> Result<(), String> {
    let destination = root.join(relative);
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create {}: {error}", parent.display()))?;
    }
    fs::write(&destination, content)
        .map_err(|error| format!("Could not write {}: {error}", destination.display()))?;
    generated.push(relative.to_string());
    Ok(())
}

fn write_json(
    root: &Path,
    relative: &str,
    value: &Value,
    generated: &mut Vec<String>,
) -> Result<(), String> {
    let mut content = serde_json::to_string_pretty(value)
        .map_err(|error| format!("Could not serialize {relative}: {error}"))?;
    content.push('\n');
    write_text(root, relative, &content, generated)
}

async fn install_dependencies(root: &Path, manager: PackageManager) -> Result<(), String> {
    let mut command = Command::new(manager.install_executable());
    command
        .arg("install")
        .current_dir(root)
        .env("GIT_TERMINAL_PROMPT", "0")
        .kill_on_drop(true);
    let output = timeout(INSTALL_TIMEOUT, command.output())
        .await
        .map_err(|_| "installation timed out after 10 minutes".to_string())?
        .map_err(|error| format!("could not start {}: {error}", manager.as_str()))?;
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stderr = if stderr.chars().count() > 4_000 {
        format!("{}…", stderr.chars().take(4_000).collect::<String>())
    } else {
        stderr
    };
    Err(if stderr.is_empty() {
        format!("{} install exited with {}", manager.as_str(), output.status)
    } else {
        stderr
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_root(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "localhost-hub-scaffold-{label}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    fn payload(directory: &Path) -> CreateProjectPayload {
        CreateProjectPayload {
            name: "sample-app".to_string(),
            directory: directory.to_string_lossy().to_string(),
            description: "A generated app".to_string(),
            template: ProjectTemplate::ReactVite,
            language: ProjectLanguage::Typescript,
            package_manager: PackageManager::Npm,
            dependencies: vec![],
            dev_dependencies: vec![],
            scripts: BTreeMap::new(),
            styling: StylingPreset::TailwindV4,
            icon_packs: vec!["lucide-react@^0.468.0".to_string()],
            include_readme: true,
            readme_notes: String::new(),
            initialize_git: true,
            install_dependencies: false,
        }
    }

    #[tokio::test]
    async fn creates_a_complete_react_typescript_project() {
        let root = temp_root("react");
        fs::create_dir_all(&root).unwrap();

        let result = create_project(payload(&root)).await.unwrap();
        let project = root.join("sample-app");
        let package: Value =
            serde_json::from_str(&fs::read_to_string(project.join("package.json")).unwrap())
                .unwrap();

        assert!(project.join("src/main.tsx").is_file());
        assert!(project.join("vite.config.ts").is_file());
        assert!(project.join("tsconfig.json").is_file());
        assert!(project.join("README.md").is_file());
        assert!(project.join(".git").is_dir());
        assert_eq!(package["dependencies"]["react"], "^19.2.0");
        assert_eq!(package["dependencies"]["lucide-react"], "^0.468.0");
        assert_eq!(package["devDependencies"]["tailwindcss"], "^4.1.17");
        assert!(result.git_initialized);
        assert!(!result.dependencies_installed);
        assert!(result.warnings.is_empty());
        let detected = crate::workspace::scan_for_projects(
            root.to_string_lossy().as_ref(),
            2,
            None,
        );
        assert_eq!(detected.len(), 1);
        assert_eq!(detected[0].framework, "React + Vite");
        assert_eq!(detected[0].package_manager, "npm");
        assert!(detected[0].scripts.iter().any(|script| script.name == "dev"));

        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn rejects_path_traversal_and_existing_targets() {
        let root = temp_root("validation");
        fs::create_dir_all(root.join("sample-app")).unwrap();

        let existing = create_project(payload(&root)).await.unwrap_err();
        assert!(existing.contains("already exists"));

        let mut unsafe_payload = payload(&root);
        unsafe_payload.name = "../escape".to_string();
        let unsafe_error = create_project(unsafe_payload).await.unwrap_err();
        assert!(unsafe_error.contains("single folder name"));

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn parses_scoped_and_versioned_packages() {
        assert_eq!(
            parse_package_spec("@tanstack/react-query@^5").unwrap(),
            ("@tanstack/react-query".to_string(), "^5".to_string())
        );
        assert_eq!(
            parse_package_spec("zod").unwrap(),
            ("zod".to_string(), "*".to_string())
        );
        assert!(parse_package_spec("../../escape").is_err());
    }
}
