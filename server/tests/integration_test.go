package tests

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/noty/sync-server/internal/api"
	"github.com/noty/sync-server/internal/crypto"
	"github.com/noty/sync-server/internal/db"
	"github.com/noty/sync-server/internal/models"
	"github.com/noty/sync-server/internal/storage"
)

type testEnv struct {
	server    *httptest.Server
	db        *db.DB
	blobStore *storage.BlobStore
	dataDir   string
}

func setupTestEnv(t *testing.T) *testEnv {
	tempDir, err := os.MkdirTemp("", "noty-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}

	dbPath := filepath.Join(tempDir, "noty.db")
	database, err := db.OpenDB(dbPath)
	if err != nil {
		t.Fatalf("failed to open test db: %v", err)
	}

	blobStore, err := storage.NewBlobStore(tempDir)
	if err != nil {
		t.Fatalf("failed to open blob store: %v", err)
	}

	cfg := api.Config{
		Port:           0,
		DataDir:        tempDir,
		MaxRequestBody: 10 * 1024 * 1024,
		RateLimit:      1000,
		RateBurst:      1000,
	}

	srv := api.NewServer(cfg, database, blobStore, nil)
	ts := httptest.NewServer(srv.Router())

	return &testEnv{
		server:    ts,
		db:        database,
		blobStore: blobStore,
		dataDir:   tempDir,
	}
}

func (e *testEnv) teardown() {
	e.server.Close()
	e.db.Close()
	os.RemoveAll(e.dataDir)
}

func TestSyncServerComprehensiveIntegration(t *testing.T) {
	env := setupTestEnv(t)
	defer env.teardown()

	client := env.server.Client()

	// 1. Health check
	t.Run("Health check", func(t *testing.T) {
		resp, err := client.Get(env.server.URL + "/healthz")
		if err != nil {
			t.Fatalf("failed to call /healthz: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
	})

	// 2. First-run Single Owner Registration
	var dev1Token, userID string
	t.Run("Single Owner Registration", func(t *testing.T) {
		regBody := map[string]string{
			"username":    "owner",
			"password":    "supersecretpassword123",
			"device_name": "Desktop Mac",
		}
		b, _ := json.Marshal(regBody)

		resp, err := client.Post(env.server.URL+"/api/v1/auth/register", "application/json", bytes.NewReader(b))
		if err != nil {
			t.Fatalf("registration request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusCreated {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("expected 201 Created, got %d: %s", resp.StatusCode, string(body))
		}

		var authResp api.AuthResponse
		if err := json.NewDecoder(resp.Body).Decode(&authResp); err != nil {
			t.Fatalf("failed to decode auth response: %v", err)
		}

		if authResp.Token == "" || authResp.Device == nil || authResp.User == nil {
			t.Fatalf("incomplete auth response: %+v", authResp)
		}

		dev1Token = authResp.Token
		userID = authResp.User.ID

		// Second registration must be rejected (single owner limit)
		resp2, err := client.Post(env.server.URL+"/api/v1/auth/register", "application/json", bytes.NewReader(b))
		if err != nil {
			t.Fatalf("second registration call failed: %v", err)
		}
		defer resp2.Body.Close()

		if resp2.StatusCode != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden for second registration, got %d", resp2.StatusCode)
		}
	})

	// 3. Login from Device 2
	var dev2Token, dev2ID string
	t.Run("Login Device 2", func(t *testing.T) {
		loginBody := map[string]string{
			"username":    "owner",
			"password":    "supersecretpassword123",
			"device_name": "Android Phone",
		}
		b, _ := json.Marshal(loginBody)

		resp, err := client.Post(env.server.URL+"/api/v1/auth/login", "application/json", bytes.NewReader(b))
		if err != nil {
			t.Fatalf("login failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}

		var authResp api.AuthResponse
		_ = json.NewDecoder(resp.Body).Decode(&authResp)
		dev2Token = authResp.Token
		dev2ID = authResp.Device.ID

		if dev2Token == "" || dev2ID == "" {
			t.Fatalf("invalid device 2 auth: %+v", authResp)
		}
	})

	// 4. List Devices
	t.Run("List Authorized Devices", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, env.server.URL+"/api/v1/auth/devices", nil)
		req.Header.Set("Authorization", "Bearer "+dev1Token)

		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("devices request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}

		var devices []models.Device
		_ = json.NewDecoder(resp.Body).Decode(&devices)

		if len(devices) != 2 {
			t.Fatalf("expected 2 devices, got %d", len(devices))
		}
	})

	// 5. Create Vault
	var vaultID string
	t.Run("Create Vault", func(t *testing.T) {
		reqBody := map[string]interface{}{
			"name":                   "Work Notes",
			"version_retention_days": 14,
		}
		b, _ := json.Marshal(reqBody)

		req, _ := http.NewRequest(http.MethodPost, env.server.URL+"/api/v1/vaults", bytes.NewReader(b))
		req.Header.Set("Authorization", "Bearer "+dev1Token)
		req.Header.Set("Content-Type", "application/json")

		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("vault creation failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusCreated {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("expected 201 Created, got %d: %s", resp.StatusCode, string(body))
		}

		var vault models.Vault
		_ = json.NewDecoder(resp.Body).Decode(&vault)
		vaultID = vault.ID
		if vaultID == "" {
			t.Fatal("empty vault ID returned")
		}
	})

	// 6. Device 1 Uploads Blob & Pushes Note
	noteContent := "# My First Note\nHello synced world!"
	contentHash := sha256.Sum256([]byte(noteContent))
	expectedHash := hex.EncodeToString(contentHash[:])

	t.Run("Device 1 Push Note and Blob", func(t *testing.T) {
		// Upload Blob
		reqBlob, _ := http.NewRequest(http.MethodPost, env.server.URL+"/api/v1/blobs", bytes.NewReader([]byte(noteContent)))
		reqBlob.Header.Set("Authorization", "Bearer "+dev1Token)

		respBlob, err := client.Do(reqBlob)
		if err != nil {
			t.Fatalf("blob upload failed: %v", err)
		}
		defer respBlob.Body.Close()

		if respBlob.StatusCode != http.StatusCreated {
			t.Fatalf("expected 201 Created for blob upload, got %d", respBlob.StatusCode)
		}

		var blobResp api.BlobUploadResponse
		_ = json.NewDecoder(respBlob.Body).Decode(&blobResp)
		if blobResp.Hash != expectedHash {
			t.Fatalf("expected hash %s, got %s", expectedHash, blobResp.Hash)
		}

		// Push Manifest Change
		changes := []models.PushChange{
			{
				Path:        "notes/first.md",
				Hash:        expectedHash,
				Size:        int64(len(noteContent)),
				Mtime:       1700000000,
				BaseVersion: 0,
				Deleted:     false,
			},
		}
		b, _ := json.Marshal(changes)

		reqPush, _ := http.NewRequest(http.MethodPost, env.server.URL+"/api/v1/vaults/"+vaultID+"/push", bytes.NewReader(b))
		reqPush.Header.Set("Authorization", "Bearer "+dev1Token)
		reqPush.Header.Set("Content-Type", "application/json")

		respPush, err := client.Do(reqPush)
		if err != nil {
			t.Fatalf("push failed: %v", err)
		}
		defer respPush.Body.Close()

		if respPush.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", respPush.StatusCode)
		}

		var pushResp models.PushResponse
		_ = json.NewDecoder(respPush.Body).Decode(&pushResp)

		if len(pushResp.Results) != 1 || pushResp.Results[0].Status != "applied" || pushResp.Results[0].Version != 1 {
			t.Fatalf("unexpected push response: %+v", pushResp)
		}
	})

	// 7. Device 2 Pulls Manifest and Blob
	t.Run("Device 2 Sync Pull", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, env.server.URL+"/api/v1/vaults/"+vaultID+"/manifest?since=0", nil)
		req.Header.Set("Authorization", "Bearer "+dev2Token)

		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("manifest pull failed: %v", err)
		}
		defer resp.Body.Close()

		var manResp models.ManifestResponse
		_ = json.NewDecoder(resp.Body).Decode(&manResp)

		if len(manResp.Items) != 1 {
			t.Fatalf("expected 1 item in manifest, got %d", len(manResp.Items))
		}
		if manResp.Items[0].Path != "notes/first.md" || manResp.Items[0].Version != 1 {
			t.Fatalf("manifest item mismatch: %+v", manResp.Items[0])
		}

		// Download blob from Device 2
		reqBlob, _ := http.NewRequest(http.MethodGet, env.server.URL+"/api/v1/blobs/"+manResp.Items[0].Hash, nil)
		reqBlob.Header.Set("Authorization", "Bearer "+dev2Token)

		respBlob, err := client.Do(reqBlob)
		if err != nil {
			t.Fatalf("blob fetch failed: %v", err)
		}
		defer respBlob.Body.Close()

		downloadedBytes, _ := io.ReadAll(respBlob.Body)
		if string(downloadedBytes) != noteContent {
			t.Fatalf("downloaded content mismatch. expected %q got %q", noteContent, string(downloadedBytes))
		}
	})

	// 8. Concurrent Conflict Detection
	t.Run("Concurrent Conflict Handling", func(t *testing.T) {
		// Device 1 updates note to version 2
		v2Content := "# My First Note\nUpdated by Device 1"
		v2Hash := hex.EncodeToString(sha256New(v2Content))

		// Upload blob
		reqB, _ := http.NewRequest(http.MethodPost, env.server.URL+"/api/v1/blobs", bytes.NewReader([]byte(v2Content)))
		reqB.Header.Set("Authorization", "Bearer "+dev1Token)
		_, _ = client.Do(reqB)

		// Push v2 with base_version: 1
		p1, _ := json.Marshal([]models.PushChange{
			{Path: "notes/first.md", Hash: v2Hash, Size: int64(len(v2Content)), Mtime: 1700000010, BaseVersion: 1},
		})
		req1, _ := http.NewRequest(http.MethodPost, env.server.URL+"/api/v1/vaults/"+vaultID+"/push", bytes.NewReader(p1))
		req1.Header.Set("Authorization", "Bearer "+dev1Token)
		resp1, _ := client.Do(req1)
		var pushResp1 models.PushResponse
		_ = json.NewDecoder(resp1.Body).Decode(&pushResp1)
		if pushResp1.Results[0].Status != "applied" || pushResp1.Results[0].Version != 2 {
			t.Fatalf("expected version 2 applied, got %+v", pushResp1)
		}

		// Device 2, having stale base_version: 1, attempts to push simultaneously
		p2, _ := json.Marshal([]models.PushChange{
			{Path: "notes/first.md", Hash: "deadbeef", Size: 20, Mtime: 1700000015, BaseVersion: 1},
		})
		req2, _ := http.NewRequest(http.MethodPost, env.server.URL+"/api/v1/vaults/"+vaultID+"/push", bytes.NewReader(p2))
		req2.Header.Set("Authorization", "Bearer "+dev2Token)
		resp2, _ := client.Do(req2)
		var pushResp2 models.PushResponse
		_ = json.NewDecoder(resp2.Body).Decode(&pushResp2)

		// Must detect conflict!
		if pushResp2.Results[0].Status != "conflict" {
			t.Fatalf("expected status 'conflict', got: %+v", pushResp2.Results[0])
		}
		if pushResp2.Results[0].Version != 2 || pushResp2.Results[0].ServerHash != v2Hash {
			t.Fatalf("conflict response missing server version/hash: %+v", pushResp2.Results[0])
		}
	})

	// 9. Tombstone & Deletion Handling
	t.Run("Deletion Tombstone Propagation", func(t *testing.T) {
		delChange, _ := json.Marshal([]models.PushChange{
			{Path: "notes/first.md", Hash: "", Size: 0, Mtime: 1700000020, BaseVersion: 2, Deleted: true},
		})
		reqDel, _ := http.NewRequest(http.MethodPost, env.server.URL+"/api/v1/vaults/"+vaultID+"/push", bytes.NewReader(delChange))
		reqDel.Header.Set("Authorization", "Bearer "+dev1Token)
		respDel, _ := client.Do(reqDel)
		var pr models.PushResponse
		_ = json.NewDecoder(respDel.Body).Decode(&pr)

		if pr.Results[0].Status != "applied" || pr.Results[0].Version != 3 {
			t.Fatalf("expected deletion applied as version 3: %+v", pr)
		}

		// Device 2 pulls changelog
		reqChangelog, _ := http.NewRequest(http.MethodGet, env.server.URL+"/api/v1/vaults/"+vaultID+"/manifest?since=2", nil)
		reqChangelog.Header.Set("Authorization", "Bearer "+dev2Token)
		respChangelog, _ := client.Do(reqChangelog)
		var manResp models.ManifestResponse
		_ = json.NewDecoder(respChangelog.Body).Decode(&manResp)

		if len(manResp.Items) == 0 || !manResp.Items[0].Deleted {
			t.Fatalf("expected tombstone in changelog: %+v", manResp)
		}
	})

	// 10. Chunked Blob Upload
	t.Run("Chunked Upload", func(t *testing.T) {
		uploadID := "upl_test_123"
		fullData := bytes.Repeat([]byte("LARGE-DATA-BLOCK-CHUNK-STREAMING-TEST"), 200)
		expectedHash := hex.EncodeToString(sha256New(string(fullData)))

		part1 := fullData[:len(fullData)/2]
		part2 := fullData[len(fullData)/2:]

		// Send chunk 0
		url0 := fmt.Sprintf("%s/api/v1/blobs/chunk?upload_id=%s&chunk_index=0", env.server.URL, uploadID)
		req0, _ := http.NewRequest(http.MethodPost, url0, bytes.NewReader(part1))
		req0.Header.Set("Authorization", "Bearer "+dev1Token)
		resp0, err := client.Do(req0)
		if err != nil || resp0.StatusCode != http.StatusOK {
			t.Fatalf("chunk 0 failed: %v", err)
		}

		// Send chunk 1
		url1 := fmt.Sprintf("%s/api/v1/blobs/chunk?upload_id=%s&chunk_index=1", env.server.URL, uploadID)
		req1, _ := http.NewRequest(http.MethodPost, url1, bytes.NewReader(part2))
		req1.Header.Set("Authorization", "Bearer "+dev1Token)
		resp1, err := client.Do(req1)
		if err != nil || resp1.StatusCode != http.StatusOK {
			t.Fatalf("chunk 1 failed: %v", err)
		}

		// Assemble
		assembleReq, _ := json.Marshal(api.AssembleChunkRequest{
			UploadID:     uploadID,
			TotalChunks:  2,
			ExpectedHash: expectedHash,
		})
		reqAss, _ := http.NewRequest(http.MethodPost, env.server.URL+"/api/v1/blobs/chunk/assemble", bytes.NewReader(assembleReq))
		reqAss.Header.Set("Authorization", "Bearer "+dev1Token)
		respAss, err := client.Do(reqAss)
		if err != nil || respAss.StatusCode != http.StatusOK {
			t.Fatalf("assemble failed: %v", err)
		}

		var assResp api.BlobUploadResponse
		_ = json.NewDecoder(respAss.Body).Decode(&assResp)
		if assResp.Hash != expectedHash || assResp.Size != int64(len(fullData)) {
			t.Fatalf("chunked assemble mismatch: %+v", assResp)
		}
	})

	// 11. E2EE XChaCha20-Poly1305 Round-trip
	t.Run("End-to-End Encryption Mode", func(t *testing.T) {
		passphrase := "vault-passphrase-known-only-to-client"
		salt := []byte("16-byte-vlt-salt")
		key := crypto.DeriveKey(passphrase, salt)

		secretNote := []byte("# Top Secret Note\nOnly readable on client devices!")
		ciphertext, err := crypto.EncryptXChaCha20Poly1305(key, secretNote)
		if err != nil {
			t.Fatalf("client encryption failed: %v", err)
		}

		// Upload ciphertext blob to server
		reqEnc, _ := http.NewRequest(http.MethodPost, env.server.URL+"/api/v1/blobs", bytes.NewReader(ciphertext))
		reqEnc.Header.Set("Authorization", "Bearer "+dev1Token)
		respEnc, err := client.Do(reqEnc)
		if err != nil || respEnc.StatusCode != http.StatusCreated {
			t.Fatalf("upload encrypted blob failed: %v", err)
		}
		var encResp api.BlobUploadResponse
		_ = json.NewDecoder(respEnc.Body).Decode(&encResp)

		// Download ciphertext from server on Device 2
		reqFetch, _ := http.NewRequest(http.MethodGet, env.server.URL+"/api/v1/blobs/"+encResp.Hash, nil)
		reqFetch.Header.Set("Authorization", "Bearer "+dev2Token)
		respFetch, err := client.Do(reqFetch)
		if err != nil || respFetch.StatusCode != http.StatusOK {
			t.Fatalf("fetch encrypted blob failed: %v", err)
		}
		pulledCiphertext, _ := io.ReadAll(respFetch.Body)

		// Decrypt on Device 2
		decrypted, err := crypto.DecryptXChaCha20Poly1305(key, pulledCiphertext)
		if err != nil {
			t.Fatalf("client decryption failed: %v", err)
		}

		if !bytes.Equal(decrypted, secretNote) {
			t.Fatalf("decrypted note does not match original: %q", string(decrypted))
		}
	})

	// 12. Device Revocation
	t.Run("Revoke Device 2", func(t *testing.T) {
		reqRevoke, _ := http.NewRequest(http.MethodDelete, env.server.URL+"/api/v1/auth/devices/"+dev2ID, nil)
		reqRevoke.Header.Set("Authorization", "Bearer "+dev1Token)
		respRevoke, err := client.Do(reqRevoke)
		if err != nil || respRevoke.StatusCode != http.StatusOK {
			t.Fatalf("revoke request failed: %v", err)
		}

		// Device 2 requests should now fail with 401
		reqCheck, _ := http.NewRequest(http.MethodGet, env.server.URL+"/api/v1/vaults", nil)
		reqCheck.Header.Set("Authorization", "Bearer "+dev2Token)
		respCheck, err := client.Do(reqCheck)
		if err != nil || respCheck.StatusCode != http.StatusUnauthorized {
			t.Fatalf("expected 401 for revoked device, got %d", respCheck.StatusCode)
		}
	})

	// 13. Backup & Restore
	t.Run("SQLite Backup and Restore", func(t *testing.T) {
		backupPath := filepath.Join(env.dataDir, "manual-test-backup.db")
		runner, err := db.NewBackupRunner(env.db, env.dataDir, nil)
		if err != nil {
			t.Fatalf("failed to init runner: %v", err)
		}

		if err := runner.CreateBackup(backupPath); err != nil {
			t.Fatalf("failed to create backup: %v", err)
		}

		if _, err := os.Stat(backupPath); err != nil {
			t.Fatalf("backup file does not exist: %v", err)
		}

		// Verify backup can be opened and contains user
		bDB, err := db.OpenDB(backupPath)
		if err != nil {
			t.Fatalf("failed to open backup database: %v", err)
		}
		defer bDB.Close()

		u, err := bDB.GetUserByID(userID)
		if err != nil || u.Username != "owner" {
			t.Fatalf("user not found in backup db: %v", err)
		}
	})
}

func sha256New(s string) []byte {
	h := sha256.Sum256([]byte(s))
	return h[:]
}
