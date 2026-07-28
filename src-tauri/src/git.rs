use git2::Repository;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitStatus {
    pub branch: String,
    pub ahead: usize,
    pub behind: usize,
    pub changed: usize,
    pub staged: usize,
    pub untracked: usize,
    pub clean: bool,
    pub last_commit_message: Option<String>,
    pub last_commit_hash: Option<String>,
}

pub fn get_git_status(path: &str) -> Option<GitStatus> {
    let repo = Repository::open(path).ok()?;

    let head = repo.head().ok()?;
    let branch = if head.is_branch() {
        head.shorthand().unwrap_or("HEAD").to_string()
    } else {
        head.target().map(|o| o.to_string()[..8].to_string()).unwrap_or_else(|| "HEAD".to_string())
    };

    // Count working tree changes
    let statuses = repo.statuses(None).ok()?;
    let mut changed = 0usize;
    let mut staged = 0usize;
    let mut untracked = 0usize;

    for entry in statuses.iter() {
        let s = entry.status();
        if s.is_index_new() || s.is_index_modified() || s.is_index_deleted() || s.is_index_renamed() {
            staged += 1;
        }
        if s.is_wt_new() {
            untracked += 1;
        } else if s.is_wt_modified() || s.is_wt_deleted() || s.is_wt_renamed() {
            changed += 1;
        }
    }

    // Ahead/behind relative to upstream
    let (ahead, behind) = upstream_divergence(&repo).unwrap_or((0, 0));

    // Last commit
    let (last_commit_message, last_commit_hash) = repo.head().ok()
        .and_then(|h| h.peel_to_commit().ok())
        .map(|c| {
            let msg = c.summary().unwrap_or("").to_string();
            let hash = c.id().to_string()[..8].to_string();
            (msg, hash)
        })
        .map(|(m, h)| (Some(m), Some(h)))
        .unwrap_or((None, None));

    let clean = changed == 0 && staged == 0;

    Some(GitStatus {
        branch,
        ahead,
        behind,
        changed: changed + staged,
        staged,
        untracked,
        clean,
        last_commit_message,
        last_commit_hash,
    })
}

fn upstream_divergence(repo: &Repository) -> Option<(usize, usize)> {
    let head = repo.head().ok()?;
    let local = head.target()?;

    let upstream = {
        let branch_name = head.shorthand()?;
        let branch = repo.find_branch(branch_name, git2::BranchType::Local).ok()?;
        let upstream_branch = branch.upstream().ok()?;
        upstream_branch.get().target()?
    };

    let (ahead, behind) = repo.graph_ahead_behind(local, upstream).ok()?;
    Some((ahead, behind))
}
