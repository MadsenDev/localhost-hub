use git2::{BranchType, Repository, StatusOptions};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use ts_rs::TS;

const QUIET_DAYS: u64 = 90;
const STALE_DAYS: u64 = 180;
const STALE_BRANCH_DAYS: u64 = 90;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "../../src/generated/")]
pub enum RepositoryHealthStatus {
    Healthy,
    Attention,
    Risk,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "../../src/generated/")]
pub enum HealthSignalState {
    Good,
    Info,
    Warn,
    Bad,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
pub struct HealthSignal {
    pub id: String,
    pub label: String,
    pub state: HealthSignalState,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
pub struct StaleBranch {
    pub name: String,
    // Tauri serializes through serde_json, so this arrives as a JSON number.
    #[ts(type = "number")]
    pub last_commit_timestamp: i64,
    // Tauri serializes through serde_json, so this arrives as a JSON number.
    #[ts(type = "number")]
    pub days_since_commit: u64,
    pub merged_into_head: bool,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
pub struct RepositoryHealth {
    pub path: String,
    pub score: u8,
    pub status: RepositoryHealthStatus,
    pub signals: Vec<HealthSignal>,
    pub has_readme: bool,
    pub has_license: bool,
    pub has_ci: bool,
    pub dependency_manifests: Vec<String>,
    // Tauri serializes through serde_json, so this arrives as a JSON number.
    #[ts(type = "number")]
    pub uncommitted_changes: usize,
    // Tauri serializes through serde_json, so this arrives as a JSON number.
    #[ts(type = "number | null")]
    pub oldest_uncommitted_days: Option<u64>,
    // Tauri serializes through serde_json, so this arrives as a JSON number.
    #[ts(type = "number")]
    pub unpushed_commits: usize,
    // Tauri serializes through serde_json, so this arrives as a JSON number.
    #[ts(type = "number | null")]
    pub last_commit_timestamp: Option<i64>,
    // Tauri serializes through serde_json, so this arrives as a JSON number.
    #[ts(type = "number | null")]
    pub days_since_last_commit: Option<u64>,
    pub stale_branches: Vec<StaleBranch>,
}

pub fn analyze_repositories(paths: Vec<String>) -> Vec<RepositoryHealth> {
    paths
        .into_iter()
        .map(|path| analyze_repository(&path))
        .collect()
}

pub fn analyze_repository(path: &str) -> RepositoryHealth {
    let project_path = PathBuf::from(path);
    let root_files = root_file_names(&project_path);
    let has_readme = root_files
        .iter()
        .any(|name| name == "readme" || name.starts_with("readme."));
    let has_license = root_files.iter().any(|name| {
        name == "license"
            || name.starts_with("license.")
            || name == "copying"
            || name.starts_with("copying.")
    });
    let has_ci = detect_ci(&project_path);
    let dependency_manifests = detect_dependency_manifests(&root_files);
    let mut score = 100_i32;
    let mut signals = Vec::new();

    if has_readme {
        signals.push(signal("readme", "README", HealthSignalState::Good, "README detected"));
    } else {
        score -= 10;
        signals.push(signal(
            "readme",
            "README",
            HealthSignalState::Warn,
            "No README detected at the project root",
        ));
    }
    if has_license {
        signals.push(signal("license", "License", HealthSignalState::Good, "License file detected"));
    } else {
        score -= 5;
        signals.push(signal(
            "license",
            "License",
            HealthSignalState::Info,
            "No license file detected",
        ));
    }
    if dependency_manifests.is_empty() {
        score -= 10;
        signals.push(signal(
            "manifests",
            "Dependencies",
            HealthSignalState::Warn,
            "No supported dependency manifest detected",
        ));
    } else {
        signals.push(signal(
            "manifests",
            "Dependencies",
            HealthSignalState::Good,
            format!("Detected {}", dependency_manifests.join(", ")),
        ));
    }
    if has_ci {
        signals.push(signal(
            "ci",
            "Continuous integration",
            HealthSignalState::Good,
            "CI configuration detected",
        ));
    } else {
        score -= 5;
        signals.push(signal(
            "ci",
            "Continuous integration",
            HealthSignalState::Info,
            "No common CI configuration detected",
        ));
    }

    let mut uncommitted_changes = 0;
    let mut oldest_uncommitted_days = None;
    let mut unpushed_commits = 0;
    let mut last_commit_timestamp = None;
    let mut days_since_last_commit = None;
    let mut stale_branches = Vec::new();

    match Repository::discover(&project_path) {
        Ok(repository) => {
            let git = inspect_git(&repository);
            uncommitted_changes = git.uncommitted_changes;
            oldest_uncommitted_days = git.oldest_uncommitted_days;
            unpushed_commits = git.unpushed_commits;
            last_commit_timestamp = git.last_commit_timestamp;
            days_since_last_commit = git.days_since_last_commit;
            stale_branches = git.stale_branches;

            if uncommitted_changes == 0 {
                signals.push(signal(
                    "working_tree",
                    "Working tree",
                    HealthSignalState::Good,
                    "No uncommitted changes",
                ));
            } else {
                score -= (uncommitted_changes.min(10) as i32) * 2;
                let age = oldest_uncommitted_days
                    .map(|days| format!("; oldest changed file is {days} days old"))
                    .unwrap_or_default();
                signals.push(signal(
                    "working_tree",
                    "Working tree",
                    HealthSignalState::Warn,
                    format!("{uncommitted_changes} uncommitted change(s){age}"),
                ));
            }

            if unpushed_commits > 0 {
                score -= 10;
                signals.push(signal(
                    "unpushed",
                    "Unpushed commits",
                    HealthSignalState::Warn,
                    format!("{unpushed_commits} commit(s) ahead of the upstream branch"),
                ));
            } else if git.has_upstream {
                signals.push(signal(
                    "unpushed",
                    "Unpushed commits",
                    HealthSignalState::Good,
                    "Local branch is not ahead of its upstream",
                ));
            } else {
                score -= 5;
                signals.push(signal(
                    "unpushed",
                    "Upstream",
                    HealthSignalState::Info,
                    if git.has_remote {
                        "Current branch has no upstream tracking branch"
                    } else {
                        "No Git remote is configured"
                    },
                ));
            }

            match days_since_last_commit {
                Some(days) if days >= STALE_DAYS => {
                    score -= 20;
                    signals.push(signal(
                        "activity",
                        "Activity",
                        HealthSignalState::Bad,
                        format!("Last commit was {days} days ago"),
                    ));
                }
                Some(days) if days >= QUIET_DAYS => {
                    score -= 10;
                    signals.push(signal(
                        "activity",
                        "Activity",
                        HealthSignalState::Warn,
                        format!("Last commit was {days} days ago"),
                    ));
                }
                Some(days) => signals.push(signal(
                    "activity",
                    "Activity",
                    HealthSignalState::Good,
                    if days == 0 {
                        "Committed today".to_string()
                    } else {
                        format!("Last commit was {days} days ago")
                    },
                )),
                None => {
                    score -= 15;
                    signals.push(signal(
                        "activity",
                        "Activity",
                        HealthSignalState::Warn,
                        "Repository has no commits",
                    ));
                }
            }

            if stale_branches.is_empty() {
                signals.push(signal(
                    "branches",
                    "Branches",
                    HealthSignalState::Good,
                    "No inactive local branches",
                ));
            } else {
                score -= (stale_branches.len().min(3) as i32) * 5;
                let merged = stale_branches
                    .iter()
                    .filter(|branch| branch.merged_into_head)
                    .count();
                signals.push(signal(
                    "branches",
                    "Branches",
                    HealthSignalState::Warn,
                    format!(
                        "{} inactive branch(es) older than {STALE_BRANCH_DAYS} days; {merged} merged",
                        stale_branches.len()
                    ),
                ));
            }
        }
        Err(_) => {
            score -= 25;
            signals.push(signal(
                "git",
                "Git repository",
                HealthSignalState::Bad,
                "Project is not tracked by Git",
            ));
        }
    }

    let score = score.clamp(0, 100) as u8;
    let status = if score >= 80 {
        RepositoryHealthStatus::Healthy
    } else if score >= 55 {
        RepositoryHealthStatus::Attention
    } else {
        RepositoryHealthStatus::Risk
    };
    RepositoryHealth {
        path: path.to_string(),
        score,
        status,
        signals,
        has_readme,
        has_license,
        has_ci,
        dependency_manifests,
        uncommitted_changes,
        oldest_uncommitted_days,
        unpushed_commits,
        last_commit_timestamp,
        days_since_last_commit,
        stale_branches,
    }
}

struct GitInspection {
    uncommitted_changes: usize,
    oldest_uncommitted_days: Option<u64>,
    unpushed_commits: usize,
    has_upstream: bool,
    has_remote: bool,
    last_commit_timestamp: Option<i64>,
    days_since_last_commit: Option<u64>,
    stale_branches: Vec<StaleBranch>,
}

fn inspect_git(repository: &Repository) -> GitInspection {
    let now = now_timestamp();
    let mut options = StatusOptions::new();
    options
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false);
    let statuses = repository.statuses(Some(&mut options)).ok();
    let changed_paths = statuses
        .as_ref()
        .map(|statuses| {
            statuses
                .iter()
                .filter_map(|entry| entry.path().map(str::to_string))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let uncommitted_changes = changed_paths.len();
    let oldest_uncommitted_days = repository
        .workdir()
        .and_then(|workdir| oldest_file_age(workdir, &changed_paths, now));

    let head = repository.head().ok();
    let head_oid = head.as_ref().and_then(|head| head.target());
    let last_commit_timestamp = head_oid
        .and_then(|oid| repository.find_commit(oid).ok())
        .map(|commit| commit.time().seconds());
    let days_since_last_commit =
        last_commit_timestamp.map(|timestamp| days_between(timestamp, now));
    let current_branch = head
        .as_ref()
        .filter(|head| head.is_branch())
        .and_then(|head| head.shorthand())
        .map(str::to_string);

    let current_local_branch = current_branch
        .as_deref()
        .and_then(|name| repository.find_branch(name, BranchType::Local).ok());
    let upstream_oid = current_local_branch
        .as_ref()
        .and_then(|branch| branch.upstream().ok())
        .and_then(|branch| branch.get().target());
    let has_upstream = upstream_oid.is_some();
    let unpushed_commits = match (head_oid, upstream_oid) {
        (Some(local), Some(upstream)) => repository
            .graph_ahead_behind(local, upstream)
            .map(|(ahead, _)| ahead)
            .unwrap_or(0),
        _ => 0,
    };
    let has_remote = repository
        .remotes()
        .map(|remotes| !remotes.is_empty())
        .unwrap_or(false);

    let mut stale_branches = repository
        .branches(Some(BranchType::Local))
        .ok()
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter_map(|(branch, _)| {
            let name = branch.name().ok().flatten()?.to_string();
            if current_branch.as_deref() == Some(name.as_str()) {
                return None;
            }
            let oid = branch.get().target()?;
            let timestamp = repository.find_commit(oid).ok()?.time().seconds();
            let days_since_commit = days_between(timestamp, now);
            if days_since_commit < STALE_BRANCH_DAYS {
                return None;
            }
            let merged_into_head = head_oid
                .filter(|head| *head != oid)
                .and_then(|head| repository.graph_descendant_of(head, oid).ok())
                .unwrap_or(false);
            Some(StaleBranch {
                name,
                last_commit_timestamp: timestamp,
                days_since_commit,
                merged_into_head,
            })
        })
        .collect::<Vec<_>>();
    stale_branches.sort_by_key(|branch| std::cmp::Reverse(branch.days_since_commit));

    GitInspection {
        uncommitted_changes,
        oldest_uncommitted_days,
        unpushed_commits,
        has_upstream,
        has_remote,
        last_commit_timestamp,
        days_since_last_commit,
        stale_branches,
    }
}

fn root_file_names(path: &Path) -> Vec<String> {
    fs::read_dir(path)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().map(|kind| kind.is_file()).unwrap_or(false))
        .map(|entry| entry.file_name().to_string_lossy().to_ascii_lowercase())
        .collect()
}

fn detect_dependency_manifests(files: &[String]) -> Vec<String> {
    const MANIFESTS: &[&str] = &[
        "package.json",
        "cargo.toml",
        "pyproject.toml",
        "requirements.txt",
        "go.mod",
        "gemfile",
        "composer.json",
        "pom.xml",
        "build.gradle",
        "build.gradle.kts",
    ];
    MANIFESTS
        .iter()
        .filter(|manifest| files.iter().any(|file| file.as_str() == **manifest))
        .map(|manifest| manifest.to_string())
        .collect()
}

fn detect_ci(path: &Path) -> bool {
    let github_workflows = path.join(".github").join("workflows");
    let has_github_workflow = fs::read_dir(github_workflows)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .any(|entry| {
            entry
                .path()
                .extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| matches!(extension, "yml" | "yaml"))
        });
    has_github_workflow
        || path.join(".gitlab-ci.yml").is_file()
        || path.join("azure-pipelines.yml").is_file()
        || path.join(".circleci").join("config.yml").is_file()
}

fn oldest_file_age(workdir: &Path, paths: &[String], now: i64) -> Option<u64> {
    paths
        .iter()
        .filter_map(|path| fs::metadata(workdir.join(path)).ok())
        .filter_map(|metadata| metadata.modified().ok())
        .filter_map(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| days_between(duration.as_secs() as i64, now))
        .max()
}

fn now_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn days_between(earlier: i64, later: i64) -> u64 {
    later.saturating_sub(earlier) as u64 / 86_400
}

fn signal(
    id: impl Into<String>,
    label: impl Into<String>,
    state: HealthSignalState,
    detail: impl Into<String>,
) -> HealthSignal {
    HealthSignal {
        id: id.into(),
        label: label.into(),
        state,
        detail: detail.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use git2::{IndexAddOption, Signature};
    use std::io::Write;

    struct TestProject {
        path: PathBuf,
        repository: Repository,
    }

    impl TestProject {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "localhost-hub-health-{}-{}",
                std::process::id(),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            fs::create_dir_all(&path).unwrap();
            let repository = Repository::init(&path).unwrap();
            Self { path, repository }
        }

        fn write(&self, relative: &str, content: &str) {
            let path = self.path.join(relative);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).unwrap();
            }
            let mut file = fs::File::create(path).unwrap();
            file.write_all(content.as_bytes()).unwrap();
        }

        fn commit(&self, message: &str, timestamp: i64) -> git2::Oid {
            let mut index = self.repository.index().unwrap();
            index
                .add_all(["."].iter(), IndexAddOption::DEFAULT, None)
                .unwrap();
            index.write().unwrap();
            let tree_oid = index.write_tree().unwrap();
            let tree = self.repository.find_tree(tree_oid).unwrap();
            let signature =
                Signature::new("Health Test", "health@example.com", &git2::Time::new(timestamp, 0))
                    .unwrap();
            let parents = self
                .repository
                .head()
                .ok()
                .and_then(|head| head.target())
                .and_then(|oid| self.repository.find_commit(oid).ok())
                .into_iter()
                .collect::<Vec<_>>();
            let parent_refs = parents.iter().collect::<Vec<_>>();
            self.repository
                .commit(
                    Some("HEAD"),
                    &signature,
                    &signature,
                    message,
                    &tree,
                    &parent_refs,
                )
                .unwrap()
        }
    }

    impl Drop for TestProject {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn reports_documentation_dependencies_ci_and_clean_git() {
        let project = TestProject::new();
        project.write("README.md", "# Project");
        project.write("LICENSE", "MIT");
        project.write("package.json", "{}");
        project.write(".github/workflows/ci.yml", "name: CI");
        project.commit("Initial commit", now_timestamp());

        let health = analyze_repository(project.path.to_str().unwrap());

        assert!(health.has_readme);
        assert!(health.has_license);
        assert!(health.has_ci);
        assert_eq!(health.dependency_manifests, vec!["package.json"]);
        assert_eq!(health.uncommitted_changes, 0);
        assert_eq!(health.days_since_last_commit, Some(0));
        assert!(health.score >= 80);
        assert_eq!(health.status, RepositoryHealthStatus::Healthy);
    }

    #[test]
    fn reports_dirty_files_missing_basics_and_inactive_branches() {
        let project = TestProject::new();
        project.write("src.txt", "old");
        let old_timestamp = now_timestamp() - 120 * 86_400;
        let old_commit = project.commit("Old commit", old_timestamp);
        let old_commit = project.repository.find_commit(old_commit).unwrap();
        project
            .repository
            .branch("stale-work", &old_commit, false)
            .unwrap();
        drop(old_commit);
        project.write("src.txt", "changed");

        let health = analyze_repository(project.path.to_str().unwrap());

        assert!(!health.has_readme);
        assert!(!health.has_license);
        assert_eq!(health.uncommitted_changes, 1);
        assert_eq!(health.stale_branches.len(), 1);
        assert_eq!(health.stale_branches[0].name, "stale-work");
        assert_eq!(health.status, RepositoryHealthStatus::Risk);
    }

    #[test]
    fn marks_non_git_projects_as_risk() {
        let path = std::env::temp_dir().join(format!(
            "localhost-hub-health-no-git-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&path).unwrap();

        let health = analyze_repository(path.to_str().unwrap());

        assert_eq!(health.status, RepositoryHealthStatus::Risk);
        assert!(health
            .signals
            .iter()
            .any(|signal| signal.id == "git" && signal.state == HealthSignalState::Bad));
        fs::remove_dir_all(path).unwrap();
    }
}
