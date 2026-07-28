use serde::{Deserialize, Serialize};

// Create an OAuth app with Device Authorization Flow enabled, then expose its
// public client ID when building. Keeping this optional means local and CI
// builds still work when GitHub integration is not configured.
const CLIENT_ID: Option<&str> = option_env!("GITHUB_CLIENT_ID");

fn client_id() -> Result<&'static str, String> {
    CLIENT_ID
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "GitHub OAuth is not configured for this build.".to_string())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub verification_uri_complete: Option<String>,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubUser {
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Deserialize)]
struct DeviceTokenResponse {
    access_token: Option<String>,
    error: Option<String>,
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
