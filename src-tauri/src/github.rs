use git2::Repository;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

// Create an OAuth app with Device Authorization Flow enabled, then expose its
// public client ID when building. Keeping this optional means local and CI
// builds still work when GitHub integration is not configured.
const CLIENT_ID: Option<&str> = option_env!("GITHUB_CLIENT_ID");

fn client_id() -> Result<&'static str, String> {
    CLIENT_ID
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "GitHub OAuth is not configured for this build.".to_string())
}

#[derive(Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub verification_uri_complete: Option<String>,
    // Tauri serializes through serde_json, so this arrives as a JSON number.
    #[ts(type = "number")]
    pub expires_in: u64,
    // Tauri serializes through serde_json, so this arrives as a JSON number.
    #[ts(type = "number")]
    pub interval: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
pub struct GitHubUser {
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
pub struct GitHubRepo {
    pub name: String,
    pub full_name: String,
    pub html_url: String,
    pub clone_url: String,
    pub ssh_url: String,
    pub private: bool,
    pub description: Option<String>,
    pub default_branch: String,
    pub updated_at: String,
    pub language: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
pub struct GitHubProjectRepository {
    pub name: String,
    pub full_name: String,
    pub html_url: String,
    pub private: bool,
    pub archived: bool,
    pub fork: bool,
    pub description: Option<String>,
    pub default_branch: String,
    // Tauri serializes through serde_json, so this arrives as a JSON number.
    #[ts(type = "number")]
    pub open_issues_count: u64,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
pub struct GitHubPullRequest {
    // Tauri serializes through serde_json, so this arrives as a JSON number.
    #[ts(type = "number")]
    pub number: u64,
    pub title: String,
    pub html_url: String,
    pub draft: bool,
    pub head_ref: String,
    pub base_ref: String,
    pub author: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
pub struct GitHubIssue {
    // Tauri serializes through serde_json, so this arrives as a JSON number.
    #[ts(type = "number")]
    pub number: u64,
    pub title: String,
    pub html_url: String,
    pub author: String,
    pub labels: Vec<GitHubLabel>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
pub struct GitHubLabel {
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
pub struct GitHubCheckRun {
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub html_url: Option<String>,
    pub app_name: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../src/generated/")]
pub struct GitHubProjectContext {
    pub repository: GitHubProjectRepository,
    pub remote_name: String,
    pub remote_url: String,
    pub current_branch: Option<String>,
    pub head_sha: Option<String>,
    pub pull_requests: Vec<GitHubPullRequest>,
    pub issues: Vec<GitHubIssue>,
    pub checks: Vec<GitHubCheckRun>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct DeviceTokenResponse {
    access_token: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ApiPullRequest {
    number: u64,
    title: String,
    html_url: String,
    #[serde(default)]
    draft: bool,
    head: ApiBranchRef,
    base: ApiBranchRef,
    user: Option<ApiUser>,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
struct ApiBranchRef {
    #[serde(rename = "ref")]
    name: String,
}

#[derive(Debug, Deserialize)]
struct ApiUser {
    login: String,
}

#[derive(Debug, Deserialize)]
struct ApiIssue {
    number: u64,
    title: String,
    html_url: String,
    user: Option<ApiUser>,
    #[serde(default)]
    labels: Vec<GitHubLabel>,
    updated_at: String,
    pull_request: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct ApiCheckRuns {
    #[serde(default)]
    check_runs: Vec<ApiCheckRun>,
}

#[derive(Debug, Deserialize)]
struct ApiCheckRun {
    name: String,
    status: String,
    conclusion: Option<String>,
    html_url: Option<String>,
    app: Option<ApiCheckApp>,
    started_at: Option<String>,
    completed_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ApiCheckApp {
    name: String,
}

struct LocalGitHubIdentity {
    full_name: String,
    remote_name: String,
    remote_url: String,
    current_branch: Option<String>,
    head_sha: Option<String>,
}

pub async fn request_device_code() -> Result<DeviceCodeResponse, String> {
    let client_id = client_id()?;
    let client = reqwest::Client::new();
    let resp = client
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .header("User-Agent", "localhost-hub")
        .form(&[("client_id", client_id), ("scope", "repo user read:org")])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    resp.json::<DeviceCodeResponse>()
        .await
        .map_err(|e| e.to_string())
}

/// Returns (access_token, GitHubUser). The token stays in Rust — callers save it to config.
pub async fn poll_token(device_code: &str) -> Result<(String, GitHubUser), String> {
    let client_id = client_id()?;
    let client = reqwest::Client::new();
    let resp = client
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .header("User-Agent", "localhost-hub")
        .form(&[
            ("client_id", client_id),
            ("device_code", device_code),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let token_resp: DeviceTokenResponse = resp.json().await.map_err(|e| e.to_string())?;

    if let Some(err) = token_resp.error {
        return Err(err);
    }

    let token = token_resp.access_token.ok_or("no access_token in response")?;
    let user = fetch_user(&token).await?;
    Ok((token, user))
}

pub async fn fetch_user(token: &str) -> Result<GitHubUser, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.github.com/user")
        .header("Authorization", format!("Bearer {token}"))
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "localhost-hub")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    resp.json::<GitHubUser>().await.map_err(|e| e.to_string())
}

pub async fn fetch_repos(token: &str) -> Result<Vec<GitHubRepo>, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.github.com/user/repos")
        .query(&[
            ("per_page", "100"),
            ("sort", "updated"),
            ("affiliation", "owner,collaborator,organization_member"),
        ])
        .header("Authorization", format!("Bearer {token}"))
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "localhost-hub")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("GitHub repos request failed: {}", resp.status()));
    }

    resp.json::<Vec<GitHubRepo>>().await.map_err(|e| e.to_string())
}

pub async fn fetch_project_context(
    token: &str,
    path: &str,
) -> Result<GitHubProjectContext, String> {
    let identity = resolve_local_github_identity(path)?;
    let client = reqwest::Client::new();
    let api_root = format!("https://api.github.com/repos/{}", identity.full_name);
    let pulls_url =
        format!("{api_root}/pulls?state=open&sort=updated&direction=desc&per_page=10");
    let issues_url =
        format!("{api_root}/issues?state=open&sort=updated&direction=desc&per_page=10");
    let repository_request = github_get::<GitHubProjectRepository>(&client, token, &api_root);
    let pulls_request = github_get::<Vec<ApiPullRequest>>(&client, token, &pulls_url);
    let issues_request = github_get::<Vec<ApiIssue>>(&client, token, &issues_url);
    let checks_request = async {
        match identity.head_sha.as_deref() {
            Some(head_sha) => github_get::<ApiCheckRuns>(
                &client,
                token,
                &format!("{api_root}/commits/{head_sha}/check-runs?per_page=100"),
            )
            .await,
            None => Ok(ApiCheckRuns {
                check_runs: Vec::new(),
            }),
        }
    };

    let (repository, pulls, issues, checks) =
        tokio::join!(repository_request, pulls_request, issues_request, checks_request);
    let repository = repository?;
    let mut warnings = Vec::new();
    let pull_requests = match pulls {
        Ok(items) => items
            .into_iter()
            .map(|item| GitHubPullRequest {
                number: item.number,
                title: item.title,
                html_url: item.html_url,
                draft: item.draft,
                head_ref: item.head.name,
                base_ref: item.base.name,
                author: item
                    .user
                    .map(|user| user.login)
                    .unwrap_or_else(|| "unknown".to_string()),
                updated_at: item.updated_at,
            })
            .collect(),
        Err(error) => {
            warnings.push(format!("Pull requests unavailable: {error}"));
            Vec::new()
        }
    };
    let issues = match issues {
        Ok(items) => items
            .into_iter()
            .filter(|item| item.pull_request.is_none())
            .map(|item| GitHubIssue {
                number: item.number,
                title: item.title,
                html_url: item.html_url,
                author: item
                    .user
                    .map(|user| user.login)
                    .unwrap_or_else(|| "unknown".to_string()),
                labels: item.labels,
                updated_at: item.updated_at,
            })
            .collect(),
        Err(error) => {
            warnings.push(format!("Issues unavailable: {error}"));
            Vec::new()
        }
    };
    let checks = match checks {
        Ok(items) => items
            .check_runs
            .into_iter()
            .map(|item| GitHubCheckRun {
                name: item.name,
                status: item.status,
                conclusion: item.conclusion,
                html_url: item.html_url,
                app_name: item.app.map(|app| app.name),
                started_at: item.started_at,
                completed_at: item.completed_at,
            })
            .collect(),
        Err(error) => {
            warnings.push(format!("Checks unavailable: {error}"));
            Vec::new()
        }
    };

    Ok(GitHubProjectContext {
        repository,
        remote_name: identity.remote_name,
        remote_url: identity.remote_url,
        current_branch: identity.current_branch,
        head_sha: identity.head_sha,
        pull_requests,
        issues,
        checks,
        warnings,
    })
}

pub fn open_github_url(url: &str) -> Result<(), String> {
    let parsed = validate_github_url(url)?;
    std::thread::spawn(move || {
        let _ = open::that(parsed.to_string());
    });
    Ok(())
}

fn validate_github_url(url: &str) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(url).map_err(|_| "Enter a valid GitHub URL.".to_string())?;
    if parsed.scheme() != "https" || parsed.host_str() != Some("github.com") {
        return Err("Only HTTPS links on github.com can be opened here.".to_string());
    }
    Ok(parsed)
}

async fn github_get<T: DeserializeOwned>(
    client: &reqwest::Client,
    token: &str,
    url: &str,
) -> Result<T, String> {
    let response = client
        .get(url)
        .header("Authorization", format!("Bearer {token}"))
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .header("User-Agent", "localhost-hub")
        .send()
        .await
        .map_err(|error| format!("GitHub request failed: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        let detail = response.text().await.unwrap_or_default();
        let detail = detail.chars().take(400).collect::<String>();
        return Err(if detail.is_empty() {
            format!("GitHub request failed: {status}")
        } else {
            format!("GitHub request failed ({status}): {detail}")
        });
    }
    response
        .json::<T>()
        .await
        .map_err(|error| format!("Could not read the GitHub response: {error}"))
}

fn resolve_local_github_identity(path: &str) -> Result<LocalGitHubIdentity, String> {
    let repository =
        Repository::discover(path).map_err(|_| "This project is not a Git repository.".to_string())?;
    let mut remote_names = repository
        .remotes()
        .map_err(|error| format!("Could not inspect Git remotes: {error}"))?
        .iter()
        .flatten()
        .map(str::to_string)
        .collect::<Vec<_>>();
    remote_names.sort_by_key(|name| if name == "origin" { 0 } else { 1 });

    let mut resolved = None;
    for name in remote_names {
        let Ok(remote) = repository.find_remote(&name) else {
            continue;
        };
        let url = remote.url().or_else(|| remote.pushurl());
        let Some(url) = url else {
            continue;
        };
        if let Some(full_name) = parse_github_repository(url) {
            resolved = Some((full_name, name, url.to_string()));
            break;
        }
    }
    let (full_name, remote_name, remote_url) = resolved.ok_or_else(|| {
        "No github.com Git remote is configured for this project.".to_string()
    })?;
    let head = repository.head().ok();
    let current_branch = head
        .as_ref()
        .filter(|head| head.is_branch())
        .and_then(|head| head.shorthand())
        .map(str::to_string);
    let head_sha = head
        .as_ref()
        .and_then(|head| head.target())
        .map(|oid| oid.to_string());

    Ok(LocalGitHubIdentity {
        full_name,
        remote_name,
        remote_url,
        current_branch,
        head_sha,
    })
}

fn parse_github_repository(url: &str) -> Option<String> {
    let trimmed = url.trim().trim_end_matches('/');
    let path = if let Some(path) = trimmed.strip_prefix("git@github.com:") {
        path
    } else if let Some(path) = trimmed.strip_prefix("https://github.com/") {
        path
    } else if let Some(path) = trimmed.strip_prefix("http://github.com/") {
        path
    } else if let Some(path) = trimmed.strip_prefix("ssh://git@github.com/") {
        path
    } else {
        return None;
    };
    let path = path.strip_suffix(".git").unwrap_or(path);
    let (owner, name) = path.split_once('/')?;
    if owner.is_empty()
        || name.is_empty()
        || name.contains('/')
        || !owner
            .chars()
            .chain(name.chars())
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.'))
    {
        return None;
    }
    Some(format!("{owner}/{name}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temporary_repository() -> (PathBuf, Repository) {
        let path = std::env::temp_dir().join(format!(
            "localhost-hub-github-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let repository = Repository::init(&path).unwrap();
        (path, repository)
    }

    #[test]
    fn parses_supported_github_remote_urls() {
        assert_eq!(
            parse_github_repository("https://github.com/MadsenDev/localhost-hub.git"),
            Some("MadsenDev/localhost-hub".to_string())
        );
        assert_eq!(
            parse_github_repository("git@github.com:vardirhq/skald.git"),
            Some("vardirhq/skald".to_string())
        );
        assert_eq!(
            parse_github_repository("ssh://git@github.com/owner/repo"),
            Some("owner/repo".to_string())
        );
        assert_eq!(parse_github_repository("https://gitlab.com/owner/repo"), None);
        assert_eq!(parse_github_repository("https://github.com/owner/repo/extra"), None);
    }

    #[test]
    fn resolves_origin_before_other_github_remotes() {
        let (path, repository) = temporary_repository();
        repository
            .remote("upstream", "https://github.com/example/upstream.git")
            .unwrap();
        repository
            .remote("origin", "git@github.com:example/origin.git")
            .unwrap();

        let identity = resolve_local_github_identity(path.to_str().unwrap()).unwrap();
        assert_eq!(identity.full_name, "example/origin");
        assert_eq!(identity.remote_name, "origin");
        assert_eq!(identity.remote_url, "git@github.com:example/origin.git");

        drop(repository);
        fs::remove_dir_all(path).unwrap();
    }

    #[test]
    fn restricts_external_links_to_github_https() {
        assert!(validate_github_url("https://github.com/MadsenDev/localhost-hub").is_ok());
        assert!(validate_github_url("http://github.com/MadsenDev/localhost-hub").is_err());
        assert!(validate_github_url("https://github.com.example.test/phishing").is_err());
        assert!(validate_github_url("https://example.test/github.com").is_err());
    }
}
