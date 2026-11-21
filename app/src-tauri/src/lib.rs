mod commands;
pub mod vault;
pub mod watcher;

use commands::AppState;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::Manager;
use vault::VaultManager;
use watcher::VaultWatcherController;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let config_dir = app
                .path()
                .app_config_dir()
                .unwrap_or_else(|_| PathBuf::from("."));
            let recent_vaults_file = config_dir.join("recent_vaults.json");

            let vault_manager = Arc::new(VaultManager::new(recent_vaults_file));
            let watcher_controller = Arc::new(Mutex::new(VaultWatcherController::new()));

            app.manage(AppState {
                vault_manager,
                watcher_controller,
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::vault_pick_folder,
            commands::vault_open,
            commands::vault_create,
            commands::vault_get_current,
            commands::vault_get_recents,
            commands::vault_remove_recent,
            commands::vault_list_tree,
            commands::vault_read_file,
            commands::vault_write_file,
            commands::vault_create_file,
            commands::vault_create_folder,
            commands::vault_rename,
            commands::vault_move,
            commands::vault_delete,
            commands::vault_list_trash,
            commands::vault_restore_trash,
            commands::vault_empty_trash,
            commands::vault_read_config,
            commands::vault_write_config,
            commands::vault_list_snippets,
            commands::vault_read_snippet,
            commands::vault_write_snippet,
            commands::vault_write_binary,
            commands::vault_open_popout,
            commands::vault_get_backlinks,
            commands::vault_get_outgoing_links,
            commands::vault_get_tags,
            commands::vault_get_outline,
            commands::vault_get_graph_data,
            commands::vault_update_links_on_rename,
            commands::vault_search,
            commands::vault_preview_global_replace,
            commands::vault_execute_global_replace,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
