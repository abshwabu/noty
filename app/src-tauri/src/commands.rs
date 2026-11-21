use crate::vault::db::{BacklinksResult, GraphData, HeadingItem, OutgoingLinkItem, TagCountItem};
use crate::vault::{FileNode, RecentVault, TrashItem, VaultInfo, VaultManager};
use crate::watcher::VaultWatcherController;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

pub struct AppState {
    pub vault_manager: Arc<VaultManager>,
    pub watcher_controller: Arc<Mutex<VaultWatcherController>>,
}

#[tauri::command]
pub async fn vault_pick_folder(app_handle: AppHandle) -> Result<Option<String>, String> {
    #[cfg(target_os = "android")]
    {
        // On Android, return app-private storage by default
        let base_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to get Android app_data_dir: {}", e))?;
        let default_vault = base_dir.join("default_vault");
        let _ = std::fs::create_dir_all(&default_vault);
        return Ok(Some(default_vault.to_string_lossy().to_string()));
    }

    #[cfg(not(target_os = "android"))]
    {
        let selected = app_handle.dialog().file().blocking_pick_folder();
        match selected {
            Some(folder_path) => Ok(Some(folder_path.to_string())),
            None => Ok(None),
        }
    }
}

#[tauri::command]
pub async fn vault_open(
    path: Option<String>,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<VaultInfo, String> {
    let target_path = match path {
        Some(p) if !p.trim().is_empty() => PathBuf::from(p),
        _ => {
            // Default vault path (used on Android or fallback)
            let base_dir = app_handle
                .path()
                .app_data_dir()
                .or_else(|_| app_handle.path().document_dir())
                .unwrap_or_else(|_| PathBuf::from("."));
            let default_vault = base_dir.join("default_vault");
            let _ = std::fs::create_dir_all(&default_vault);
            default_vault
        }
    };

    let vault_info = state.vault_manager.set_current_vault(target_path.clone())?;

    // Start file watcher for the newly opened vault
    if let Ok(mut watcher) = state.watcher_controller.lock() {
        let _ = watcher.start_watching(target_path, state.vault_manager.clone(), app_handle.clone());
    }

    Ok(vault_info)
}

#[tauri::command]
pub async fn vault_create(
    parent_path: Option<String>,
    name: String,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<VaultInfo, String> {
    if name.trim().is_empty() {
        return Err("Vault name cannot be empty".to_string());
    }

    let parent_dir = match parent_path {
        Some(p) if !p.trim().is_empty() => PathBuf::from(p),
        _ => app_handle
            .path()
            .document_dir()
            .or_else(|_| app_handle.path().app_data_dir())
            .unwrap_or_else(|_| PathBuf::from(".")),
    };

    let target_vault_dir = parent_dir.join(&name);
    let vault_info = state.vault_manager.set_current_vault(target_vault_dir.clone())?;

    if let Ok(mut watcher) = state.watcher_controller.lock() {
        let _ = watcher.start_watching(target_vault_dir, state.vault_manager.clone(), app_handle.clone());
    }

    Ok(vault_info)
}

#[tauri::command]
pub async fn vault_get_current(state: State<'_, AppState>) -> Result<Option<VaultInfo>, String> {
    let current_path = match state.vault_manager.get_current_vault_path() {
        Ok(p) => p,
        Err(_) => return Ok(None),
    };

    let vault_name = current_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Vault")
        .to_string();

    let obsidian_dir = current_path.join(crate::vault::OBSIDIAN_DIR_NAME);
    let has_obsidian = obsidian_dir.exists();
    let obsidian_hints = if has_obsidian {
        let app_json = obsidian_dir.join("app.json");
        let mut hints = crate::vault::ObsidianHints::default();
        if let Ok(content) = std::fs::read_to_string(app_json) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(folder) = val.get("attachmentFolderPath").and_then(|v| v.as_str()) {
                    hints.attachment_folder = Some(folder.to_string());
                }
                if let Some(loc) = val.get("newFileLocation").and_then(|v| v.as_str()) {
                    hints.new_file_location = Some(loc.to_string());
                }
            }
        }
        Some(hints)
    } else {
        None
    };

    Ok(Some(VaultInfo {
        name: vault_name,
        path: current_path.to_string_lossy().to_string(),
        has_obsidian,
        obsidian_hints,
    }))
}

#[tauri::command]
pub async fn vault_get_recents(state: State<'_, AppState>) -> Result<Vec<RecentVault>, String> {
    Ok(state.vault_manager.load_recent_vaults())
}

#[tauri::command]
pub async fn vault_remove_recent(path: String, state: State<'_, AppState>) -> Result<(), String> {
    state.vault_manager.remove_recent_vault(&path)
}

#[tauri::command]
pub async fn vault_list_tree(state: State<'_, AppState>) -> Result<Vec<FileNode>, String> {
    state.vault_manager.list_tree()
}

#[tauri::command]
pub async fn vault_read_file(relative_path: String, state: State<'_, AppState>) -> Result<String, String> {
    state.vault_manager.read_file(&relative_path)
}

#[tauri::command]
pub async fn vault_write_file(
    relative_path: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    state.vault_manager.write_file_atomic(&relative_path, &content)?;
    Ok(true)
}

#[tauri::command]
pub async fn vault_create_file(
    relative_path: String,
    content: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    state.vault_manager.create_file(&relative_path, content.as_deref())
}

#[tauri::command]
pub async fn vault_create_folder(
    relative_path: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    state.vault_manager.create_folder(&relative_path)
}

#[tauri::command]
pub async fn vault_rename(
    old_relative_path: String,
    new_relative_path: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    state.vault_manager.rename_item(&old_relative_path, &new_relative_path)?;
    Ok(true)
}

#[tauri::command]
pub async fn vault_move(
    source_relative_path: String,
    target_folder_relative_path: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    state.vault_manager.move_item(&source_relative_path, &target_folder_relative_path)
}

#[tauri::command]
pub async fn vault_delete(relative_path: String, state: State<'_, AppState>) -> Result<TrashItem, String> {
    state.vault_manager.delete_to_trash(&relative_path)
}

#[tauri::command]
pub async fn vault_list_trash(state: State<'_, AppState>) -> Result<Vec<TrashItem>, String> {
    state.vault_manager.list_trash()
}

#[tauri::command]
pub async fn vault_restore_trash(item_id: String, state: State<'_, AppState>) -> Result<String, String> {
    state.vault_manager.restore_trash_item(&item_id)
}

#[tauri::command]
pub async fn vault_empty_trash(state: State<'_, AppState>) -> Result<bool, String> {
    state.vault_manager.empty_trash()?;
    Ok(true)
}

#[tauri::command]
pub async fn vault_read_config(config_name: String, state: State<'_, AppState>) -> Result<Option<String>, String> {
    state.vault_manager.read_config(&config_name)
}

#[tauri::command]
pub async fn vault_write_config(
    config_name: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    state.vault_manager.write_config(&config_name, &content)?;
    Ok(true)
}

#[tauri::command]
pub async fn vault_list_snippets(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    state.vault_manager.list_snippets()
}

#[tauri::command]
pub async fn vault_read_snippet(snippet_name: String, state: State<'_, AppState>) -> Result<String, String> {
    state.vault_manager.read_snippet(&snippet_name)
}

#[tauri::command]
pub async fn vault_write_snippet(
    snippet_name: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    state.vault_manager.write_snippet(&snippet_name, &content)?;
    Ok(true)
}

#[tauri::command]
pub async fn vault_write_binary(
    relative_path: String,
    data_bytes: Vec<u8>,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    state.vault_manager.write_file_binary(&relative_path, &data_bytes)?;
    Ok(true)
}

#[tauri::command]
pub async fn vault_open_popout(
    path: String,
    title: String,
    _app_handle: AppHandle,
) -> Result<bool, String> {
    #[cfg(desktop)]
    {
        let window_label = format!("popout_{}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis());
        let _ = tauri::WebviewWindowBuilder::new(
            &_app_handle,
            &window_label,
            tauri::WebviewUrl::App("index.html".into()),
        )
        .title(title)
        .inner_size(800.0, 600.0)
        .build();
    }
    let _ = path;
    let _ = title;
    Ok(true)
}

#[tauri::command]
pub async fn vault_get_backlinks(
    relative_path: String,
    state: State<'_, AppState>,
) -> Result<BacklinksResult, String> {
    state.vault_manager.get_backlinks(&relative_path)
}

#[tauri::command]
pub async fn vault_get_outgoing_links(
    relative_path: String,
    state: State<'_, AppState>,
) -> Result<Vec<OutgoingLinkItem>, String> {
    state.vault_manager.get_outgoing_links(&relative_path)
}

#[tauri::command]
pub async fn vault_get_tags(
    state: State<'_, AppState>,
) -> Result<Vec<TagCountItem>, String> {
    state.vault_manager.get_tags()
}

#[tauri::command]
pub async fn vault_get_outline(
    relative_path: String,
    state: State<'_, AppState>,
) -> Result<Vec<HeadingItem>, String> {
    state.vault_manager.get_outline(&relative_path)
}

#[tauri::command]
pub async fn vault_get_graph_data(
    state: State<'_, AppState>,
) -> Result<GraphData, String> {
    state.vault_manager.get_graph_data()
}

#[tauri::command]
pub async fn vault_update_links_on_rename(
    old_path: String,
    new_path: String,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    state.vault_manager.update_links_on_rename(&old_path, &new_path)
}
