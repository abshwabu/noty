use std::fs;
use std::process::{Child, Command};
use std::thread::sleep;
use std::time::Duration;
use tempfile::TempDir;
use vault_core::sync::client::SyncClient;
use vault_core::sync::state::SyncConfig;
use vault_core::sync::SyncEngine;

struct TestServerProcess {
    child: Child,
    port: u16,
    _data_dir: TempDir,
}

impl TestServerProcess {
    fn start(port: u16) -> Self {
        let temp_data = TempDir::new().expect("failed to create server temp dir");
        let server_binary = std::env::current_dir()
            .unwrap()
            .join("../../../server/noty-sync");

        let child = Command::new(&server_binary)
            .arg("serve")
            .arg("--port")
            .arg(port.to_string())
            .arg("--data-dir")
            .arg(temp_data.path().to_str().unwrap())
            .spawn()
            .expect("Failed to start noty-sync server process");

        // Wait until server is healthy
        let health_url = format!("http://127.0.0.1:{}/healthz", port);
        let mut healthy = false;
        for _ in 0..50 {
            if let Ok(resp) = reqwest::blocking::get(&health_url) {
                if resp.status().is_success() {
                    healthy = true;
                    break;
                }
            }
            sleep(Duration::from_millis(100));
        }

        if !healthy {
            panic!("noty-sync server failed to become healthy on port {}", port);
        }

        Self {
            child,
            port,
            _data_dir: temp_data,
        }
    }

    fn url(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }
}

impl Drop for TestServerProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
    }
}

#[test]
fn test_two_devices_offline_editing_convergence_and_conflict_handling() {
    let server = TestServerProcess::start(18088);
    let server_url = server.url();

    // 1. Initial owner registration via HTTP
    let reg_payload = serde_json::json!({
        "username": "syncuser",
        "password": "syncpassword123",
        "device_name": "Device 1",
    });
    let reg_resp = reqwest::blocking::Client::new()
        .post(format!("{}/api/v1/auth/register", server_url))
        .json(&reg_payload)
        .send()
        .expect("registration request failed");
    assert!(reg_resp.status().is_success());
    let reg_json: serde_json::Value = reg_resp.json().unwrap();
    let token_1 = reg_json["token"].as_str().unwrap().to_string();

    // 2. Login from Device 2
    let login_resp = SyncClient::login(&server_url, "syncuser", "syncpassword123", "Device 2")
        .expect("Device 2 login failed");
    let token_2 = login_resp.token;

    // 3. Create shared vault on server
    let client_1 = SyncClient::new(server_url.clone(), token_1.clone());
    let remote_vault = client_1
        .create_vault("SharedVault")
        .expect("vault creation failed");
    let vault_id = remote_vault.id;

    // 4. Setup local vault directories for Device 1 and Device 2
    let dev1_temp = TempDir::new().unwrap();
    let dev2_temp = TempDir::new().unwrap();

    let dev1_engine = SyncEngine::new(dev1_temp.path()).unwrap();
    let dev2_engine = SyncEngine::new(dev2_temp.path()).unwrap();

    // Configure Device 1
    let mut cfg1 = SyncConfig::default();
    cfg1.server_url = server_url.clone();
    cfg1.token = token_1;
    cfg1.vault_id = vault_id.clone();
    cfg1.vault_name = "SharedVault".to_string();
    cfg1.device_name = "Device 1".to_string();
    dev1_engine.state().save_config(&cfg1).unwrap();

    // Configure Device 2
    let mut cfg2 = SyncConfig::default();
    cfg2.server_url = server_url.clone();
    cfg2.token = token_2;
    cfg2.vault_id = vault_id.clone();
    cfg2.vault_name = "SharedVault".to_string();
    cfg2.device_name = "Device 2".to_string();
    dev2_engine.state().save_config(&cfg2).unwrap();

    // 5. Device 1 creates initial note
    let initial_content = "# Team Roadmap\nLine 1: Architecture\nLine 2: Milestones\nLine 3: Operations\n";
    let dev1_note_path = dev1_temp.path().join("roadmap.md");
    fs::write(&dev1_note_path, initial_content).unwrap();

    // Device 1 syncs (pushes initial note)
    let s1 = dev1_engine.sync().expect("Device 1 initial sync failed");
    assert_eq!(s1.pushed, 1);

    // Device 2 syncs (pulls initial note)
    let s2 = dev2_engine.sync().expect("Device 2 initial sync failed");
    assert_eq!(s2.pulled, 1);

    let dev2_note_path = dev2_temp.path().join("roadmap.md");
    assert!(dev2_note_path.exists());
    assert_eq!(fs::read_to_string(&dev2_note_path).unwrap(), initial_content);

    // 6. SIMULATE OFFLINE EDITING ON BOTH DEVICES
    // Device 1 edits Line 1 (Architecture)
    let dev1_edit = "# Team Roadmap\nLine 1: Architecture (Device 1 updated microservices)\nLine 2: Milestones\nLine 3: Operations\n";
    fs::write(&dev1_note_path, dev1_edit).unwrap();

    // Device 2 edits Line 3 (Operations)
    let dev2_edit = "# Team Roadmap\nLine 1: Architecture\nLine 2: Milestones\nLine 3: Operations (Device 2 added Kubernetes cluster)\n";
    fs::write(&dev2_note_path, dev2_edit).unwrap();

    // 7. SYNC CONVERGENCE
    // Device 1 goes online and syncs first (pushes version 2)
    let res_dev1 = dev1_engine.sync().expect("Device 1 push sync failed");
    assert_eq!(res_dev1.pushed, 1);

    // Device 2 goes online and syncs (clean diff3 automatic merge!)
    let res_dev2 = dev2_engine.sync().expect("Device 2 merge sync failed");
    assert_eq!(res_dev2.merged, 1);

    // Device 1 syncs again to pull merged version 3
    let res_dev1_pull = dev1_engine.sync().expect("Device 1 pull sync failed");
    assert_eq!(res_dev1_pull.pulled, 1);

    // 8. VERIFY CONVERGENCE & NO DATA LOSS
    let final_dev1 = fs::read_to_string(&dev1_note_path).unwrap();
    let final_dev2 = fs::read_to_string(&dev2_note_path).unwrap();

    assert_eq!(
        final_dev1, final_dev2,
        "Device 1 and Device 2 note contents must converge to identical state!"
    );
    assert!(
        final_dev1.contains("Architecture (Device 1 updated microservices)"),
        "Must preserve Device 1 edits without data loss"
    );
    assert!(
        final_dev1.contains("Operations (Device 2 added Kubernetes cluster)"),
        "Must preserve Device 2 edits without data loss"
    );

    // 9. SIMULATE CONFLICTING OVERLAPPING EDIT
    // Both devices edit Line 2 to different texts
    let conflict_dev1 = final_dev1.replace("Line 2: Milestones", "Line 2: Milestones (Device 1 set date Q3)");
    let conflict_dev2 = final_dev2.replace("Line 2: Milestones", "Line 2: Milestones (Device 2 set date Q4)");

    fs::write(&dev1_note_path, conflict_dev1).unwrap();
    fs::write(&dev2_note_path, conflict_dev2).unwrap();

    // Device 1 syncs
    let _ = dev1_engine.sync().expect("Device 1 sync failed");

    // Device 2 syncs -> detects conflict and creates conflicted copy file
    let c2 = dev2_engine.sync().expect("Device 2 sync failed");
    assert_eq!(c2.conflicts, 1);

    // Check conflict recorded in DB
    let conflicts = dev2_engine.state().get_unresolved_conflicts().unwrap();
    assert_eq!(conflicts.len(), 1);
    assert_eq!(conflicts[0].path, "roadmap.md");
    assert!(!conflicts[0].conflicted_file_path.is_empty());

    let conflict_file = dev2_temp.path().join(&conflicts[0].conflicted_file_path);
    assert!(conflict_file.exists(), "Conflicted copy file must be preserved on disk");

    // Resolve conflict by choosing 'remote'
    dev2_engine
        .resolve_conflict(conflicts[0].id, "remote")
        .expect("Conflict resolution failed");

    let unresolved_after = dev2_engine.state().get_unresolved_conflicts().unwrap();
    assert_eq!(unresolved_after.len(), 0);
    assert!(!conflict_file.exists(), "Conflicted copy file removed on resolution");
}
