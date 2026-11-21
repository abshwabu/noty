use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

pub mod db;
pub mod search;
use db::{BacklinksResult, GraphData, HeadingItem, MetadataIndex, OutgoingLinkItem, TagCountItem};
pub use search::{
    FileSearchResult, GlobalReplaceRequest, GlobalReplaceResult, ReplacePreviewItem,
    SearchMatchItem, SearchOptions, SearchResponse,
};

pub const APP_CONFIG_DIR_NAME: &str = ".noty";
pub const TRASH_DIR_NAME: &str = ".trash";
pub const OBSIDIAN_DIR_NAME: &str = ".obsidian";
pub const TRASH_MANIFEST_FILE: &str = ".manifest.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultInfo {
    pub name: String,
    pub path: String,
    pub has_obsidian: bool,
    pub obsidian_hints: Option<ObsidianHints>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ObsidianHints {
    pub attachment_folder: Option<String>,
    pub new_file_location: Option<String>,
    pub theme: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentVault {
    pub path: String,
    pub name: String,
    pub last_opened: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileNode {
    pub id: String,
    pub name: String,
    pub path: String,
    pub relative_path: String,
    pub is_dir: bool,
    pub extension: Option<String>,
    pub size: u64,
    pub modified_at: u64,
    pub children: Option<Vec<FileNode>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrashItem {
    pub id: String,
    pub original_relative_path: String,
    pub trash_filename: String,
    pub deleted_at: u64,
    pub is_dir: bool,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct TrashManifest {
    pub items: Vec<TrashItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileChangeEvent {
    pub event_type: String, // "create", "modify", "delete", "rename"
    pub path: String,
    pub relative_path: String,
    pub is_dir: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LineEnding {
    Lf,
    Crlf,
}

pub struct VaultManager {
    pub current_vault: Mutex<Option<PathBuf>>,
    pub recent_vaults_file: PathBuf,
    pub own_writes: Arc<Mutex<HashMap<PathBuf, Instant>>>,
    pub index: Arc<Mutex<Option<MetadataIndex>>>,
}

impl VaultManager {
    pub fn new(recent_vaults_file: PathBuf) -> Self {
        Self {
            current_vault: Mutex::new(None),
            recent_vaults_file,
            own_writes: Arc::new(Mutex::new(HashMap::new())),
            index: Arc::new(Mutex::new(None)),
        }
    }

    pub fn mark_own_write(&self, path: &Path) {
        if let Ok(mut writes) = self.own_writes.lock() {
            let canonical = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
            writes.insert(canonical, Instant::now());
        }
    }

    pub fn is_own_write(&self, path: &Path, window: Duration) -> bool {
        if let Ok(mut writes) = self.own_writes.lock() {
            // Clean up old entries older than 5 seconds
            let now = Instant::now();
            writes.retain(|_, timestamp| now.duration_since(*timestamp) < Duration::from_secs(5));

            let canonical = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
            if let Some(timestamp) = writes.get(&canonical) {
                if now.duration_since(*timestamp) <= window {
                    return true;
                }
            }
        }
        false
    }

    pub fn get_current_vault_path(&self) -> Result<PathBuf, String> {
        let lock = self.current_vault.lock().map_err(|e| e.to_string())?;
        lock.clone().ok_or_else(|| "No vault currently open".to_string())
    }

    pub fn set_current_vault(&self, path: PathBuf) -> Result<VaultInfo, String> {
        if !path.exists() {
            fs::create_dir_all(&path).map_err(|e| format!("Failed to create vault directory: {}", e))?;
        }

        let canonical_path = path
            .canonicalize()
            .map_err(|e| format!("Invalid vault path: {}", e))?;

        // Initialize .noty directory and default configs if not present
        let config_dir = canonical_path.join(APP_CONFIG_DIR_NAME);
        if !config_dir.exists() {
            fs::create_dir_all(&config_dir).map_err(|e| format!("Failed to create .noty config dir: {}", e))?;
        }
        let workspace_file = config_dir.join("workspace.json");
        if !workspace_file.exists() {
            let default_workspace = serde_json::json!({
                "collapsed_folders": [],
                "active_file": null,
                "sort_by": "name-asc"
            });
            let _ = fs::write(&workspace_file, serde_json::to_string_pretty(&default_workspace).unwrap());
        }

        // Initialize .trash directory
        let trash_dir = canonical_path.join(TRASH_DIR_NAME);
        if !trash_dir.exists() {
            let _ = fs::create_dir_all(&trash_dir);
        }

        // Check for Obsidian vault hints
        let obsidian_dir = canonical_path.join(OBSIDIAN_DIR_NAME);
        let has_obsidian = obsidian_dir.exists();
        let obsidian_hints = if has_obsidian {
            Some(Self::parse_obsidian_hints(&obsidian_dir))
        } else {
            None
        };

        let vault_name = canonical_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Vault")
            .to_string();

        let info = VaultInfo {
            name: vault_name.clone(),
            path: canonical_path.to_string_lossy().to_string(),
            has_obsidian,
            obsidian_hints,
        };

        {
            let mut lock = self.current_vault.lock().map_err(|e| e.to_string())?;
            *lock = Some(canonical_path.clone());
        }

        // Initialize SQLite metadata index
        if let Ok(index) = MetadataIndex::new(&canonical_path) {
            let _ = index.index_all_files(&canonical_path);
            if let Ok(mut idx_lock) = self.index.lock() {
                *idx_lock = Some(index);
            }
        }

        // Add to recent vaults
        let _ = self.add_recent_vault(&info.path, &info.name);

        Ok(info)
    }

    fn parse_obsidian_hints(obsidian_dir: &Path) -> ObsidianHints {
        let mut hints = ObsidianHints::default();
        let app_json = obsidian_dir.join("app.json");
        if let Ok(content) = fs::read_to_string(app_json) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(folder) = val.get("attachmentFolderPath").and_then(|v| v.as_str()) {
                    hints.attachment_folder = Some(folder.to_string());
                }
                if let Some(loc) = val.get("newFileLocation").and_then(|v| v.as_str()) {
                    hints.new_file_location = Some(loc.to_string());
                }
            }
        }
        let appearance_json = obsidian_dir.join("appearance.json");
        if let Ok(content) = fs::read_to_string(appearance_json) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(theme) = val.get("baseTheme").and_then(|v| v.as_str()) {
                    hints.theme = Some(theme.to_string());
                }
            }
        }
        hints
    }

    // --- Recent Vaults ---

    pub fn load_recent_vaults(&self) -> Vec<RecentVault> {
        if let Ok(content) = fs::read_to_string(&self.recent_vaults_file) {
            if let Ok(vaults) = serde_json::from_str::<Vec<RecentVault>>(&content) {
                return vaults;
            }
        }
        Vec::new()
    }

    pub fn add_recent_vault(&self, path: &str, name: &str) -> Result<(), String> {
        let mut vaults = self.load_recent_vaults();
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        vaults.retain(|v| v.path != path);
        vaults.insert(
            0,
            RecentVault {
                path: path.to_string(),
                name: name.to_string(),
                last_opened: now,
            },
        );

        if vaults.len() > 10 {
            vaults.truncate(10);
        }

        if let Some(parent) = self.recent_vaults_file.parent() {
            let _ = fs::create_dir_all(parent);
        }

        let json = serde_json::to_string_pretty(&vaults).map_err(|e| e.to_string())?;
        fs::write(&self.recent_vaults_file, json).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn remove_recent_vault(&self, path: &str) -> Result<(), String> {
        let mut vaults = self.load_recent_vaults();
        vaults.retain(|v| v.path != path);
        let json = serde_json::to_string_pretty(&vaults).map_err(|e| e.to_string())?;
        fs::write(&self.recent_vaults_file, json).map_err(|e| e.to_string())?;
        Ok(())
    }

    // --- Tree listing ---

    pub fn list_tree(&self) -> Result<Vec<FileNode>, String> {
        let vault_path = self.get_current_vault_path()?;
        Self::scan_directory(&vault_path, &vault_path)
    }

    fn scan_directory(vault_root: &Path, current_dir: &Path) -> Result<Vec<FileNode>, String> {
        let mut nodes = Vec::new();
        let entries = match fs::read_dir(current_dir) {
            Ok(e) => e,
            Err(err) => return Err(format!("Failed to read directory {:?}: {}", current_dir, err)),
        };

        for entry_res in entries {
            let entry = match entry_res {
                Ok(e) => e,
                Err(_) => continue,
            };

            let path = entry.path();
            let file_name = entry.file_name().to_string_lossy().to_string();

            // Skip hidden files/directories (.noty, .trash, .git, .obsidian, .tmp_*, etc.)
            if file_name.starts_with('.') {
                continue;
            }

            let metadata = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };

            let is_dir = metadata.is_dir();
            let relative_path = path
                .strip_prefix(vault_root)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");

            let extension = if is_dir {
                None
            } else {
                path.extension().map(|e| e.to_string_lossy().to_string())
            };

            let modified_at = metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);

            let children = if is_dir {
                Some(Self::scan_directory(vault_root, &path)?)
            } else {
                None
            };

            nodes.push(FileNode {
                id: relative_path.clone(),
                name: file_name,
                path: path.to_string_lossy().to_string(),
                relative_path,
                is_dir,
                extension,
                size: metadata.len(),
                modified_at,
                children,
            });
        }

        // Sort: directories first, then alphabetical case-insensitive
        nodes.sort_by(|a, b| {
            if a.is_dir != b.is_dir {
                b.is_dir.cmp(&a.is_dir)
            } else {
                a.name.to_lowercase().cmp(&b.name.to_lowercase())
            }
        });

        Ok(nodes)
    }

    // --- File Operations with Atomic Write & Line Ending Preservation ---

    pub fn resolve_relative_path(&self, relative_path: &str) -> Result<PathBuf, String> {
        let vault_path = self.get_current_vault_path()?;
        let clean = relative_path.trim_start_matches(['/', '\\']);
        let full_path = vault_path.join(clean);

        // Security check: ensure path is within vault
        if let Ok(canon) = full_path.canonicalize() {
            if !canon.starts_with(&vault_path) {
                return Err("Path escapes vault root".to_string());
            }
        }

        Ok(full_path)
    }

    pub fn read_file(&self, relative_path: &str) -> Result<String, String> {
        let full_path = self.resolve_relative_path(relative_path)?;
        if !full_path.exists() {
            return Err(format!("File does not exist: {}", relative_path));
        }

        let mut file = File::open(&full_path).map_err(|e| format!("Failed to open file: {}", e))?;
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)
            .map_err(|e| format!("Failed to read file: {}", e))?;

        String::from_utf8(buffer).map_err(|e| format!("File is not valid UTF-8: {}", e))
    }

    pub fn detect_line_ending(content: &[u8]) -> LineEnding {
        for window in content.windows(2) {
            if window == b"\r\n" {
                return LineEnding::Crlf;
            }
        }
        LineEnding::Lf
    }

    pub fn format_with_line_ending(text: &str, line_ending: LineEnding) -> String {
        let normalized = text.replace("\r\n", "\n");
        match line_ending {
            LineEnding::Lf => normalized,
            LineEnding::Crlf => normalized.replace('\n', "\r\n"),
        }
    }

    pub fn write_file_atomic(&self, relative_path: &str, content: &str) -> Result<(), String> {
        let target_path = self.resolve_relative_path(relative_path)?;
        let parent = target_path
            .parent()
            .ok_or_else(|| "Invalid target file path".to_string())?;

        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent directories: {}", e))?;
        }

        // Line ending detection
        let line_ending = if target_path.exists() {
            if let Ok(existing_bytes) = fs::read(&target_path) {
                Self::detect_line_ending(&existing_bytes)
            } else {
                LineEnding::Lf
            }
        } else if content.contains("\r\n") {
            LineEnding::Crlf
        } else {
            LineEnding::Lf
        };

        let formatted_content = Self::format_with_line_ending(content, line_ending);

        // Atomic write: temp file in the same directory, sync, then rename
        let filename = target_path
            .file_name()
            .and_then(|f| f.to_str())
            .unwrap_or("temp");
        let now_millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        let temp_path = parent.join(format!(".tmp_{}_{}", filename, now_millis));

        {
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temp_path)
                .map_err(|e| format!("Failed to create temporary file: {}", e))?;

            file.write_all(formatted_content.as_bytes())
                .map_err(|e| format!("Failed to write content to temp file: {}", e))?;

            file.sync_all()
                .map_err(|e| format!("Failed to sync temporary file: {}", e))?;
        }

        // Mark own write before rename so watcher ignores upcoming filesystem event
        self.mark_own_write(&target_path);

        fs::rename(&temp_path, &target_path).map_err(|e| {
            let _ = fs::remove_file(&temp_path);
            format!("Failed to rename temp file to destination: {}", e)
        })?;

        // Also mark canonical path after write
        self.mark_own_write(&target_path);

        if relative_path.ends_with(".md") {
            if let Ok(lock) = self.index.lock() {
                if let Some(index) = lock.as_ref() {
                    let now = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs() as i64;
                    let _ = index.index_file(relative_path, &formatted_content, now);
                }
            }
        }

        Ok(())
    }

    pub fn write_file_binary(&self, relative_path: &str, data: &[u8]) -> Result<(), String> {
        let target_path = self.resolve_relative_path(relative_path)?;
        let parent = target_path
            .parent()
            .ok_or_else(|| "Invalid target file path".to_string())?;

        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent directories: {}", e))?;
        }

        let filename = target_path
            .file_name()
            .and_then(|f| f.to_str())
            .unwrap_or("temp");
        let now_millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        let temp_path = parent.join(format!(".tmp_{}_{}", filename, now_millis));

        {
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temp_path)
                .map_err(|e| format!("Failed to create temporary file: {}", e))?;

            file.write_all(data)
                .map_err(|e| format!("Failed to write binary content to temp file: {}", e))?;

            file.sync_all()
                .map_err(|e| format!("Failed to sync temporary file: {}", e))?;
        }

        self.mark_own_write(&target_path);

        fs::rename(&temp_path, &target_path).map_err(|e| {
            let _ = fs::remove_file(&temp_path);
            format!("Failed to rename temp file to destination: {}", e)
        })?;

        self.mark_own_write(&target_path);

        Ok(())
    }

    pub fn create_file(&self, relative_path: &str, initial_content: Option<&str>) -> Result<String, String> {
        let full_path = self.resolve_relative_path(relative_path)?;
        if full_path.exists() {
            return Err(format!("File already exists: {}", relative_path));
        }

        let content = initial_content.unwrap_or("");
        self.write_file_atomic(relative_path, content)?;
        Ok(relative_path.to_string())
    }

    pub fn create_folder(&self, relative_path: &str) -> Result<String, String> {
        let full_path = self.resolve_relative_path(relative_path)?;
        if full_path.exists() {
            return Err(format!("Directory already exists: {}", relative_path));
        }

        self.mark_own_write(&full_path);
        fs::create_dir_all(&full_path).map_err(|e| format!("Failed to create directory: {}", e))?;
        self.mark_own_write(&full_path);

        Ok(relative_path.to_string())
    }

    pub fn rename_item(&self, old_relative_path: &str, new_relative_path: &str) -> Result<(), String> {
        let old_path = self.resolve_relative_path(old_relative_path)?;
        let new_path = self.resolve_relative_path(new_relative_path)?;

        if !old_path.exists() {
            return Err(format!("Source does not exist: {}", old_relative_path));
        }
        if new_path.exists() {
            return Err(format!("Destination already exists: {}", new_relative_path));
        }

        if let Some(parent) = new_path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent directory: {}", e))?;
            }
        }

        self.mark_own_write(&old_path);
        self.mark_own_write(&new_path);

        fs::rename(&old_path, &new_path).map_err(|e| format!("Failed to rename: {}", e))?;

        self.mark_own_write(&new_path);

        if old_relative_path.ends_with(".md") {
            let _ = self.update_links_on_rename(old_relative_path, new_relative_path);
        }

        Ok(())
    }

    pub fn move_item(&self, source_relative_path: &str, target_folder_relative_path: &str) -> Result<String, String> {
        let source_path = self.resolve_relative_path(source_relative_path)?;
        if !source_path.exists() {
            return Err(format!("Source does not exist: {}", source_relative_path));
        }

        let item_name = source_path
            .file_name()
            .ok_or_else(|| "Invalid source name".to_string())?;

        let target_folder_path = if target_folder_relative_path.trim().is_empty() {
            self.get_current_vault_path()?
        } else {
            self.resolve_relative_path(target_folder_relative_path)?
        };

        if !target_folder_path.exists() || !target_folder_path.is_dir() {
            return Err(format!("Target folder is invalid: {}", target_folder_relative_path));
        }

        let dest_path = target_folder_path.join(item_name);
        if dest_path.exists() {
            return Err("An item with the same name already exists in target folder".to_string());
        }

        self.mark_own_write(&source_path);
        self.mark_own_write(&dest_path);

        fs::rename(&source_path, &dest_path).map_err(|e| format!("Failed to move item: {}", e))?;

        self.mark_own_write(&dest_path);

        let vault_path = self.get_current_vault_path()?;
        let new_rel = dest_path
            .strip_prefix(vault_path)
            .unwrap_or(&dest_path)
            .to_string_lossy()
            .replace('\\', "/");

        if source_relative_path.ends_with(".md") {
            let _ = self.update_links_on_rename(source_relative_path, &new_rel);
        }

        Ok(new_rel)
    }

    // --- Trash (.trash folder, restorable) ---

    pub fn delete_to_trash(&self, relative_path: &str) -> Result<TrashItem, String> {
        let source_path = self.resolve_relative_path(relative_path)?;
        if !source_path.exists() {
            return Err(format!("Item to delete does not exist: {}", relative_path));
        }

        let vault_root = self.get_current_vault_path()?;
        let trash_dir = vault_root.join(TRASH_DIR_NAME);
        if !trash_dir.exists() {
            fs::create_dir_all(&trash_dir).map_err(|e| format!("Failed to create trash folder: {}", e))?;
        }

        let metadata = fs::metadata(&source_path).map_err(|e| e.to_string())?;
        let is_dir = metadata.is_dir();
        let size = metadata.len();

        let filename = source_path
            .file_name()
            .and_then(|f| f.to_str())
            .unwrap_or("item");
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let trash_filename = format!("{}_{}", timestamp, filename);
        let trash_dest = trash_dir.join(&trash_filename);

        self.mark_own_write(&source_path);
        self.mark_own_write(&trash_dest);

        fs::rename(&source_path, &trash_dest).map_err(|e| format!("Failed to move item to trash: {}", e))?;

        let trash_item = TrashItem {
            id: trash_filename.clone(),
            original_relative_path: relative_path.to_string(),
            trash_filename,
            deleted_at: timestamp,
            is_dir,
            size,
        };

        // Update manifest
        let manifest_path = trash_dir.join(TRASH_MANIFEST_FILE);
        let mut manifest = Self::read_trash_manifest(&manifest_path);
        manifest.items.push(trash_item.clone());
        Self::write_trash_manifest(&manifest_path, &manifest)?;

        if let Ok(lock) = self.index.lock() {
            if let Some(index) = lock.as_ref() {
                let _ = index.delete_file(relative_path);
            }
        }

        Ok(trash_item)
    }

    fn read_trash_manifest(path: &Path) -> TrashManifest {
        if let Ok(content) = fs::read_to_string(path) {
            if let Ok(manifest) = serde_json::from_str::<TrashManifest>(&content) {
                return manifest;
            }
        }
        TrashManifest::default()
    }

    fn write_trash_manifest(path: &Path, manifest: &TrashManifest) -> Result<(), String> {
        let json = serde_json::to_string_pretty(manifest).map_err(|e| e.to_string())?;
        fs::write(path, json).map_err(|e| format!("Failed to write trash manifest: {}", e))
    }

    pub fn list_trash(&self) -> Result<Vec<TrashItem>, String> {
        let vault_root = self.get_current_vault_path()?;
        let trash_dir = vault_root.join(TRASH_DIR_NAME);
        let manifest_path = trash_dir.join(TRASH_MANIFEST_FILE);
        let manifest = Self::read_trash_manifest(&manifest_path);
        Ok(manifest.items)
    }

    pub fn restore_trash_item(&self, item_id: &str) -> Result<String, String> {
        let vault_root = self.get_current_vault_path()?;
        let trash_dir = vault_root.join(TRASH_DIR_NAME);
        let manifest_path = trash_dir.join(TRASH_MANIFEST_FILE);
        let mut manifest = Self::read_trash_manifest(&manifest_path);

        let item_idx = manifest
            .items
            .iter()
            .position(|i| i.id == item_id)
            .ok_or_else(|| format!("Trash item with id '{}' not found", item_id))?;

        let item = manifest.items.remove(item_idx);
        let trash_source = trash_dir.join(&item.trash_filename);
        if !trash_source.exists() {
            Self::write_trash_manifest(&manifest_path, &manifest)?;
            return Err("Trash file not found on disk".to_string());
        }

        let mut target_dest = vault_root.join(&item.original_relative_path);
        // If file already exists, generate non-colliding name
        if target_dest.exists() {
            let stem = target_dest
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("restored");
            let ext = target_dest
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| format!(".{}", e))
                .unwrap_or_default();
            let parent = target_dest.parent().unwrap_or(&vault_root);
            target_dest = parent.join(format!("{}_restored_{}{}", stem, item.deleted_at, ext));
        }

        if let Some(parent) = target_dest.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent).map_err(|e| format!("Failed to recreate parent directory: {}", e))?;
            }
        }

        self.mark_own_write(&trash_source);
        self.mark_own_write(&target_dest);

        fs::rename(&trash_source, &target_dest).map_err(|e| format!("Failed to restore item: {}", e))?;

        Self::write_trash_manifest(&manifest_path, &manifest)?;

        let restored_rel = target_dest
            .strip_prefix(&vault_root)
            .unwrap_or(&target_dest)
            .to_string_lossy()
            .replace('\\', "/");

        Ok(restored_rel)
    }

    pub fn empty_trash(&self) -> Result<(), String> {
        let vault_root = self.get_current_vault_path()?;
        let trash_dir = vault_root.join(TRASH_DIR_NAME);
        if trash_dir.exists() {
            if let Ok(entries) = fs::read_dir(&trash_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() {
                        let _ = fs::remove_file(path);
                    } else if path.is_dir() {
                        let _ = fs::remove_dir_all(path);
                    }
                }
            }
        }
        let manifest_path = trash_dir.join(TRASH_MANIFEST_FILE);
        let _ = Self::write_trash_manifest(&manifest_path, &TrashManifest::default());
        Ok(())
    }

    // --- App Config (.noty/) ---

    pub fn read_config(&self, config_name: &str) -> Result<Option<String>, String> {
        let vault_root = self.get_current_vault_path()?;
        let file_name = if config_name.ends_with(".json") {
            config_name.to_string()
        } else {
            format!("{}.json", config_name)
        };
        let config_path = vault_root.join(APP_CONFIG_DIR_NAME).join(file_name);
        if !config_path.exists() {
            return Ok(None);
        }
        let content = fs::read_to_string(config_path).map_err(|e| e.to_string())?;
        Ok(Some(content))
    }

    pub fn write_config(&self, config_name: &str, content: &str) -> Result<(), String> {
        let vault_root = self.get_current_vault_path()?;
        let config_dir = vault_root.join(APP_CONFIG_DIR_NAME);
        if !config_dir.exists() {
            fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
        }
        let file_name = if config_name.ends_with(".json") {
            config_name.to_string()
        } else {
            format!("{}.json", config_name)
        };
        let config_path = config_dir.join(file_name);
        self.mark_own_write(&config_path);
        fs::write(config_path, content).map_err(|e| e.to_string())?;
        Ok(())
    }

    // --- CSS Snippets (.<appname>/snippets/) ---

    pub fn list_snippets(&self) -> Result<Vec<String>, String> {
        let vault_root = self.get_current_vault_path()?;
        let snippets_dir = vault_root.join(APP_CONFIG_DIR_NAME).join("snippets");
        if !snippets_dir.exists() {
            let _ = fs::create_dir_all(&snippets_dir);
            return Ok(Vec::new());
        }

        let mut snippets = Vec::new();
        if let Ok(entries) = fs::read_dir(&snippets_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(ext) = path.extension() {
                        if ext == "css" {
                            if let Some(name) = path.file_stem().and_then(|s| s.to_str()) {
                                snippets.push(name.to_string());
                            }
                        }
                    }
                }
            }
        }
        snippets.sort();
        Ok(snippets)
    }

    pub fn read_snippet(&self, snippet_name: &str) -> Result<String, String> {
        let vault_root = self.get_current_vault_path()?;
        let clean = snippet_name.trim_end_matches(".css");
        let path = vault_root.join(APP_CONFIG_DIR_NAME).join("snippets").join(format!("{}.css", clean));
        if !path.exists() {
            return Err(format!("Snippet {} not found", snippet_name));
        }
        fs::read_to_string(path).map_err(|e| e.to_string())
    }

    pub fn write_snippet(&self, snippet_name: &str, content: &str) -> Result<(), String> {
        let vault_root = self.get_current_vault_path()?;
        let snippets_dir = vault_root.join(APP_CONFIG_DIR_NAME).join("snippets");
        if !snippets_dir.exists() {
            fs::create_dir_all(&snippets_dir).map_err(|e| e.to_string())?;
        }
        let clean = snippet_name.trim_end_matches(".css");
        let path = snippets_dir.join(format!("{}.css", clean));
        self.mark_own_write(&path);
        fs::write(path, content).map_err(|e| e.to_string())?;
        Ok(())
    }

    // --- Metadata Index & Links ---

    pub fn update_links_on_rename(&self, old_rel: &str, new_rel: &str) -> Result<usize, String> {
        let vault_path = self.get_current_vault_path()?;
        let tree = self.list_tree().unwrap_or_default();
        let mut total_updated = 0;

        fn collect_md_paths(nodes: &[FileNode], acc: &mut Vec<String>) {
            for node in nodes {
                if node.is_dir {
                    if let Some(children) = &node.children {
                        collect_md_paths(children, acc);
                    }
                } else if node.relative_path.ends_with(".md") {
                    acc.push(node.relative_path.clone());
                }
            }
        }

        let mut md_paths = Vec::new();
        collect_md_paths(&tree, &mut md_paths);

        for path in md_paths {
            if path == old_rel {
                continue;
            }
            if let Ok(content) = self.read_file(&path) {
                let (updated_content, count) = db::update_links_in_markdown(&content, old_rel, new_rel);
                if count > 0 {
                    let _ = self.write_file_atomic(&path, &updated_content);
                    total_updated += count;
                }
            }
        }

        if let Ok(lock) = self.index.lock() {
            if let Some(index) = lock.as_ref() {
                let _ = index.delete_file(old_rel);
                let full = vault_path.join(new_rel);
                if let Ok(content) = fs::read_to_string(&full) {
                    let now = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs() as i64;
                    let _ = index.index_file(new_rel, &content, now);
                }
            }
        }

        Ok(total_updated)
    }

    pub fn get_backlinks(&self, relative_path: &str) -> Result<BacklinksResult, String> {
        let vault_path = self.get_current_vault_path()?;
        let lock = self.index.lock().map_err(|e| e.to_string())?;
        let index = lock.as_ref().ok_or_else(|| "Metadata index not initialized".to_string())?;
        index.get_backlinks(relative_path, &vault_path)
    }

    pub fn get_outgoing_links(&self, relative_path: &str) -> Result<Vec<OutgoingLinkItem>, String> {
        let vault_path = self.get_current_vault_path()?;
        let lock = self.index.lock().map_err(|e| e.to_string())?;
        let index = lock.as_ref().ok_or_else(|| "Metadata index not initialized".to_string())?;
        index.get_outgoing_links(relative_path, &vault_path)
    }

    pub fn get_tags(&self) -> Result<Vec<TagCountItem>, String> {
        let lock = self.index.lock().map_err(|e| e.to_string())?;
        let index = lock.as_ref().ok_or_else(|| "Metadata index not initialized".to_string())?;
        index.get_tags()
    }

    pub fn get_outline(&self, relative_path: &str) -> Result<Vec<HeadingItem>, String> {
        let lock = self.index.lock().map_err(|e| e.to_string())?;
        let index = lock.as_ref().ok_or_else(|| "Metadata index not initialized".to_string())?;
        index.get_outline(relative_path)
    }

    pub fn get_graph_data(&self) -> Result<GraphData, String> {
        let lock = self.index.lock().map_err(|e| e.to_string())?;
        let index = lock.as_ref().ok_or_else(|| "Metadata index not initialized".to_string())?;
        index.get_graph_data()
    }

    pub fn index_file_from_disk(&self, relative_path: &str) -> Result<(), String> {
        let full = self.resolve_relative_path(relative_path)?;
        if !full.exists() {
            return Ok(());
        }
        let content = fs::read_to_string(&full).map_err(|e| e.to_string())?;
        let mtime = fs::metadata(&full)
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        let lock = self.index.lock().map_err(|e| e.to_string())?;
        if let Some(index) = lock.as_ref() {
            index.index_file(relative_path, &content, mtime)?;
        }
        Ok(())
    }

    pub fn delete_from_index(&self, relative_path: &str) -> Result<(), String> {
        let lock = self.index.lock().map_err(|e| e.to_string())?;
        if let Some(index) = lock.as_ref() {
            index.delete_file(relative_path)?;
        }
        Ok(())
    }

    // --- Search & Global Replace ---

    pub fn search(&self, raw_query: &str, options: &SearchOptions) -> Result<SearchResponse, String> {
        let vault_path = self.get_current_vault_path()?;
        let lock = self.index.lock().map_err(|e| e.to_string())?;
        let index = lock.as_ref().ok_or_else(|| "Metadata index not initialized".to_string())?;
        index.search(&vault_path, raw_query, options)
    }

    pub fn preview_global_replace(&self, request: &GlobalReplaceRequest) -> Result<Vec<ReplacePreviewItem>, String> {
        let vault_path = self.get_current_vault_path()?;
        search::preview_global_replace(&vault_path, request)
    }

    pub fn execute_global_replace(&self, request: &GlobalReplaceRequest) -> Result<GlobalReplaceResult, String> {
        let previews = self.preview_global_replace(request)?;
        let mut files_to_update: std::collections::HashSet<String> = std::collections::HashSet::new();
        for item in &previews {
            files_to_update.insert(item.file_path.clone());
        }

        let regex_matcher = if request.regex {
            Some(regex::Regex::new(&request.search_query).map_err(|e| format!("Invalid regex: {}", e))?)
        } else {
            None
        };

        let mut occurrences = 0;
        let mut modified_count = 0;

        for file_rel in files_to_update {
            if let Ok(content) = self.read_file(&file_rel) {
                let replaced = if let Some(ref re) = regex_matcher {
                    let c = re.find_iter(&content).count();
                    occurrences += c;
                    re.replace_all(&content, request.replacement.as_str()).to_string()
                } else if request.case_sensitive {
                    let c = content.matches(&request.search_query).count();
                    occurrences += c;
                    content.replace(&request.search_query, &request.replacement)
                } else {
                    if let Ok(re_ci) = regex::Regex::new(&format!("(?i){}", regex::escape(&request.search_query))) {
                        let c = re_ci.find_iter(&content).count();
                        occurrences += c;
                        re_ci.replace_all(&content, request.replacement.as_str()).to_string()
                    } else {
                        let c = content.to_lowercase().matches(&request.search_query.to_lowercase()).count();
                        occurrences += c;
                        content.replace(&request.search_query, &request.replacement)
                    }
                };

                if replaced != content {
                    self.write_file_atomic(&file_rel, &replaced)?;
                    modified_count += 1;
                }
            }
        }

        Ok(GlobalReplaceResult {
            files_modified: modified_count,
            occurrences_replaced: occurrences,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_vault_init_and_config() {
        let temp_dir = tempdir().unwrap();
        let vault_dir = temp_dir.path().join("my_vault");
        let recent_file = temp_dir.path().join("recents.json");

        let manager = VaultManager::new(recent_file.clone());
        let info = manager.set_current_vault(vault_dir.clone()).unwrap();

        assert_eq!(info.name, "my_vault");
        assert!(vault_dir.join(APP_CONFIG_DIR_NAME).exists());
        assert!(vault_dir.join(APP_CONFIG_DIR_NAME).join("workspace.json").exists());
        assert!(vault_dir.join(TRASH_DIR_NAME).exists());

        // Test custom config read/write
        manager.write_config("appearance", r#"{"theme":"dark"}"#).unwrap();
        let loaded = manager.read_config("appearance").unwrap();
        assert_eq!(loaded, Some(r#"{"theme":"dark"}"#.to_string()));

        // Test recents
        let recents = manager.load_recent_vaults();
        assert_eq!(recents.len(), 1);
        assert_eq!(recents[0].name, "my_vault");
    }

    #[test]
    fn test_atomic_write_preserves_line_endings_and_utf8() {
        let temp_dir = tempdir().unwrap();
        let vault_dir = temp_dir.path().join("vault");
        let recent_file = temp_dir.path().join("recents.json");

        let manager = VaultManager::new(recent_file);
        manager.set_current_vault(vault_dir.clone()).unwrap();

        // 1. New file with LF
        manager.write_file_atomic("lf_note.md", "# Title\nLine 2\n").unwrap();
        let bytes_lf = fs::read(vault_dir.join("lf_note.md")).unwrap();
        assert_eq!(VaultManager::detect_line_ending(&bytes_lf), LineEnding::Lf);

        // 2. New file with CRLF
        manager.write_file_atomic("crlf_note.md", "# Title\r\nLine 2\r\n").unwrap();
        let bytes_crlf = fs::read(vault_dir.join("crlf_note.md")).unwrap();
        assert_eq!(VaultManager::detect_line_ending(&bytes_crlf), LineEnding::Crlf);

        // 3. Update existing CRLF note with incoming LF text -> should preserve CRLF!
        manager.write_file_atomic("crlf_note.md", "# Title Updated\nNew line\n").unwrap();
        let bytes_updated = fs::read(vault_dir.join("crlf_note.md")).unwrap();
        assert_eq!(VaultManager::detect_line_ending(&bytes_updated), LineEnding::Crlf);

        // 4. Test UTF-8 with international / emoji chars
        let utf8_text = "## 笔记 🚀\nHello world in Amharic: ሰላም ልጆች!\nGerman: schön & groß\n";
        manager.write_file_atomic("unicode.md", utf8_text).unwrap();
        let read_back = manager.read_file("unicode.md").unwrap();
        assert_eq!(read_back, utf8_text);
    }

    #[test]
    fn test_tree_listing_and_nested_ops() {
        let temp_dir = tempdir().unwrap();
        let vault_dir = temp_dir.path().join("vault");
        let recent_file = temp_dir.path().join("recents.json");

        let manager = VaultManager::new(recent_file);
        manager.set_current_vault(vault_dir).unwrap();

        manager.create_folder("Projects/Rust").unwrap();
        manager.create_file("Projects/Rust/noty.md", Some("# Noty")).unwrap();
        manager.create_file("welcome.md", Some("# Welcome")).unwrap();

        let tree = manager.list_tree().unwrap();
        // Hidden directories (.noty, .trash) should NOT be listed
        assert_eq!(tree.len(), 2); // "Projects" folder, "welcome.md" file
        assert!(tree.iter().any(|n| n.name == "Projects" && n.is_dir));
        assert!(tree.iter().any(|n| n.name == "welcome.md" && !n.is_dir));

        let projects_node = tree.iter().find(|n| n.name == "Projects").unwrap();
        assert!(projects_node.children.is_some());
        let rust_children = projects_node.children.as_ref().unwrap();
        assert_eq!(rust_children.len(), 1);
        assert_eq!(rust_children[0].name, "Rust");
    }

    #[test]
    fn test_rename_and_move() {
        let temp_dir = tempdir().unwrap();
        let vault_dir = temp_dir.path().join("vault");
        let recent_file = temp_dir.path().join("recents.json");

        let manager = VaultManager::new(recent_file);
        manager.set_current_vault(vault_dir).unwrap();

        manager.create_folder("FolderA").unwrap();
        manager.create_folder("FolderB").unwrap();
        manager.create_file("FolderA/note.md", Some("Original content")).unwrap();

        // Test rename
        manager.rename_item("FolderA/note.md", "FolderA/renamed.md").unwrap();
        assert!(manager.read_file("FolderA/renamed.md").is_ok());
        assert!(manager.read_file("FolderA/note.md").is_err());

        // Test move into FolderB
        let new_rel = manager.move_item("FolderA/renamed.md", "FolderB").unwrap();
        assert_eq!(new_rel, "FolderB/renamed.md");
        assert!(manager.read_file("FolderB/renamed.md").is_ok());
    }

    #[test]
    fn test_trash_and_restore() {
        let temp_dir = tempdir().unwrap();
        let vault_dir = temp_dir.path().join("vault");
        let recent_file = temp_dir.path().join("recents.json");

        let manager = VaultManager::new(recent_file);
        manager.set_current_vault(vault_dir).unwrap();

        manager.create_folder("Docs").unwrap();
        manager.create_file("Docs/secret.md", Some("my secret")).unwrap();

        // Delete to trash
        let trash_item = manager.delete_to_trash("Docs/secret.md").unwrap();
        assert!(manager.read_file("Docs/secret.md").is_err());

        // List trash
        let trash_list = manager.list_trash().unwrap();
        assert_eq!(trash_list.len(), 1);
        assert_eq!(trash_list[0].id, trash_item.id);

        // Restore
        let restored_path = manager.restore_trash_item(&trash_item.id).unwrap();
        assert_eq!(restored_path, "Docs/secret.md");
        assert_eq!(manager.read_file("Docs/secret.md").unwrap(), "my secret");

        // Empty trash
        manager.delete_to_trash("Docs/secret.md").unwrap();
        manager.empty_trash().unwrap();
        assert!(manager.list_trash().unwrap().is_empty());
    }

    #[test]
    fn test_obsidian_hints() {
        let temp_dir = tempdir().unwrap();
        let vault_dir = temp_dir.path().join("obsidian_vault");
        let obs_dir = vault_dir.join(OBSIDIAN_DIR_NAME);
        fs::create_dir_all(&obs_dir).unwrap();

        fs::write(
            obs_dir.join("app.json"),
            r#"{"attachmentFolderPath":"assets","newFileLocation":"notes"}"#,
        ).unwrap();
        fs::write(
            obs_dir.join("appearance.json"),
            r#"{"baseTheme":"dark"}"#,
        ).unwrap();

        let recent_file = temp_dir.path().join("recents.json");
        let manager = VaultManager::new(recent_file);
        let info = manager.set_current_vault(vault_dir).unwrap();

        assert!(info.has_obsidian);
        let hints = info.obsidian_hints.unwrap();
        assert_eq!(hints.attachment_folder, Some("assets".to_string()));
        assert_eq!(hints.new_file_location, Some("notes".to_string()));
        assert_eq!(hints.theme, Some("dark".to_string()));
    }

    #[test]
    fn test_css_snippets() {
        let temp_dir = tempdir().unwrap();
        let vault_dir = temp_dir.path().join("vault");
        let recent_file = temp_dir.path().join("recents.json");

        let manager = VaultManager::new(recent_file);
        manager.set_current_vault(vault_dir).unwrap();

        // Initially empty
        let initial = manager.list_snippets().unwrap();
        assert!(initial.is_empty());

        // Write snippets
        manager.write_snippet("custom-theme", ".cm-editor { color: red; }").unwrap();
        manager.write_snippet("translucent.css", "body { opacity: 0.95; }").unwrap();

        let list = manager.list_snippets().unwrap();
        assert_eq!(list, vec!["custom-theme".to_string(), "translucent".to_string()]);

        let content = manager.read_snippet("custom-theme").unwrap();
        assert_eq!(content, ".cm-editor { color: red; }");
    }

    #[test]
    fn test_write_file_binary() {
        let temp_dir = tempdir().unwrap();
        let vault_dir = temp_dir.path().join("vault");
        let recent_file = temp_dir.path().join("recents.json");

        let manager = VaultManager::new(recent_file);
        manager.set_current_vault(vault_dir.clone()).unwrap();

        let binary_payload = vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x01];
        manager.write_file_binary("attachments/test_image.png", &binary_payload).unwrap();

        let target_file = vault_dir.join("attachments").join("test_image.png");
        assert!(target_file.exists());
        let read_bytes = fs::read(&target_file).unwrap();
        assert_eq!(read_bytes, binary_payload);
    }

    #[test]
    fn test_metadata_index_and_link_updating() {
        let temp_dir = tempdir().unwrap();
        let vault_dir = temp_dir.path().join("vault");
        let recent_file = temp_dir.path().join("recents.json");

        let manager = VaultManager::new(recent_file);
        manager.set_current_vault(vault_dir.clone()).unwrap();

        // 1. Create Note A with tags and headings
        let note_a_content = r#"---
tags: [rust, tauri]
---
# Main Heading
Some text with #project/mobile.
- [ ] Todo item
Link to [[Note B|Alias B]] and #subtag."#;
        manager.write_file_atomic("Note A.md", note_a_content).unwrap();

        // 2. Create Note B
        let note_b_content = "# Target Note\nThis note will receive backlinks.";
        manager.write_file_atomic("Note B.md", note_b_content).unwrap();

        // Check backlinks for Note B
        let backlinks = manager.get_backlinks("Note B.md").unwrap();
        assert_eq!(backlinks.linked_mentions.len(), 1);
        assert_eq!(backlinks.linked_mentions[0].source_path, "Note A.md");
        assert_eq!(backlinks.linked_mentions[0].alias, Some("Alias B".to_string()));

        // Check tags
        let tags = manager.get_tags().unwrap();
        let tag_names: Vec<String> = tags.iter().map(|t| t.tag.clone()).collect();
        assert!(tag_names.contains(&"rust".to_string()));
        assert!(tag_names.contains(&"tauri".to_string()));
        assert!(tag_names.contains(&"project/mobile".to_string()));

        // Check outline of Note A
        let outline = manager.get_outline("Note A.md").unwrap();
        assert_eq!(outline.len(), 1);
        assert_eq!(outline[0].text, "Main Heading");

        // 3. Rename Note B to Note Renamed.md -> verify link in Note A gets auto-updated
        manager.rename_item("Note B.md", "Note Renamed.md").unwrap();

        let updated_a = manager.read_file("Note A.md").unwrap();
        assert!(updated_a.contains("[[Note Renamed|Alias B]]"));
        assert!(!updated_a.contains("[[Note B|Alias B]]"));
    }

    #[test]
    fn test_search_operators_and_global_replace() {
        let temp_dir = tempdir().unwrap();
        let vault_dir = temp_dir.path().join("vault");
        let recent_file = temp_dir.path().join("recents.json");

        let manager = VaultManager::new(recent_file);
        manager.set_current_vault(vault_dir.clone()).unwrap();

        // Note 1: Project Plan
        let doc1 = r#"---
status: active
tags: [project/app, tauri]
---
# Mobile Architecture
Building an offline-first notes application with Rust and Vue 3.
- [ ] Implement FTS5 search
- [x] Implement canvas graph
We need "blazing speed" for enterprise users."#;
        manager.write_file_atomic("Work/Architecture.md", doc1).unwrap();

        // Note 2: Meeting Notes
        let doc2 = r#"# Weekly Meeting
Discussing release dates and roadmap.
- [ ] Review PRs
Offline-first synchronization design."#;
        manager.write_file_atomic("Meetings/Weekly.md", doc2).unwrap();

        // 1. Search with tag: operator
        let res_tag = manager.search("tag:project/app", &SearchOptions::default()).unwrap();
        assert_eq!(res_tag.results.len(), 1);
        assert_eq!(res_tag.results[0].file_path, "Work/Architecture.md");

        // 2. Search with path: operator
        let res_path = manager.search("path:Meetings", &SearchOptions::default()).unwrap();
        assert_eq!(res_path.results.len(), 1);
        assert_eq!(res_path.results[0].file_path, "Meetings/Weekly.md");

        // 3. Search with task-todo: operator
        let res_task = manager.search("task-todo:FTS5", &SearchOptions::default()).unwrap();
        assert_eq!(res_task.results.len(), 1);
        assert_eq!(res_task.results[0].file_path, "Work/Architecture.md");

        // 4. Search with exact phrase
        let res_phrase = manager.search("\"blazing speed\"", &SearchOptions::default()).unwrap();
        assert_eq!(res_phrase.results.len(), 1);

        // 5. Search with negation -path:Work
        let res_neg = manager.search("Offline-first -path:Work", &SearchOptions::default()).unwrap();
        assert_eq!(res_neg.results.len(), 1);
        assert_eq!(res_neg.results[0].file_path, "Meetings/Weekly.md");

        // 6. Test global replace preview and execution
        let replace_req = GlobalReplaceRequest {
            search_query: "Offline-first".to_string(),
            replacement: "Local-first".to_string(),
            case_sensitive: false,
            regex: false,
            target_paths: None,
        };

        let previews = manager.preview_global_replace(&replace_req).unwrap();
        assert_eq!(previews.len(), 2);

        let replace_res = manager.execute_global_replace(&replace_req).unwrap();
        assert_eq!(replace_res.files_modified, 2);
        assert_eq!(replace_res.occurrences_replaced, 2);

        let updated_doc2 = manager.read_file("Meetings/Weekly.md").unwrap();
        assert!(updated_doc2.contains("Local-first synchronization design."));
        assert!(!updated_doc2.contains("Offline-first synchronization design."));
    }
}
