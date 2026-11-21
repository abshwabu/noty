use crate::vault::{FileChangeEvent, VaultManager, APP_CONFIG_DIR_NAME, OBSIDIAN_DIR_NAME, TRASH_DIR_NAME};
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

pub struct VaultWatcherController {
    watcher: Option<RecommendedWatcher>,
    stop_sender: Option<Sender<()>>,
}

impl VaultWatcherController {
    pub fn new() -> Self {
        Self {
            watcher: None,
            stop_sender: None,
        }
    }

    pub fn stop(&mut self) {
        if let Some(sender) = self.stop_sender.take() {
            let _ = sender.send(());
        }
        self.watcher = None;
    }

    pub fn start_watching(
        &mut self,
        vault_path: PathBuf,
        vault_manager: Arc<VaultManager>,
        app_handle: AppHandle,
    ) -> Result<(), String> {
        self.stop();

        let (event_tx, event_rx): (Sender<Event>, Receiver<Event>) = channel();
        let (stop_tx, stop_rx): (Sender<()>, Receiver<()>) = channel();
        self.stop_sender = Some(stop_tx);

        let mut watcher = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                if let Ok(event) = res {
                    let _ = event_tx.send(event);
                }
            },
            Config::default(),
        )
        .map_err(|e| format!("Failed to create watcher: {}", e))?;

        watcher
            .watch(&vault_path, RecursiveMode::Recursive)
            .map_err(|e| format!("Failed to watch vault path {:?}: {}", vault_path, e))?;

        self.watcher = Some(watcher);

        // Spawn debouncing background worker
        let vault_root = vault_path.clone();
        thread::spawn(move || {
            let debounce_window = Duration::from_millis(250);
            let mut pending_events: HashMap<PathBuf, (String, bool, Instant)> = HashMap::new();

            loop {
                // Check if stop signal was sent
                if stop_rx.try_recv().is_ok() {
                    break;
                }

                // Drain incoming events from channel (non-blocking / timeout)
                while let Ok(event) = event_rx.try_recv() {
                    let event_type = match event.kind {
                        EventKind::Create(_) => "create",
                        EventKind::Modify(_) => "modify",
                        EventKind::Remove(_) => "delete",
                        EventKind::Any => "modify",
                        _ => continue,
                    };

                    for path in event.paths {
                        // Check if path is within vault
                        if !path.starts_with(&vault_root) {
                            continue;
                        }

                        // Ignore internal directories and temp files
                        let is_ignored = path
                            .strip_prefix(&vault_root)
                            .map(|rel| {
                                let parts: Vec<_> = rel.iter().map(|p| p.to_string_lossy()).collect();
                                parts.iter().any(|p| {
                                    p == APP_CONFIG_DIR_NAME
                                        || p == TRASH_DIR_NAME
                                        || p == ".git"
                                        || p.starts_with(".tmp_")
                                })
                            })
                            .unwrap_or(false);

                        if is_ignored {
                            continue;
                        }

                        // Check if this was our own write in the last 1.5 seconds
                        if vault_manager.is_own_write(&path, Duration::from_millis(1500)) {
                            continue;
                        }

                        let is_dir = path.is_dir();
                        pending_events.insert(path, (event_type.to_string(), is_dir, Instant::now()));
                    }
                }

                // Flush events that have settled for debounce_window
                let now = Instant::now();
                let mut ready_paths = Vec::new();
                for (path, (_ev, _is_dir, timestamp)) in &pending_events {
                    if now.duration_since(*timestamp) >= debounce_window {
                        ready_paths.push(path.clone());
                    }
                }

                for path in ready_paths {
                    if let Some((event_type, is_dir, _)) = pending_events.remove(&path) {
                        // Double check own-write filter one more time
                        if vault_manager.is_own_write(&path, Duration::from_millis(1500)) {
                            continue;
                        }

                        let rel_path = path
                            .strip_prefix(&vault_root)
                            .unwrap_or(&path)
                            .to_string_lossy()
                            .replace('\\', "/");

                        let payload = FileChangeEvent {
                            event_type: event_type.clone(),
                            path: path.to_string_lossy().to_string(),
                            relative_path: rel_path.clone(),
                            is_dir,
                        };

                        if rel_path.ends_with(".md") {
                            if event_type == "delete" {
                                let _ = vault_manager.delete_from_index(&rel_path);
                            } else {
                                let _ = vault_manager.index_file_from_disk(&rel_path);
                            }
                        }

                        let _ = app_handle.emit("vault:file-changed", &payload);
                    }
                }

                thread::sleep(Duration::from_millis(50));
            }
        });

        Ok(())
    }
}
