// Local SQLite sync state manager

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncConfig {
    pub server_url: String,
    pub token: String,
    pub device_id: String,
    pub device_name: String,
    pub vault_id: String,
    pub vault_name: String,
    pub e2ee_passphrase: Option<String>,
    pub auto_sync_minutes: i64, // 0 = disabled
    pub auto_sync_on_open: bool,
    pub excluded_patterns: Vec<String>,
    pub last_synced_at: Option<i64>,
    pub last_cursor: i64,
}

impl Default for SyncConfig {
    fn default() -> Self {
        Self {
            server_url: "http://localhost:8080".to_string(),
            token: "".to_string(),
            device_id: "".to_string(),
            device_name: "Desktop Device".to_string(),
            vault_id: "".to_string(),
            vault_name: "".to_string(),
            e2ee_passphrase: None,
            auto_sync_minutes: 0, // Disabled by default
            auto_sync_on_open: false,
            excluded_patterns: vec![],
            last_synced_at: None,
            last_cursor: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncEntry {
    pub path: String,
    pub local_hash: String,
    pub remote_hash: String,
    pub remote_version: i64,
    pub mtime: i64,
    pub size: i64,
    pub deleted: bool,
    pub synced_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncConflict {
    pub id: i64,
    pub path: String,
    pub base_hash: String,
    pub local_hash: String,
    pub remote_hash: String,
    pub local_content: String,
    pub remote_content: String,
    pub conflicted_file_path: String,
    pub created_at: i64,
    pub resolved: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncLog {
    pub id: i64,
    pub timestamp: i64,
    pub level: String, // "info", "warn", "error"
    pub message: String,
    pub details: Option<String>,
}

#[derive(Clone)]
pub struct SyncStateStore {
    conn: Arc<Mutex<Connection>>,
}

impl SyncStateStore {
    pub fn open<P: AsRef<Path>>(db_path: P) -> Result<Self, String> {
        let parent = db_path.as_ref().parent();
        if let Some(p) = parent {
            let _ = std::fs::create_dir_all(p);
        }

        let conn = Connection::open(db_path)
            .map_err(|e| format!("Failed to open sync state DB: {}", e))?;

        conn.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS sync_config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sync_entries (
                path TEXT PRIMARY KEY,
                local_hash TEXT NOT NULL,
                remote_hash TEXT NOT NULL,
                remote_version INTEGER NOT NULL,
                mtime INTEGER NOT NULL,
                size INTEGER NOT NULL,
                deleted INTEGER NOT NULL DEFAULT 0,
                synced_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sync_conflicts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT NOT NULL,
                base_hash TEXT NOT NULL,
                local_hash TEXT NOT NULL,
                remote_hash TEXT NOT NULL,
                local_content TEXT NOT NULL,
                remote_content TEXT NOT NULL,
                conflicted_file_path TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                resolved INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS sync_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER NOT NULL,
                level TEXT NOT NULL,
                message TEXT NOT NULL,
                details TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_sync_logs_ts ON sync_logs(timestamp DESC);
        "#,
        )
        .map_err(|e| format!("Failed to initialize sync tables: {}", e))?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    pub fn get_config(&self) -> Result<SyncConfig, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT key, value FROM sync_config")
            .map_err(|e| e.to_string())?;

        let mut config = SyncConfig::default();
        let rows = stmt
            .query_map([], |row| {
                let k: String = row.get(0)?;
                let v: String = row.get(1)?;
                Ok((k, v))
            })
            .map_err(|e| e.to_string())?;

        for r in rows.flatten() {
            match r.0.as_str() {
                "server_url" => config.server_url = r.1,
                "token" => config.token = r.1,
                "device_id" => config.device_id = r.1,
                "device_name" => config.device_name = r.1,
                "vault_id" => config.vault_id = r.1,
                "vault_name" => config.vault_name = r.1,
                "e2ee_passphrase" => {
                    config.e2ee_passphrase = if r.1.is_empty() { None } else { Some(r.1) }
                }
                "auto_sync_minutes" => config.auto_sync_minutes = r.1.parse().unwrap_or(0),
                "auto_sync_on_open" => config.auto_sync_on_open = r.1 == "true",
                "excluded_patterns" => {
                    config.excluded_patterns =
                        serde_json::from_str(&r.1).unwrap_or_default()
                }
                "last_synced_at" => config.last_synced_at = r.1.parse().ok(),
                "last_cursor" => config.last_cursor = r.1.parse().unwrap_or(0),
                _ => {}
            }
        }

        Ok(config)
    }

    pub fn save_config(&self, config: &SyncConfig) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        let tx = conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;

        let pairs = [
            ("server_url", config.server_url.clone()),
            ("token", config.token.clone()),
            ("device_id", config.device_id.clone()),
            ("device_name", config.device_name.clone()),
            ("vault_id", config.vault_id.clone()),
            ("vault_name", config.vault_name.clone()),
            (
                "e2ee_passphrase",
                config.e2ee_passphrase.clone().unwrap_or_default(),
            ),
            (
                "auto_sync_minutes",
                config.auto_sync_minutes.to_string(),
            ),
            (
                "auto_sync_on_open",
                if config.auto_sync_on_open {
                    "true".to_string()
                } else {
                    "false".to_string()
                },
            ),
            (
                "excluded_patterns",
                serde_json::to_string(&config.excluded_patterns).unwrap_or_default(),
            ),
            (
                "last_synced_at",
                config.last_synced_at.map(|t| t.to_string()).unwrap_or_default(),
            ),
            ("last_cursor", config.last_cursor.to_string()),
        ];

        for (k, v) in pairs {
            tx.execute(
                "INSERT INTO sync_config (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2",
                params![k, v],
            )
            .map_err(|e| e.to_string())?;
        }

        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_entry(&self, path: &str) -> Result<Option<SyncEntry>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT path, local_hash, remote_hash, remote_version, mtime, size, deleted, synced_at FROM sync_entries WHERE path = ?1")
            .map_err(|e| e.to_string())?;

        let res = stmt.query_row(params![path], |row| {
            let del_int: i64 = row.get(6)?;
            Ok(SyncEntry {
                path: row.get(0)?,
                local_hash: row.get(1)?,
                remote_hash: row.get(2)?,
                remote_version: row.get(3)?,
                mtime: row.get(4)?,
                size: row.get(5)?,
                deleted: del_int == 1,
                synced_at: row.get(7)?,
            })
        });

        match res {
            Ok(entry) => Ok(Some(entry)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn get_all_entries(&self) -> Result<Vec<SyncEntry>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT path, local_hash, remote_hash, remote_version, mtime, size, deleted, synced_at FROM sync_entries")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                let del_int: i64 = row.get(6)?;
                Ok(SyncEntry {
                    path: row.get(0)?,
                    local_hash: row.get(1)?,
                    remote_hash: row.get(2)?,
                    remote_version: row.get(3)?,
                    mtime: row.get(4)?,
                    size: row.get(5)?,
                    deleted: del_int == 1,
                    synced_at: row.get(7)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for r in rows.flatten() {
            list.push(r);
        }
        Ok(list)
    }

    pub fn put_entry(&self, entry: &SyncEntry) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        let del_int = if entry.deleted { 1 } else { 0 };
        conn.execute(
            r#"
            INSERT INTO sync_entries (path, local_hash, remote_hash, remote_version, mtime, size, deleted, synced_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            ON CONFLICT(path) DO UPDATE SET
                local_hash = excluded.local_hash,
                remote_hash = excluded.remote_hash,
                remote_version = excluded.remote_version,
                mtime = excluded.mtime,
                size = excluded.size,
                deleted = excluded.deleted,
                synced_at = excluded.synced_at
            "#,
            params![
                entry.path,
                entry.local_hash,
                entry.remote_hash,
                entry.remote_version,
                entry.mtime,
                entry.size,
                del_int,
                entry.synced_at
            ],
        )
        .map_err(|e| e.to_string())?;

        Ok(())
    }

    pub fn record_conflict(
        &self,
        path: &str,
        base_hash: &str,
        local_hash: &str,
        remote_hash: &str,
        local_content: &str,
        remote_content: &str,
        conflicted_file_path: &str,
    ) -> Result<i64, String> {
        let conn = self.conn.lock().unwrap();
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        conn.execute(
            r#"
            INSERT INTO sync_conflicts (path, base_hash, local_hash, remote_hash, local_content, remote_content, conflicted_file_path, created_at, resolved)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0)
            "#,
            params![
                path,
                base_hash,
                local_hash,
                remote_hash,
                local_content,
                remote_content,
                conflicted_file_path,
                now
            ],
        )
        .map_err(|e| e.to_string())?;

        Ok(conn.last_insert_rowid())
    }

    pub fn get_unresolved_conflicts(&self) -> Result<Vec<SyncConflict>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT id, path, base_hash, local_hash, remote_hash, local_content, remote_content, conflicted_file_path, created_at, resolved FROM sync_conflicts WHERE resolved = 0 ORDER BY created_at DESC")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                let res_int: i64 = row.get(9)?;
                Ok(SyncConflict {
                    id: row.get(0)?,
                    path: row.get(1)?,
                    base_hash: row.get(2)?,
                    local_hash: row.get(3)?,
                    remote_hash: row.get(4)?,
                    local_content: row.get(5)?,
                    remote_content: row.get(6)?,
                    conflicted_file_path: row.get(7)?,
                    created_at: row.get(8)?,
                    resolved: res_int == 1,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for r in rows.flatten() {
            list.push(r);
        }
        Ok(list)
    }

    pub fn resolve_conflict(&self, conflict_id: i64) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE sync_conflicts SET resolved = 1 WHERE id = ?1",
            params![conflict_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn log(&self, level: &str, message: &str, details: Option<&str>) {
        let conn = self.conn.lock().unwrap();
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        let _ = conn.execute(
            "INSERT INTO sync_logs (timestamp, level, message, details) VALUES (?1, ?2, ?3, ?4)",
            params![now, level, message, details],
        );
    }

    pub fn get_recent_logs(&self, limit: usize) -> Result<Vec<SyncLog>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT id, timestamp, level, message, details FROM sync_logs ORDER BY timestamp DESC, id DESC LIMIT ?1")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![limit as i64], |row| {
                Ok(SyncLog {
                    id: row.get(0)?,
                    timestamp: row.get(1)?,
                    level: row.get(2)?,
                    message: row.get(3)?,
                    details: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut logs = Vec::new();
        for r in rows.flatten() {
            logs.push(r);
        }
        Ok(logs)
    }
}
