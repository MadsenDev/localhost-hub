use git2::{
    DiffFormat, DiffOptions, ErrorCode, Index, Repository, Status, StatusOptions,
};
use serde::{Deserialize, Serialize};
use std::path::{Component, Path};

const MAX_DIFF_BYTES: usize = 2 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GitFileStatus {
    pub path: String,
    pub index_status: Option<String>,
    pub worktree_status: Option<String>,
    pub conflicted: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GitStatus {
    pub branch: String,
    pub ahead: usize,
    pub behind: usize,
    /// Number of unique paths with any index or worktree change.
    pub changed: usize,
    pub staged: usize,
    pub unstaged: usize,
    pub untracked: usize,
    pub conflicted: usize,
    pub clean: bool,
    pub files: Vec<GitFileStatus>,
    pub last_commit_message: Option<String>,
    pub last_commit_hash: Option<String>,
    pub last_commit_author: Option<String>,
    pub last_commit_timestamp: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GitDiff {
    pub patch: String,
    pub files_changed: usize,
    pub additions: usize,
    pub deletions: usize,
    pub truncated: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GitCommitResult {
    pub hash: String,
    pub message: String,
}

pub fn get_git_status(path: &str) -> Option<GitStatus> {
    let repo = Repository::discover(path).ok()?;
    let branch = branch_name(&repo);

    let mut options = StatusOptions::new();
    options
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true);

    let statuses = repo.statuses(Some(&mut options)).ok()?;
    let mut files = Vec::with_capacity(statuses.len());
    let mut staged = 0usize;
    let mut unstaged = 0usize;
    let mut untracked = 0usize;
    let mut conflicted = 0usize;

    for entry in statuses.iter() {
        let status = entry.status();
        let index_status = index_change(status);
        let worktree_status = worktree_change(status);
        let is_untracked = status.is_wt_new();
        let is_conflicted = status.is_conflicted();

        if index_status.is_some() {
            staged += 1;
        }
        if worktree_status.is_some() && !is_untracked {
            unstaged += 1;
        }
        if is_untracked {
            untracked += 1;
        }
        if is_conflicted {
            conflicted += 1;
        }

        files.push(GitFileStatus {
            path: entry.path().unwrap_or("<non-utf8 path>").to_string(),
            index_status,
            worktree_status,
            conflicted: is_conflicted,
        });
    }
    files.sort_by(|left, right| left.path.cmp(&right.path));

    let (ahead, behind) = upstream_divergence(&repo).unwrap_or((0, 0));
    let commit = repo.head().ok().and_then(|head| head.peel_to_commit().ok());
    let last_commit_message = commit
        .as_ref()
        .and_then(|commit| commit.summary())
        .map(str::to_string);
    let last_commit_hash = commit
        .as_ref()
        .map(|commit| short_oid(commit.id()));
    let last_commit_author = commit
        .as_ref()
        .and_then(|commit| commit.author().name().map(str::to_string));
    let last_commit_timestamp = commit
        .as_ref()
        .map(|commit| commit.time().seconds());

    let changed = files.len();
    Some(GitStatus {
        branch,
        ahead,
        behind,
        changed,
        staged,
        unstaged,
        untracked,
        conflicted,
        clean: changed == 0,
        files,
        last_commit_message,
        last_commit_hash,
        last_commit_author,
        last_commit_timestamp,
    })
}

pub fn get_git_diff(
    path: &str,
    file_path: Option<&str>,
    staged: bool,
) -> Result<GitDiff, String> {
    let repo = writable_repository(path)?;
    let mut options = DiffOptions::new();
    options
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .show_untracked_content(true);
    if let Some(file_path) = file_path {
        validate_repo_path(file_path)?;
        options.pathspec(file_path);
    }

    let diff = if staged {
        let head_tree = repo
            .head()
            .ok()
            .and_then(|head| head.peel_to_tree().ok());
        repo.diff_tree_to_index(head_tree.as_ref(), None, Some(&mut options))
    } else {
        repo.diff_index_to_workdir(None, Some(&mut options))
    }
    .map_err(|error| format!("Could not create Git diff: {error}"))?;

    let stats = diff
        .stats()
        .map_err(|error| format!("Could not calculate diff statistics: {error}"))?;
    let mut bytes = Vec::new();
    let mut truncated = false;
    diff.print(DiffFormat::Patch, |_, _, line| {
        let origin = line.origin();
        if matches!(origin, '+' | '-' | ' ') {
            bytes.push(origin as u8);
        }
        bytes.extend_from_slice(line.content());
        if bytes.len() > MAX_DIFF_BYTES {
            bytes.truncate(MAX_DIFF_BYTES);
            truncated = true;
            return false;
        }
        true
    })
    .map_err(|error| format!("Could not render Git diff: {error}"))?;

    let mut patch = String::from_utf8_lossy(&bytes).into_owned();
    if truncated {
        patch.push_str("\n\n[Diff truncated at 2 MiB]\n");
    }

    Ok(GitDiff {
        patch,
        files_changed: stats.files_changed(),
        additions: stats.insertions(),
        deletions: stats.deletions(),
        truncated,
    })
}

pub fn stage_files(path: &str, files: &[String]) -> Result<GitStatus, String> {
    let repo = writable_repository(path)?;
    let paths = validated_paths(files)?;
    let workdir = repo
        .workdir()
        .ok_or_else(|| "Bare repositories cannot stage working-tree files.".to_string())?;
    let mut index = repo
        .index()
        .map_err(|error| format!("Could not open Git index: {error}"))?;

    for relative in &paths {
        let full_path = workdir.join(relative);
        if full_path.exists() {
            index
                .add_path(relative)
                .map_err(|error| format!("Could not stage {}: {error}", relative.display()))?;
        } else {
            remove_from_index(&mut index, relative)?;
        }
    }
    index
        .write()
        .map_err(|error| format!("Could not write Git index: {error}"))?;
    get_git_status(path).ok_or_else(|| "Could not refresh Git status.".to_string())
}

pub fn unstage_files(path: &str, files: &[String]) -> Result<GitStatus, String> {
    let repo = writable_repository(path)?;
    let paths = validated_paths(files)?;

    if let Ok(head) = repo.head().and_then(|head| head.peel_to_commit()) {
        let object = head.as_object();
        repo.reset_default(Some(object), paths.iter())
            .map_err(|error| format!("Could not unstage files: {error}"))?;
    } else {
        let mut index = repo
            .index()
            .map_err(|error| format!("Could not open Git index: {error}"))?;
        for relative in &paths {
            remove_from_index(&mut index, relative)?;
        }
        index
            .write()
            .map_err(|error| format!("Could not write Git index: {error}"))?;
    }

    get_git_status(path).ok_or_else(|| "Could not refresh Git status.".to_string())
}

pub fn commit(path: &str, message: &str) -> Result<GitCommitResult, String> {
    let repo = writable_repository(path)?;
    let message = message.trim();
    if message.is_empty() {
        return Err("Commit message cannot be empty.".to_string());
    }

    let current = get_git_status(path).ok_or_else(|| "Could not read Git status.".to_string())?;
    if current.staged == 0 {
        return Err("There are no staged changes to commit.".to_string());
    }

    let signature = repo.signature().map_err(|_| {
        "Git author is not configured. Set user.name and user.email before committing.".to_string()
    })?;
    let mut index = repo
        .index()
        .map_err(|error| format!("Could not open Git index: {error}"))?;
    let tree_id = index
        .write_tree()
        .map_err(|error| format!("Could not write commit tree: {error}"))?;
    let tree = repo
        .find_tree(tree_id)
        .map_err(|error| format!("Could not load commit tree: {error}"))?;
    let parents = repo
        .head()
        .ok()
        .and_then(|head| head.peel_to_commit().ok())
        .into_iter()
        .collect::<Vec<_>>();
    let parent_refs = parents.iter().collect::<Vec<_>>();
    let oid = repo
        .commit(
            Some("HEAD"),
            &signature,
            &signature,
            message,
            &tree,
            &parent_refs,
        )
        .map_err(|error| format!("Could not create commit: {error}"))?;

    Ok(GitCommitResult {
        hash: short_oid(oid),
        message: message.to_string(),
    })
}

fn writable_repository(path: &str) -> Result<Repository, String> {
    let repo = Repository::discover(path)
        .map_err(|error| format!("Could not open Git repository: {error}"))?;
    if repo.is_bare() {
        return Err("This operation requires a working tree.".to_string());
    }
    Ok(repo)
}

fn validated_paths(files: &[String]) -> Result<Vec<&Path>, String> {
    if files.is_empty() {
        return Err("Select at least one file.".to_string());
    }
    files
        .iter()
        .map(|file| {
            validate_repo_path(file)?;
            Ok(Path::new(file))
        })
        .collect()
}

fn validate_repo_path(path: &str) -> Result<(), String> {
    let path = Path::new(path);
    if path.as_os_str().is_empty()
        || path.is_absolute()
        || !path
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
    {
        return Err("Git file paths must stay inside the repository.".to_string());
    }
    Ok(())
}

fn remove_from_index(index: &mut Index, path: &Path) -> Result<(), String> {
    match index.remove_path(path) {
        Ok(()) => Ok(()),
        Err(error) if error.code() == ErrorCode::NotFound => Ok(()),
        Err(error) => Err(format!("Could not stage deletion for {}: {error}", path.display())),
    }
}

fn branch_name(repo: &Repository) -> String {
    if let Ok(head) = repo.head() {
        if head.is_branch() {
            return head.shorthand().unwrap_or("HEAD").to_string();
        }
        if let Some(target) = head.target() {
            return short_oid(target);
        }
    }

    // An initialized repository with no commits has an unborn symbolic HEAD.
    repo.find_reference("HEAD")
        .ok()
        .and_then(|head| head.symbolic_target().map(str::to_string))
        .and_then(|target| target.strip_prefix("refs/heads/").map(str::to_string))
        .unwrap_or_else(|| "HEAD".to_string())
}

fn short_oid(oid: git2::Oid) -> String {
    oid.to_string().chars().take(8).collect()
}

fn index_change(status: Status) -> Option<String> {
    let kind = if status.is_index_new() {
        "added"
    } else if status.is_index_modified() {
        "modified"
    } else if status.is_index_deleted() {
        "deleted"
    } else if status.is_index_renamed() {
        "renamed"
    } else if status.is_index_typechange() {
        "typechange"
    } else {
        return None;
    };
    Some(kind.to_string())
}

fn worktree_change(status: Status) -> Option<String> {
    let kind = if status.is_wt_new() {
        "untracked"
    } else if status.is_wt_modified() {
        "modified"
    } else if status.is_wt_deleted() {
        "deleted"
    } else if status.is_wt_renamed() {
        "renamed"
    } else if status.is_wt_typechange() {
        "typechange"
    } else {
        return None;
    };
    Some(kind.to_string())
}

fn upstream_divergence(repo: &Repository) -> Option<(usize, usize)> {
    let head = repo.head().ok()?;
    if !head.is_branch() {
        return None;
    }
    let local = head.target()?;
    let branch_name = head.shorthand()?;
    let branch = repo
        .find_branch(branch_name, git2::BranchType::Local)
        .ok()?;
    let upstream = branch.upstream().ok()?.get().target()?;
    repo.graph_ahead_behind(local, upstream).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use git2::{IndexAddOption, Signature};
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TestRepo {
        path: PathBuf,
        repo: Repository,
    }

    impl TestRepo {
        fn init() -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock should be after epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "localhost-hub-git-test-{}-{nonce}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("create test directory");
            let repo = Repository::init(&path).expect("initialize repository");
            let mut config = repo.config().expect("open repository config");
            config
                .set_str("user.name", "Localhost Hub")
                .expect("configure user name");
            config
                .set_str("user.email", "hub@example.test")
                .expect("configure user email");
            Self { path, repo }
        }

        fn write(&self, relative: &str, contents: &str) {
            let path = self.path.join(relative);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).expect("create parent directory");
            }
            fs::write(path, contents).expect("write test file");
        }

        fn commit_all(&self, message: &str) {
            let mut index = self.repo.index().expect("open index");
            index
                .add_all(["*"], IndexAddOption::DEFAULT, None)
                .expect("stage files");
            index.write().expect("write index");
            let tree_id = index.write_tree().expect("write tree");
            let tree = self.repo.find_tree(tree_id).expect("find tree");
            let signature =
                Signature::now("Localhost Hub", "hub@example.test").expect("signature");
            let parents = self
                .repo
                .head()
                .ok()
                .and_then(|head| head.peel_to_commit().ok())
                .into_iter()
                .collect::<Vec<_>>();
            let parent_refs = parents.iter().collect::<Vec<_>>();
            self.repo
                .commit(
                    Some("HEAD"),
                    &signature,
                    &signature,
                    message,
                    &tree,
                    &parent_refs,
                )
                .expect("create commit");
        }
    }

    impl Drop for TestRepo {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn status(path: &Path) -> GitStatus {
        get_git_status(path.to_str().expect("utf8 test path")).expect("git status")
    }

    #[test]
    fn reports_unborn_repository_and_untracked_file_as_dirty() {
        let test = TestRepo::init();
        test.write("README.md", "hello");

        let result = status(&test.path);

        assert!(!result.clean);
        assert_eq!(result.changed, 1);
        assert_eq!(result.untracked, 1);
        assert_eq!(result.files[0].worktree_status.as_deref(), Some("untracked"));
        assert!(result.last_commit_hash.is_none());
        assert_ne!(result.branch, "HEAD");
    }

    #[test]
    fn reports_clean_commit_metadata() {
        let test = TestRepo::init();
        test.write("README.md", "hello");
        test.commit_all("Initial commit");

        let result = status(&test.path);

        assert!(result.clean);
        assert_eq!(result.changed, 0);
        assert_eq!(result.last_commit_message.as_deref(), Some("Initial commit"));
        assert_eq!(result.last_commit_author.as_deref(), Some("Localhost Hub"));
        assert_eq!(result.last_commit_hash.as_ref().map(String::len), Some(8));
        assert!(result.last_commit_timestamp.is_some());
    }

    #[test]
    fn keeps_staged_and_worktree_changes_separate_without_double_counting() {
        let test = TestRepo::init();
        test.write("tracked.txt", "initial");
        test.commit_all("Initial commit");

        test.write("tracked.txt", "staged");
        let mut index = test.repo.index().expect("open index");
        index
            .add_path(Path::new("tracked.txt"))
            .expect("stage tracked file");
        index.write().expect("write index");
        test.write("tracked.txt", "changed after staging");
        test.write("untracked.txt", "new");

        let result = status(&test.path);

        assert!(!result.clean);
        assert_eq!(result.changed, 2);
        assert_eq!(result.staged, 1);
        assert_eq!(result.unstaged, 1);
        assert_eq!(result.untracked, 1);
        let tracked = result
            .files
            .iter()
            .find(|file| file.path == "tracked.txt")
            .expect("tracked file status");
        assert_eq!(tracked.index_status.as_deref(), Some("modified"));
        assert_eq!(tracked.worktree_status.as_deref(), Some("modified"));
    }

    #[test]
    fn stages_and_unstages_modified_untracked_and_deleted_files() {
        let test = TestRepo::init();
        test.write("modified.txt", "initial");
        test.write("deleted.txt", "initial");
        test.commit_all("Initial commit");
        test.write("modified.txt", "changed");
        fs::remove_file(test.path.join("deleted.txt")).expect("delete tracked file");
        test.write("untracked.txt", "new");

        let files = vec![
            "modified.txt".to_string(),
            "deleted.txt".to_string(),
            "untracked.txt".to_string(),
        ];
        let staged = stage_files(test.path.to_str().unwrap(), &files).expect("stage files");
        assert_eq!(staged.staged, 3);
        assert_eq!(staged.unstaged, 0);
        assert_eq!(staged.untracked, 0);

        let unstaged =
            unstage_files(test.path.to_str().unwrap(), &files).expect("unstage files");
        assert_eq!(unstaged.staged, 0);
        assert_eq!(unstaged.unstaged, 2);
        assert_eq!(unstaged.untracked, 1);
    }

    #[test]
    fn commits_staged_changes_and_returns_short_hash() {
        let test = TestRepo::init();
        test.write("README.md", "hello");
        stage_files(
            test.path.to_str().unwrap(),
            &["README.md".to_string()],
        )
        .expect("stage file");

        let result = commit(test.path.to_str().unwrap(), "Initial commit")
            .expect("commit staged file");

        assert_eq!(result.hash.len(), 8);
        assert_eq!(result.message, "Initial commit");
        assert!(status(&test.path).clean);
    }

    #[test]
    fn renders_staged_and_worktree_diffs_separately() {
        let test = TestRepo::init();
        test.write("tracked.txt", "before\n");
        test.commit_all("Initial commit");
        test.write("tracked.txt", "staged\n");
        stage_files(
            test.path.to_str().unwrap(),
            &["tracked.txt".to_string()],
        )
        .expect("stage file");
        test.write("tracked.txt", "worktree\n");

        let staged = get_git_diff(
            test.path.to_str().unwrap(),
            Some("tracked.txt"),
            true,
        )
        .expect("staged diff");
        let worktree = get_git_diff(
            test.path.to_str().unwrap(),
            Some("tracked.txt"),
            false,
        )
        .expect("worktree diff");

        assert!(staged.patch.contains("+staged"));
        assert!(worktree.patch.contains("+worktree"));
        assert_eq!(staged.files_changed, 1);
        assert!(!staged.truncated);
    }

    #[test]
    fn rejects_paths_that_escape_the_repository() {
        let test = TestRepo::init();
        let result = stage_files(
            test.path.to_str().unwrap(),
            &["../outside.txt".to_string()],
        );

        assert_eq!(
            result.unwrap_err(),
            "Git file paths must stay inside the repository."
        );
    }
}
