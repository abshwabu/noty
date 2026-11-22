pub mod client;
pub mod crypto;
pub mod diff3;
pub mod filter;
pub mod state;

use client::{PushChangeItem, SyncClient};
use crypto::{decrypt_payload, derive_vault_key, encrypt_payload};
use diff3::{diff3_merge, MergeResult};
use filter::SyncFilter;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use state::{SyncEntry, SyncStateStore};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncSummary {
    pub pushed: usize,
    pub pulled: usize,
    pub merged: usize,
    pub conflicts: usize,
    pub deleted_local: usize,
    pub deleted_remote: usize,
    pub timestamp: i64,
    pub error: Option<String>,
}

pub struct SyncEngine {
    vault_root: PathBuf,
    state: SyncStateStore,
}

impl SyncEngine {
    pub fn new<P: AsRef<Path>>(vault_root: P) -> Result<Self, String> {
        let root = vault_root.as_ref().to_path_buf();
        let db_path = root.join(".noty").join("sync.db");
        let state = SyncStateStore::open(db_path)?;

        Ok(Self {
            vault_root: root,
            state,
        })
    }

    pub fn state(&self) -> &SyncStateStore {
        &self.state
    }

    fn now_secs() -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64
    }

    fn compute_file_hash<P: AsRef<Path>>(path: P) -> Result<(String, i64, i64), String> {
        let metadata = fs::metadata(path.as_ref()).map_err(|e| e.to_string())?;
        let size = metadata.len() as i64;
        let mtime = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let data = fs::read(path.as_ref()).map_err(|e| e.to_string())?;
        let mut hasher = Sha256::new();
        hasher.update(&data);
        let hash = hex::encode(hasher.finalize());

        Ok((hash, size, mtime))
    }

    /// Recursively scan local vault files
    fn scan_local_files(&self, filter: &SyncFilter) -> Result<HashMap<String, (String, i64, i64)>, String> {
        let mut map = HashMap::new();
        self.scan_dir(&self.vault_root, "", filter, &mut map)?;
        Ok(map)
    }

    fn scan_dir(
        &self,
        dir: &Path,
        rel_prefix: &str,
        filter: &SyncFilter,
        map: &mut HashMap<String, (String, i64, i64)>,
    ) -> Result<(), String> {
        if !dir.exists() {
            return Ok(());
        }

        let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;
        for entry in entries.flatten() {
            let path = entry.path();
            let file_name = entry.file_name().to_string_lossy().to_string();
            let rel_path = if rel_prefix.is_empty() {
                file_name
            } else {
                format!("{}/{}", rel_prefix, file_name)
            };

            if filter.is_excluded(&rel_path) {
                continue;
            }

            if path.is_dir() {
                self.scan_dir(&path, &rel_path, filter, map)?;
            } else if path.is_file() {
                if let Ok(info) = Self::compute_file_hash(&path) {
                    map.insert(rel_path, info);
                }
            }
        }
        Ok(())
    }

    /// Perform a full manual or automated sync cycle
    pub fn sync(&self) -> Result<SyncSummary, String> {
        let config = self.state.get_config()?;
        if config.token.is_empty() || config.vault_id.is_empty() {
            let err = "Sync is not configured. Please log in and choose a vault.".to_string();
            self.state.log("warn", "Sync aborted: missing configuration", None);
            return Err(err);
        }

        self.state.log("info", "Starting sync cycle", Some(&format!("Vault: {}", config.vault_name)));

        let client = SyncClient::new(config.server_url.clone(), config.token.clone());
        let filter = SyncFilter::new(config.excluded_patterns.clone());

        // Derive E2EE key if passphrase configured
        let e2ee_key = if let Some(ref pass) = config.e2ee_passphrase {
            if !pass.trim().is_empty() {
                // Salt derived from vault_id
                let salt = format!("noty-vlt-{}", config.vault_id);
                Some(derive_vault_key(pass, salt.as_bytes())?)
            } else {
                None
            }
        } else {
            None
        };

        // 1. Pull remote manifest
        let manifest_resp = client.get_manifest(&config.vault_id, config.last_cursor)?;
        let remote_items = manifest_resp.items.unwrap_or_default();
        let mut new_cursor = manifest_resp.cursor;

        // 2. Scan local files
        let local_files = self.scan_local_files(&filter)?;

        // 3. Load base sync entries
        let base_entries_list = self.state.get_all_entries()?;
        let mut base_map: HashMap<String, SyncEntry> = HashMap::new();
        for b in base_entries_list {
            base_map.insert(b.path.clone(), b);
        }

        let mut pushed = 0;
        let mut pulled = 0;
        let mut merged = 0;
        let mut conflicts = 0;
        let mut deleted_local = 0;
        let mut deleted_remote = 0;

        // Index remote changes
        let mut remote_map = HashMap::new();
        for item in remote_items {
            remote_map.insert(item.path.clone(), item);
        }

        // --- PUSH PHASE: Compare Local vs Base ---
        let mut push_changes = Vec::new();
        let mut files_to_upload = Vec::new();

        for (rel_path, (hash, size, mtime)) in &local_files {
            let base = base_map.get(rel_path);

            let is_modified = match base {
                Some(b) => !b.deleted && b.local_hash != *hash,
                None => true, // New local file
            };

            if is_modified {
                // Check if remote also changed concurrently
                if let Some(r) = remote_map.get(rel_path) {
                    if r.hash != *hash {
                        // Will be handled in three-way merge phase below
                        continue;
                    }
                }

                let base_ver = base.map(|b| b.remote_version).unwrap_or(0);
                push_changes.push(PushChangeItem {
                    path: rel_path.clone(),
                    hash: hash.clone(),
                    size: *size,
                    mtime: *mtime,
                    base_version: base_ver,
                    deleted: false,
                });
                files_to_upload.push(rel_path.clone());
            }
        }

        // Local deletions (in base, not deleted in base, but missing from disk)
        for (base_path, base_entry) in &base_map {
            if !base_entry.deleted && !local_files.contains_key(base_path) && !filter.is_excluded(base_path) {
                // Check if already deleted remotely
                if let Some(r) = remote_map.get(base_path) {
                    if r.deleted {
                        continue;
                    }
                }
                push_changes.push(PushChangeItem {
                    path: base_path.clone(),
                    hash: "".to_string(),
                    size: 0,
                    mtime: Self::now_secs(),
                    base_version: base_entry.remote_version,
                    deleted: true,
                });
                deleted_remote += 1;
            }
        }

        // Upload blobs for pushed local files
        for rel_path in &files_to_upload {
            let abs_path = self.vault_root.join(rel_path);
            if let Ok(raw_bytes) = fs::read(&abs_path) {
                let payload = if let Some(ref key) = e2ee_key {
                    encrypt_payload(key, &raw_bytes)?
                } else {
                    raw_bytes
                };
                client.put_blob(&payload)?;
            }
        }

        // Execute Push batch to server
        if !push_changes.is_empty() {
            let push_res = client.push(&config.vault_id, push_changes)?;
            if push_res.new_cursor > new_cursor {
                new_cursor = push_res.new_cursor;
            }

            for res in push_res.results {
                if res.status == "applied" {
                    if let Some((hash, size, mtime)) = local_files.get(&res.path) {
                        let entry = SyncEntry {
                            path: res.path.clone(),
                            local_hash: hash.clone(),
                            remote_hash: hash.clone(),
                            remote_version: res.version,
                            mtime: *mtime,
                            size: *size,
                            deleted: false,
                            synced_at: Self::now_secs(),
                        };
                        self.state.put_entry(&entry)?;
                        pushed += 1;
                    } else {
                        // Deleted file tombstone applied
                        let entry = SyncEntry {
                            path: res.path.clone(),
                            local_hash: "".to_string(),
                            remote_hash: "".to_string(),
                            remote_version: res.version,
                            mtime: Self::now_secs(),
                            size: 0,
                            deleted: true,
                            synced_at: Self::now_secs(),
                        };
                        self.state.put_entry(&entry)?;
                    }
                } else if res.status == "conflict" {
                    // Server has a newer version; we will handle it in pull
                    conflicts += 1;
                }
            }
        }

        // --- PULL / MERGE PHASE: Apply Remote Changes ---
        for (rem_path, rem_item) in remote_map {
            let base = base_map.get(&rem_path);
            let local = local_files.get(&rem_path);

            if rem_item.deleted {
                // Remote deleted this file
                if let Some((_, _, _)) = local {
                    let is_local_modified = match base {
                        Some(b) => b.local_hash != local.unwrap().0,
                        None => true,
                    };

                    if is_local_modified {
                        // Conflict: remote deleted, but local was edited!
                        conflicts += 1;
                        self.state.record_conflict(
                            &rem_path,
                            base.map(|b| b.local_hash.as_str()).unwrap_or(""),
                            &local.unwrap().0,
                            "",
                            &fs::read_to_string(self.vault_root.join(&rem_path)).unwrap_or_default(),
                            "(Remote deleted file)",
                            "",
                        )?;
                    } else {
                        // Clean delete: remove local file or move to trash
                        let abs_path = self.vault_root.join(&rem_path);
                        let _ = fs::remove_file(abs_path);
                        deleted_local += 1;

                        let entry = SyncEntry {
                            path: rem_path.clone(),
                            local_hash: "".to_string(),
                            remote_hash: "".to_string(),
                            remote_version: rem_item.version,
                            mtime: rem_item.mtime,
                            size: 0,
                            deleted: true,
                            synced_at: Self::now_secs(),
                        };
                        self.state.put_entry(&entry)?;
                    }
                }
                continue;
            }

            // Remote has a file update
            let local_modified = match local {
                Some((h, _, _)) => match base {
                    Some(b) => b.local_hash != *h,
                    None => true,
                },
                None => false,
            };

            let remote_changed_from_base = match base {
                Some(b) => b.remote_hash != rem_item.hash,
                None => true,
            };

            if !remote_changed_from_base && !local_modified {
                continue;
            }

            // Download blob
            let remote_blob = client.get_blob(&rem_item.hash)?;
            let remote_bytes = if let Some(ref key) = e2ee_key {
                decrypt_payload(key, &remote_blob)?
            } else {
                remote_blob
            };

            if local_modified {
                // CONFLICT SCENARIO: Both local and remote modified
                if let Some((local_hash, _, _)) = local {
                    if *local_hash == rem_item.hash {
                        // Identical content edits! No conflict
                        let entry = SyncEntry {
                            path: rem_path.clone(),
                            local_hash: local_hash.clone(),
                            remote_hash: rem_item.hash.clone(),
                            remote_version: rem_item.version,
                            mtime: rem_item.mtime,
                            size: rem_item.size,
                            deleted: false,
                            synced_at: Self::now_secs(),
                        };
                        self.state.put_entry(&entry)?;
                        continue;
                    }

                    let abs_path = self.vault_root.join(&rem_path);
                    let local_str = fs::read_to_string(&abs_path).unwrap_or_default();
                    let remote_str = String::from_utf8_lossy(&remote_bytes).to_string();

                    // If markdown, attempt diff3 text merge
                    if rem_path.ends_with(".md") {
                        let base_str = base
                            .and_then(|b| {
                                if b.remote_hash.is_empty() {
                                    None
                                } else {
                                    client.get_blob(&b.remote_hash).ok().and_then(|blob| {
                                        let raw = if let Some(ref key) = e2ee_key {
                                            decrypt_payload(key, &blob).ok()
                                        } else {
                                            Some(blob)
                                        };
                                        raw.map(|bytes| String::from_utf8_lossy(&bytes).to_string())
                                    })
                                }
                            })
                            .unwrap_or_default();

                        match diff3_merge(&base_str, &local_str, &remote_str) {
                            MergeResult::Clean(merged_content) => {
                                // Clean automatic merge!
                                fs::write(&abs_path, merged_content.as_bytes())
                                    .map_err(|e| e.to_string())?;

                                let (m_hash, m_size, m_mtime) = Self::compute_file_hash(&abs_path)?;
                                // Upload merged blob and push
                                let payload = if let Some(ref key) = e2ee_key {
                                    encrypt_payload(key, merged_content.as_bytes())?
                                } else {
                                    merged_content.into_bytes()
                                };
                                client.put_blob(&payload)?;

                                let pr = client.push(
                                    &config.vault_id,
                                    vec![PushChangeItem {
                                        path: rem_path.clone(),
                                        hash: m_hash.clone(),
                                        size: m_size,
                                        mtime: m_mtime,
                                        base_version: rem_item.version,
                                        deleted: false,
                                    }],
                                )?;
                                if pr.new_cursor > new_cursor {
                                    new_cursor = pr.new_cursor;
                                }

                                let entry = SyncEntry {
                                    path: rem_path.clone(),
                                    local_hash: m_hash,
                                    remote_hash: rem_item.hash,
                                    remote_version: rem_item.version + 1,
                                    mtime: m_mtime,
                                    size: m_size,
                                    deleted: false,
                                    synced_at: Self::now_secs(),
                                };
                                self.state.put_entry(&entry)?;
                                merged += 1;
                                continue;
                            }
                            MergeResult::Conflict { .. } => {
                                // Overlapping edits: write conflict file
                            }
                        }
                    }

                    // Non-clean merge or binary conflict: keep local, write conflicted copy
                    conflicts += 1;
                    let timestamp = Self::now_secs();
                    let conflict_filename = format!(
                        "{}.sync-conflict-{}-{}.md",
                        rem_path.trim_end_matches(".md"),
                        config.device_name.replace(' ', "_"),
                        timestamp
                    );
                    let conflict_path = self.vault_root.join(&conflict_filename);
                    let _ = fs::write(&conflict_path, &remote_bytes);

                    self.state.record_conflict(
                        &rem_path,
                        base.map(|b| b.local_hash.as_str()).unwrap_or(""),
                        local_hash,
                        &rem_item.hash,
                        &local_str,
                        &remote_str,
                        &conflict_filename,
                    )?;

                    self.state.log(
                        "warn",
                        &format!("Conflict detected in {}", rem_path),
                        Some(&format!("Preserved conflict copy: {}", conflict_filename)),
                    );
                    continue;
                }
            }

            // Normal remote pull
            let abs_path = self.vault_root.join(&rem_path);
            if let Some(parent) = abs_path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            fs::write(&abs_path, &remote_bytes).map_err(|e| e.to_string())?;

            let (new_local_hash, new_size, new_mtime) = Self::compute_file_hash(&abs_path)?;
            let entry = SyncEntry {
                path: rem_path,
                local_hash: new_local_hash,
                remote_hash: rem_item.hash,
                remote_version: rem_item.version,
                mtime: new_mtime,
                size: new_size,
                deleted: false,
                synced_at: Self::now_secs(),
            };
            self.state.put_entry(&entry)?;
            pulled += 1;
        }

        // 4. Update sync state cursor & timestamp
        let mut updated_config = config;
        updated_config.last_synced_at = Some(Self::now_secs());
        updated_config.last_cursor = new_cursor;
        self.state.save_config(&updated_config)?;

        let summary = SyncSummary {
            pushed,
            pulled,
            merged,
            conflicts,
            deleted_local,
            deleted_remote,
            timestamp: Self::now_secs(),
            error: None,
        };

        self.state.log(
            "info",
            "Sync cycle finished successfully",
            Some(&format!(
                "Pushed: {}, Pulled: {}, Merged: {}, Conflicts: {}",
                pushed, pulled, merged, conflicts
            )),
        );

        Ok(summary)
    }

    /// Upload entire local vault to server as initial setup
    pub fn upload_vault(&self, target_vault_id: &str) -> Result<SyncSummary, String> {
        let mut config = self.state.get_config()?;
        config.vault_id = target_vault_id.to_string();
        config.last_cursor = 0;
        self.state.save_config(&config)?;

        self.state.log("info", "Starting initial vault upload", Some(target_vault_id));
        self.sync()
    }

    /// Download entire vault from server to local directory
    pub fn download_vault(&self, remote_vault_id: &str) -> Result<SyncSummary, String> {
        let mut config = self.state.get_config()?;
        config.vault_id = remote_vault_id.to_string();
        config.last_cursor = 0;
        self.state.save_config(&config)?;

        self.state.log("info", "Starting initial vault download", Some(remote_vault_id));
        self.sync()
    }

    /// Resolve an active conflict
    pub fn resolve_conflict(&self, conflict_id: i64, resolution: &str) -> Result<(), String> {
        let conflicts = self.state.get_unresolved_conflicts()?;
        let conflict = conflicts
            .into_iter()
            .find(|c| c.id == conflict_id)
            .ok_or_else(|| "Conflict not found".to_string())?;

        let abs_path = self.vault_root.join(&conflict.path);
        let conflict_file = self.vault_root.join(&conflict.conflicted_file_path);

        match resolution {
            "local" => {
                // Keep local content, delete conflicted file
                if conflict_file.exists() {
                    let _ = fs::remove_file(conflict_file);
                }
            }
            "remote" => {
                // Overwrite local with remote content, delete conflicted file
                fs::write(&abs_path, conflict.remote_content.as_bytes())
                    .map_err(|e| e.to_string())?;
                if conflict_file.exists() {
                    let _ = fs::remove_file(conflict_file);
                }
            }
            "keep_both" => {
                // Leave conflicted file on disk
            }
            _ => return Err("Invalid resolution choice: use 'local', 'remote', or 'keep_both'".to_string()),
        }

        self.state.resolve_conflict(conflict_id)?;
        self.state.log(
            "info",
            &format!("Resolved conflict for {}", conflict.path),
            Some(&format!("Action: {}", resolution)),
        );

        Ok(())
    }
}
