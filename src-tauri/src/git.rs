use git2::{
    build::CheckoutBuilder, BranchType, DiffFormat, DiffOptions, ErrorCode, Index, Repository,
    Sort, Status, StatusOptions,
};
use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};
use std::time::Duration;
use tokio::process::Command;
use tokio::time::timeout;

const MAX_DIFF_BYTES: usize = 2 * 1024 * 1024;
const GIT_NETWORK_TIMEOUT: Duration = Duration::from_secs(120);

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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GitBranch {
    pub name: String,
    pub current: bool,
    pub remote: bool,
    pub upstream: Option<String>,
    pub ahead: usize,
    pub behind: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GitRemote {
    pub name: String,
    pub url: Option<String>,
    pub push_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GitHistoryEntry {
    pub hash: String,
    pub full_hash: String,
    pub message: String,
    pub author: String,
    pub author_email: Option<String>,
    pub timestamp: i64,
    pub parent_count: usize,
    pub files_changed: usize,
    pub additions: usize,
    pub deletions: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GitRepositoryInfo {
    pub branches: Vec<GitBranch>,
    pub remotes: Vec<GitRemote>,
    pub history: Vec<GitHistoryEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GitNetworkResult {
    pub operation: String,
    pub remote: String,
    pub branch: String,
    pub output: String,
    pub status: GitStatus,
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

pub fn get_repository_info(path: &str, history_limit: usize) -> Result<GitRepositoryInfo, String> {
    let repo = writable_repository(path)?;
    Ok(GitRepositoryInfo {
        branches: list_branches(&repo)?,
        remotes: list_remotes(&repo)?,
        history: list_history(&repo, history_limit.clamp(1, 200))?,
    })
}

pub fn create_branch(path: &str, name: &str) -> Result<GitStatus, String> {
    let repo = writable_repository(path)?;
    let name = validate_branch_name(name)?;
    let head = repo
        .head()
        .and_then(|head| head.peel_to_commit())
        .map_err(|_| "Create the first commit before creating another branch.".to_string())?;
    repo.branch(name, &head, false)
        .map_err(|error| format!("Could not create branch '{name}': {error}"))?;
    checkout_local_branch(&repo, name)?;
    get_git_status(path).ok_or_else(|| "Could not refresh Git status.".to_string())
}

pub fn checkout_branch(path: &str, name: &str) -> Result<GitStatus, String> {
    let repo = writable_repository(path)?;
    let name = validate_branch_name(name)?;
    checkout_local_branch(&repo, name)?;
    get_git_status(path).ok_or_else(|| "Could not refresh Git status.".to_string())
}

pub fn delete_branch(path: &str, name: &str) -> Result<(), String> {
    let repo = writable_repository(path)?;
    let name = validate_branch_name(name)?;
    if branch_name(&repo) == name {
        return Err("The current branch cannot be deleted.".to_string());
    }
    let mut branch = repo
        .find_branch(name, BranchType::Local)
        .map_err(|error| format!("Could not find branch '{name}': {error}"))?;
    branch
        .delete()
        .map_err(|error| format!("Could not delete branch '{name}': {error}"))
}

pub fn add_remote(path: &str, name: &str, url: &str) -> Result<GitRepositoryInfo, String> {
    let repo = writable_repository(path)?;
    let name = validate_remote_name(name)?;
    let url = validate_remote_url(url)?;
    repo.remote(name, url)
        .map_err(|error| format!("Could not add remote '{name}': {error}"))?;
    get_repository_info(path, 30)
}

pub fn rename_remote(path: &str, current_name: &str, new_name: &str) -> Result<GitRepositoryInfo, String> {
    let repo = writable_repository(path)?;
    let current_name = validate_remote_name(current_name)?;
    let new_name = validate_remote_name(new_name)?;
    repo.remote_rename(current_name, new_name)
        .map_err(|error| format!("Could not rename remote '{current_name}': {error}"))?;
    get_repository_info(path, 30)
}

pub fn remove_remote(path: &str, name: &str) -> Result<GitRepositoryInfo, String> {
    let repo = writable_repository(path)?;
    let name = validate_remote_name(name)?;
    repo.remote_delete(name)
        .map_err(|error| format!("Could not remove remote '{name}': {error}"))?;
    get_repository_info(path, 30)
}

pub async fn fetch_remote(path: &str, remote: &str) -> Result<GitNetworkResult, String> {
    let context = network_context(path, remote)?;
    let output = run_git_command(
        &context.workdir,
        "fetch",
        &["fetch", "--prune", &context.remote],
    )
    .await?;
    network_result(path, "fetch", context, output)
}

pub async fn pull_remote(path: &str, remote: &str) -> Result<GitNetworkResult, String> {
    let status = get_git_status(path).ok_or_else(|| "Could not read Git status.".to_string())?;
    if !status.clean {
        return Err("Commit or stash local changes before pulling.".to_string());
    }
    let context = network_context(path, remote)?;
    let remote_branch = context.remote_branch.clone();
    let output = run_git_command(
        &context.workdir,
        "pull",
        &["pull", "--ff-only", &context.remote, &remote_branch],
    )
    .await?;
    network_result(path, "pull", context, output)
}

pub async fn push_remote(path: &str, remote: &str) -> Result<GitNetworkResult, String> {
    let context = network_context(path, remote)?;
    let destination = format!("HEAD:refs/heads/{}", context.branch);
    let mut arguments = vec!["push"];
    if !context.has_upstream {
        arguments.push("--set-upstream");
    }
    arguments.push(&context.remote);
    arguments.push(&destination);
    let output = run_git_command(&context.workdir, "push", &arguments).await?;
    network_result(path, "push", context, output)
}

struct NetworkContext {
    workdir: PathBuf,
    remote: String,
    branch: String,
    remote_branch: String,
    has_upstream: bool,
}

fn network_context(path: &str, remote: &str) -> Result<NetworkContext, String> {
    let repo = writable_repository(path)?;
    let remote = validate_remote_name(remote)?;
    repo.find_remote(remote)
        .map_err(|error| format!("Could not find remote '{remote}': {error}"))?;
    let workdir = repo
        .workdir()
        .ok_or_else(|| "Network operations require a working tree.".to_string())?
        .to_path_buf();
    let head = repo
        .head()
        .map_err(|_| "Create the first commit before using a remote.".to_string())?;
    if !head.is_branch() {
        return Err("Check out a local branch before using a remote.".to_string());
    }
    let branch = head
        .shorthand()
        .ok_or_else(|| "Current branch name is not valid UTF-8.".to_string())?
        .to_string();
    let local = repo
        .find_branch(&branch, BranchType::Local)
        .map_err(|error| format!("Could not read current branch: {error}"))?;
    let upstream = local
        .upstream()
        .ok()
        .and_then(|upstream| upstream.name().ok().flatten().map(str::to_string));
    let remote_prefix = format!("{remote}/");
    let remote_branch = upstream
        .as_deref()
        .and_then(|name| name.strip_prefix(&remote_prefix))
        .unwrap_or(&branch)
        .to_string();

    Ok(NetworkContext {
        workdir,
        remote: remote.to_string(),
        branch,
        remote_branch,
        has_upstream: upstream.is_some(),
    })
}

async fn run_git_command(
    workdir: &Path,
    operation: &str,
    arguments: &[&str],
) -> Result<String, String> {
    let mut command = Command::new("git");
    command
        .args(arguments)
        .current_dir(workdir)
        .env("GIT_TERMINAL_PROMPT", "0")
        .kill_on_drop(true);

    let output = timeout(GIT_NETWORK_TIMEOUT, command.output())
        .await
        .map_err(|_| format!("Git {operation} timed out after 120 seconds."))?
        .map_err(|error| format!("Could not start Git {operation}: {error}"))?;
    let combined = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let sanitized = redact_url_credentials(combined.trim());
    if !output.status.success() {
        let detail = if sanitized.is_empty() {
            format!("Git exited with status {}.", output.status)
        } else {
            sanitized
        };
        return Err(format!(
            "Git {operation} failed: {detail}\nConfigure a Git credential helper or SSH agent if authentication is required."
        ));
    }
    Ok(if sanitized.is_empty() {
        format!("Git {operation} completed.")
    } else {
        sanitized
    })
}

fn network_result(
    path: &str,
    operation: &str,
    context: NetworkContext,
    output: String,
) -> Result<GitNetworkResult, String> {
    let status = get_git_status(path).ok_or_else(|| "Could not refresh Git status.".to_string())?;
    Ok(GitNetworkResult {
        operation: operation.to_string(),
        remote: context.remote,
        branch: context.branch,
        output,
        status,
    })
}

fn redact_url_credentials(input: &str) -> String {
    let mut output = input.to_string();
    let mut search_from = 0usize;
    while let Some(relative_scheme) = output[search_from..].find("://") {
        let credentials_start = search_from + relative_scheme + 3;
        let remainder = &output[credentials_start..];
        let endpoint = remainder
            .find(|character: char| character.is_whitespace())
            .unwrap_or(remainder.len());
        let Some(relative_at) = remainder[..endpoint].rfind('@') else {
            search_from = credentials_start;
            continue;
        };
        let credentials_end = credentials_start + relative_at;
        output.replace_range(credentials_start..=credentials_end, "[redacted]@");
        search_from = credentials_start + "[redacted]@".len();
    }
    output
}

fn list_branches(repo: &Repository) -> Result<Vec<GitBranch>, String> {
    let mut result = Vec::new();
    let branches = repo
        .branches(None)
        .map_err(|error| format!("Could not list branches: {error}"))?;
    for branch_result in branches {
        let (branch, branch_type) =
            branch_result.map_err(|error| format!("Could not read branch: {error}"))?;
        let Some(name) = branch
            .name()
            .map_err(|error| format!("Could not read branch name: {error}"))?
        else {
            continue;
        };
        let remote = branch_type == BranchType::Remote;
        let upstream_branch = if remote { None } else { branch.upstream().ok() };
        let upstream = upstream_branch
            .as_ref()
            .and_then(|branch| branch.name().ok().flatten())
            .map(str::to_string);
        let divergence = if let (Some(local), Some(upstream_target)) = (
            branch.get().target(),
            upstream_branch.as_ref().and_then(|branch| branch.get().target()),
        ) {
            repo.graph_ahead_behind(local, upstream_target).unwrap_or((0, 0))
        } else {
            (0, 0)
        };
        result.push(GitBranch {
            name: name.to_string(),
            current: !remote && branch.is_head(),
            remote,
            upstream,
            ahead: divergence.0,
            behind: divergence.1,
        });
    }
    result.sort_by(|left, right| {
        right
            .current
            .cmp(&left.current)
            .then(left.remote.cmp(&right.remote))
            .then(left.name.cmp(&right.name))
    });
    Ok(result)
}

fn list_remotes(repo: &Repository) -> Result<Vec<GitRemote>, String> {
    let names = repo
        .remotes()
        .map_err(|error| format!("Could not list remotes: {error}"))?;
    let mut remotes = names
        .iter()
        .flatten()
        .filter_map(|name| repo.find_remote(name).ok().map(|remote| (name, remote)))
        .map(|(name, remote)| GitRemote {
            name: name.to_string(),
            url: remote.url().map(str::to_string),
            push_url: remote.pushurl().map(str::to_string),
        })
        .collect::<Vec<_>>();
    remotes.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(remotes)
}

fn list_history(repo: &Repository, limit: usize) -> Result<Vec<GitHistoryEntry>, String> {
    if repo.is_empty().unwrap_or(true) {
        return Ok(Vec::new());
    }
    let mut walk = repo
        .revwalk()
        .map_err(|error| format!("Could not read commit history: {error}"))?;
    walk.set_sorting(Sort::TIME)
        .map_err(|error| format!("Could not sort commit history: {error}"))?;
    walk.push_head()
        .map_err(|error| format!("Could not read HEAD history: {error}"))?;

    walk.take(limit)
        .map(|oid| {
            let oid = oid.map_err(|error| format!("Could not read commit: {error}"))?;
            let commit = repo
                .find_commit(oid)
                .map_err(|error| format!("Could not load commit: {error}"))?;
            let tree = commit
                .tree()
                .map_err(|error| format!("Could not load commit tree: {error}"))?;
            let parent_tree = commit.parent(0).ok().and_then(|parent| parent.tree().ok());
            let diff = repo
                .diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), None)
                .map_err(|error| format!("Could not inspect commit changes: {error}"))?;
            let stats = diff
                .stats()
                .map_err(|error| format!("Could not inspect commit statistics: {error}"))?;
            let author = commit.author();
            Ok(GitHistoryEntry {
                hash: short_oid(oid),
                full_hash: oid.to_string(),
                message: commit.summary().unwrap_or("(no commit message)").to_string(),
                author: author.name().unwrap_or("Unknown").to_string(),
                author_email: author.email().map(str::to_string),
                timestamp: commit.time().seconds(),
                parent_count: commit.parent_count(),
                files_changed: stats.files_changed(),
                additions: stats.insertions(),
                deletions: stats.deletions(),
            })
        })
        .collect()
}

fn checkout_local_branch(repo: &Repository, name: &str) -> Result<(), String> {
    let branch = repo
        .find_branch(name, BranchType::Local)
        .map_err(|error| format!("Could not find branch '{name}': {error}"))?;
    let reference = branch.get();
    let target = reference
        .peel_to_commit()
        .map_err(|error| format!("Could not load branch '{name}': {error}"))?;
    repo.checkout_tree(
        target.as_object(),
        Some(CheckoutBuilder::new().safe().recreate_missing(true)),
    )
    .map_err(|error| format!("Could not check out branch '{name}': {error}"))?;
    let reference_name = reference
        .name()
        .ok_or_else(|| "Branch reference is not valid UTF-8.".to_string())?;
    repo.set_head(reference_name)
        .map_err(|error| format!("Could not activate branch '{name}': {error}"))
}

fn validate_branch_name(name: &str) -> Result<&str, String> {
    let name = name.trim();
    let reference = format!("refs/heads/{name}");
    if name.is_empty() || !git2::Reference::is_valid_name(&reference) {
        return Err("Enter a valid Git branch name.".to_string());
    }
    Ok(name)
}

fn validate_remote_name(name: &str) -> Result<&str, String> {
    let name = name.trim();
    if name.is_empty()
        || name.contains(char::is_whitespace)
        || name.contains('/')
        || name.contains('\\')
    {
        return Err("Enter a valid remote name.".to_string());
    }
    Ok(name)
}

fn validate_remote_url(url: &str) -> Result<&str, String> {
    let url = url.trim();
    if url.is_empty() || url.contains('\0') {
        return Err("Enter a valid remote URL.".to_string());
    }
    Ok(url)
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

    #[test]
    fn creates_checks_out_lists_and_deletes_branches() {
        let test = TestRepo::init();
        test.write("README.md", "hello");
        test.commit_all("Initial commit");
        let original = status(&test.path).branch;

        let created = create_branch(test.path.to_str().unwrap(), "feature/test")
            .expect("create and checkout branch");
        assert_eq!(created.branch, "feature/test");

        let info = get_repository_info(test.path.to_str().unwrap(), 30)
            .expect("repository info");
        assert!(info
            .branches
            .iter()
            .any(|branch| branch.name == "feature/test" && branch.current));

        checkout_branch(test.path.to_str().unwrap(), &original).expect("checkout original");
        delete_branch(test.path.to_str().unwrap(), "feature/test").expect("delete branch");
        assert!(!get_repository_info(test.path.to_str().unwrap(), 30)
            .unwrap()
            .branches
            .iter()
            .any(|branch| branch.name == "feature/test"));
    }

    #[test]
    fn reports_commit_history_and_remote_lifecycle() {
        let test = TestRepo::init();
        test.write("README.md", "one\n");
        test.commit_all("Initial commit");
        test.write("README.md", "two\n");
        test.commit_all("Second commit");

        let added = add_remote(
            test.path.to_str().unwrap(),
            "origin",
            "https://example.test/repo.git",
        )
        .expect("add remote");
        assert_eq!(added.remotes[0].name, "origin");
        assert_eq!(added.history.len(), 2);
        assert_eq!(added.history[0].message, "Second commit");
        assert_eq!(added.history[0].files_changed, 1);
        assert_eq!(added.history[0].additions, 1);
        assert_eq!(added.history[0].deletions, 1);

        let renamed = rename_remote(test.path.to_str().unwrap(), "origin", "upstream")
            .expect("rename remote");
        assert_eq!(renamed.remotes[0].name, "upstream");

        let removed = remove_remote(test.path.to_str().unwrap(), "upstream")
            .expect("remove remote");
        assert!(removed.remotes.is_empty());
    }

    #[tokio::test]
    async fn pushes_fetches_and_fast_forward_pulls_with_a_local_remote() {
        let source = TestRepo::init();
        source.write("README.md", "one\n");
        source.commit_all("Initial commit");
        let remote_path = unique_test_path("remote.git");
        Repository::init_bare(&remote_path).expect("initialize bare remote");
        add_remote(
            source.path.to_str().unwrap(),
            "origin",
            remote_path.to_str().unwrap(),
        )
        .expect("add source remote");

        let pushed = push_remote(source.path.to_str().unwrap(), "origin")
            .await
            .expect("push initial commit");
        assert_eq!(pushed.operation, "push");
        assert!(pushed.status.clean);
        Repository::open_bare(&remote_path)
            .expect("open bare remote")
            .set_head(&format!("refs/heads/{}", pushed.branch))
            .expect("set bare remote HEAD");

        let clone_path = unique_test_path("clone");
        let clone_repo = Repository::clone(remote_path.to_str().unwrap(), &clone_path)
            .expect("clone local remote");
        configure_test_identity(&clone_repo);
        let clone = TestRepo {
            path: clone_path,
            repo: clone_repo,
        };
        clone.write("README.md", "two\n");
        clone.commit_all("Remote commit");
        push_remote(clone.path.to_str().unwrap(), "origin")
            .await
            .expect("push remote commit");

        let fetched = fetch_remote(source.path.to_str().unwrap(), "origin")
            .await
            .expect("fetch remote commit");
        assert_eq!(fetched.status.behind, 1);

        source.write("local.txt", "dirty");
        let dirty_pull = pull_remote(source.path.to_str().unwrap(), "origin").await;
        assert_eq!(
            dirty_pull.unwrap_err(),
            "Commit or stash local changes before pulling."
        );
        fs::remove_file(source.path.join("local.txt")).expect("remove dirty file");

        let pulled = pull_remote(source.path.to_str().unwrap(), "origin")
            .await
            .expect("fast-forward pull");
        assert!(pulled.status.clean);
        assert_eq!(
            fs::read_to_string(source.path.join("README.md")).unwrap(),
            "two\n"
        );

        let _ = fs::remove_dir_all(remote_path);
    }

    #[test]
    fn redacts_credentials_embedded_in_urls() {
        assert_eq!(
            redact_url_credentials(
                "fatal: unable to access 'https://user:secret@example.test/repo.git/'"
            ),
            "fatal: unable to access 'https://[redacted]@example.test/repo.git/'"
        );
    }

    fn unique_test_path(label: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be after epoch")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "localhost-hub-git-test-{}-{nonce}-{label}",
            std::process::id()
        ))
    }

    fn configure_test_identity(repo: &Repository) {
        let mut config = repo.config().expect("open repository config");
        config
            .set_str("user.name", "Localhost Hub")
            .expect("configure user name");
        config
            .set_str("user.email", "hub@example.test")
            .expect("configure user email");
    }
}
