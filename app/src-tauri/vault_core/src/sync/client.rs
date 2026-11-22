// HTTP Sync Server API Client

use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginResponse {
    pub token: String,
    pub device: DeviceInfo,
    pub user: UserInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInfo {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserInfo {
    pub id: String,
    pub username: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteVault {
    pub id: String,
    pub name: String,
    pub version_retention_days: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteManifestItem {
    pub path: String,
    pub hash: String,
    pub size: i64,
    pub mtime: i64,
    pub version: i64,
    pub deleted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteManifestResponse {
    pub cursor: i64,
    pub items: Option<Vec<RemoteManifestItem>>,
    #[serde(default)]
    pub has_more: bool,
    #[serde(default)]
    pub total_notes: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushChangeItem {
    pub path: String,
    pub hash: String,
    pub size: i64,
    pub mtime: i64,
    pub base_version: i64,
    pub deleted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushResultItem {
    pub path: String,
    pub status: String, // "applied", "conflict", "skipped"
    pub version: i64,
    pub server_hash: Option<String>,
    pub server_mtime: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushResponse {
    pub results: Vec<PushResultItem>,
    pub new_cursor: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlobResponse {
    pub hash: String,
    pub size: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AssembleChunkRequest {
    upload_id: String,
    total_chunks: usize,
    expected_hash: String,
}

pub struct SyncClient {
    client: reqwest::blocking::Client,
    server_url: String,
    token: String,
}

impl SyncClient {
    pub fn new(server_url: String, token: String) -> Self {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .unwrap_or_else(|_| reqwest::blocking::Client::new());

        let clean_url = server_url.trim_end_matches('/').to_string();

        Self {
            client,
            server_url: clean_url,
            token,
        }
    }

    fn retry<T, F>(&self, mut operation: F) -> Result<T, String>
    where
        F: FnMut() -> Result<T, String>,
    {
        let mut attempts = 0;
        let mut delay = Duration::from_millis(150);

        loop {
            match operation() {
                Ok(val) => return Ok(val),
                Err(e) => {
                    attempts += 1;
                    if attempts >= 3 {
                        return Err(e);
                    }
                    std::thread::sleep(delay);
                    delay *= 2; // Exponential backoff
                }
            }
        }
    }

    pub fn health(&self) -> Result<bool, String> {
        let url = format!("{}/healthz", self.server_url);
        let resp = self
            .client
            .get(&url)
            .send()
            .map_err(|e| format!("Server connectivity check failed: {}", e))?;
        Ok(resp.status().is_success())
    }

    pub fn login(
        server_url: &str,
        username: &str,
        password: &str,
        device_name: &str,
    ) -> Result<LoginResponse, String> {
        let clean_url = server_url.trim_end_matches('/');
        let url = format!("{}/api/v1/auth/login", clean_url);
        let client = reqwest::blocking::Client::new();

        let payload = serde_json::json!({
            "username": username,
            "password": password,
            "device_name": device_name,
        });

        let resp = client
            .post(&url)
            .json(&payload)
            .send()
            .map_err(|e| format!("Login network error: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().unwrap_or_default();
            return Err(format!("Login failed ({}): {}", status, text));
        }

        resp.json::<LoginResponse>()
            .map_err(|e| format!("Invalid login response from server: {}", e))
    }

    pub fn list_vaults(&self) -> Result<Vec<RemoteVault>, String> {
        self.retry(|| {
            let url = format!("{}/api/v1/vaults", self.server_url);
            let resp = self
                .client
                .get(&url)
                .header("Authorization", format!("Bearer {}", self.token))
                .send()
                .map_err(|e| format!("Failed to list vaults: {}", e))?;

            if !resp.status().is_success() {
                return Err(format!("Server returned error: {}", resp.status()));
            }

            resp.json::<Vec<RemoteVault>>()
                .map_err(|e| format!("Failed to parse vaults response: {}", e))
        })
    }

    pub fn create_vault(&self, name: &str) -> Result<RemoteVault, String> {
        self.retry(|| {
            let url = format!("{}/api/v1/vaults", self.server_url);
            let payload = serde_json::json!({ "name": name, "version_retention_days": 30 });

            let resp = self
                .client
                .post(&url)
                .header("Authorization", format!("Bearer {}", self.token))
                .json(&payload)
                .send()
                .map_err(|e| format!("Failed to create vault: {}", e))?;

            if !resp.status().is_success() {
                return Err(format!("Server rejected vault creation: {}", resp.status()));
            }

            resp.json::<RemoteVault>()
                .map_err(|e| format!("Failed to parse created vault: {}", e))
        })
    }

    pub fn get_manifest(
        &self,
        vault_id: &str,
        since_cursor: i64,
    ) -> Result<RemoteManifestResponse, String> {
        self.retry(|| {
            let url = format!(
                "{}/api/v1/vaults/{}/manifest?since={}&limit=1000",
                self.server_url, vault_id, since_cursor
            );
            let resp = self
                .client
                .get(&url)
                .header("Authorization", format!("Bearer {}", self.token))
                .send()
                .map_err(|e| format!("Failed to fetch manifest: {}", e))?;

            if !resp.status().is_success() {
                return Err(format!("Manifest pull error: {}", resp.status()));
            }

            resp.json::<RemoteManifestResponse>()
                .map_err(|e| format!("Failed to parse manifest: {}", e))
        })
    }

    pub fn push(
        &self,
        vault_id: &str,
        changes: Vec<PushChangeItem>,
    ) -> Result<PushResponse, String> {
        if changes.is_empty() {
            return Ok(PushResponse {
                results: vec![],
                new_cursor: 0,
            });
        }

        self.retry(|| {
            let url = format!("{}/api/v1/vaults/{}/push", self.server_url, vault_id);
            let resp = self
                .client
                .post(&url)
                .header("Authorization", format!("Bearer {}", self.token))
                .json(&changes)
                .send()
                .map_err(|e| format!("Failed to push changes: {}", e))?;

            if !resp.status().is_success() {
                return Err(format!("Push rejected by server: {}", resp.status()));
            }

            resp.json::<PushResponse>()
                .map_err(|e| format!("Failed to parse push response: {}", e))
        })
    }

    pub fn get_blob(&self, hash: &str) -> Result<Vec<u8>, String> {
        self.retry(|| {
            let url = format!("{}/api/v1/blobs/{}", self.server_url, hash);
            let resp = self
                .client
                .get(&url)
                .header("Authorization", format!("Bearer {}", self.token))
                .send()
                .map_err(|e| format!("Failed to download blob {}: {}", hash, e))?;

            if !resp.status().is_success() {
                return Err(format!("Blob fetch failed: {}", resp.status()));
            }

            resp.bytes()
                .map(|b| b.to_vec())
                .map_err(|e| format!("Failed to read blob body: {}", e))
        })
    }

    pub fn put_blob(&self, data: &[u8]) -> Result<BlobResponse, String> {
        // If larger than 5MB, upload in chunks
        const CHUNK_SIZE: usize = 2 * 1024 * 1024; // 2MB
        if data.len() > 5 * 1024 * 1024 {
            return self.put_blob_chunked(data, CHUNK_SIZE);
        }

        self.retry(|| {
            let url = format!("{}/api/v1/blobs", self.server_url);
            let resp = self
                .client
                .post(&url)
                .header("Authorization", format!("Bearer {}", self.token))
                .header("Content-Type", "application/octet-stream")
                .body(data.to_vec())
                .send()
                .map_err(|e| format!("Failed to upload blob: {}", e))?;

            if !resp.status().is_success() {
                return Err(format!("Blob upload failed: {}", resp.status()));
            }

            resp.json::<BlobResponse>()
                .map_err(|e| format!("Failed to parse blob response: {}", e))
        })
    }

    fn put_blob_chunked(&self, data: &[u8], chunk_size: usize) -> Result<BlobResponse, String> {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(data);
        let expected_hash = hex::encode(hasher.finalize());

        let upload_id = format!("upl_{}_{}", expected_hash[..8].to_string(), data.len());
        let chunks: Vec<&[u8]> = data.chunks(chunk_size).collect();
        let total_chunks = chunks.len();

        for (idx, chunk) in chunks.iter().enumerate() {
            self.retry(|| {
                let url = format!(
                    "{}/api/v1/blobs/chunk?upload_id={}&chunk_index={}",
                    self.server_url, upload_id, idx
                );
                let resp = self
                    .client
                    .post(&url)
                    .header("Authorization", format!("Bearer {}", self.token))
                    .body(chunk.to_vec())
                    .send()
                    .map_err(|e| format!("Chunk {} upload failed: {}", idx, e))?;

                if !resp.status().is_success() {
                    return Err(format!("Chunk {} rejected: {}", idx, resp.status()));
                }
                Ok(())
            })?;
        }

        // Assemble
        self.retry(|| {
            let url = format!("{}/api/v1/blobs/chunk/assemble", self.server_url);
            let req = AssembleChunkRequest {
                upload_id: upload_id.clone(),
                total_chunks,
                expected_hash: expected_hash.clone(),
            };

            let resp = self
                .client
                .post(&url)
                .header("Authorization", format!("Bearer {}", self.token))
                .json(&req)
                .send()
                .map_err(|e| format!("Chunk assembly failed: {}", e))?;

            if !resp.status().is_success() {
                return Err(format!("Chunk assembly rejected: {}", resp.status()));
            }

            resp.json::<BlobResponse>()
                .map_err(|e| format!("Failed to parse assembled blob: {}", e))
        })
    }
}
