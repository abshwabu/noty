package db

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	_ "modernc.org/sqlite"
	"github.com/noty/sync-server/internal/models"
)

var (
	ErrUserAlreadyExists = errors.New("user already exists")
	ErrSingleOwnerLimit  = errors.New("registration closed: single-owner account is already configured")
	ErrUserNotFound      = errors.New("user not found")
	ErrDeviceNotFound    = errors.New("device not found")
	ErrDeviceRevoked     = errors.New("device has been revoked")
	ErrVaultNotFound     = errors.New("vault not found")
	ErrVaultExists       = errors.New("vault name already exists")
)

// DB wraps the SQLite connection pool with thread-safe helpers
type DB struct {
	conn *sql.DB
	path string
	mu   sync.RWMutex
}

// OpenDB opens a SQLite database at dbPath and applies schema migrations
func OpenDB(dbPath string) (*DB, error) {
	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		return nil, fmt.Errorf("failed to create db directory: %w", err)
	}

	conn, err := sql.Open("sqlite", dbPath+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)")
	if err != nil {
		return nil, fmt.Errorf("failed to open sqlite db: %w", err)
	}

	conn.SetMaxOpenConns(1) // SQLite single-writer safe pool

	if _, err := conn.Exec(SchemaSQL); err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to execute schema: %w", err)
	}

	return &DB{
		conn: conn,
		path: dbPath,
	}, nil
}

// Close closes the underlying database connection
func (d *DB) Close() error {
	return d.conn.Close()
}

// RawDB returns the underlying *sql.DB connection
func (d *DB) RawDB() *sql.DB {
	return d.conn
}

// Path returns the database file path
func (d *DB) Path() string {
	return d.path
}

// CountUsers returns the total count of registered users
func (d *DB) CountUsers() (int, error) {
	var count int
	err := d.conn.QueryRow("SELECT COUNT(*) FROM users").Scan(&count)
	return count, err
}

// CreateUser registers the single owner user
func (d *DB) CreateUser(id, username, passwordHash string) (*models.User, error) {
	d.mu.Lock()
	defer d.mu.Unlock()

	count, err := d.CountUsers()
	if err != nil {
		return nil, err
	}
	if count > 0 {
		return nil, ErrSingleOwnerLimit
	}

	now := time.Now().UTC()
	_, err = d.conn.Exec(
		"INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
		id, username, passwordHash, now,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to insert user: %w", err)
	}

	return &models.User{
		ID:           id,
		Username:     username,
		PasswordHash: passwordHash,
		CreatedAt:    now,
	}, nil
}

// GetUserByUsername retrieves a user by username
func (d *DB) GetUserByUsername(username string) (*models.User, error) {
	u := &models.User{}
	err := d.conn.QueryRow(
		"SELECT id, username, password_hash, created_at FROM users WHERE username = ?",
		username,
	).Scan(&u.ID, &u.Username, &u.PasswordHash, &u.CreatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return u, nil
}

// GetUserByID retrieves a user by ID
func (d *DB) GetUserByID(id string) (*models.User, error) {
	u := &models.User{}
	err := d.conn.QueryRow(
		"SELECT id, username, password_hash, created_at FROM users WHERE id = ?",
		id,
	).Scan(&u.ID, &u.Username, &u.PasswordHash, &u.CreatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return u, nil
}

// CreateDevice registers a new authorized client device
func (d *DB) CreateDevice(id, userID, name, tokenHash string) (*models.Device, error) {
	now := time.Now().UTC()
	_, err := d.conn.Exec(
		"INSERT INTO devices (id, user_id, name, token_hash, last_seen_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		id, userID, name, tokenHash, now, now,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to insert device: %w", err)
	}

	return &models.Device{
		ID:         id,
		UserID:     userID,
		Name:       name,
		TokenHash:  tokenHash,
		LastSeenAt: now,
		CreatedAt:  now,
	}, nil
}

// GetDeviceByTokenHash looks up an active device and associated user by hashed bearer token
func (d *DB) GetDeviceByTokenHash(tokenHash string) (*models.Device, *models.User, error) {
	dev := &models.Device{}
	u := &models.User{}
	var revokedAt sql.NullTime

	err := d.conn.QueryRow(`
		SELECT d.id, d.user_id, d.name, d.token_hash, d.last_seen_at, d.created_at, d.revoked_at,
		       u.id, u.username, u.password_hash, u.created_at
		FROM devices d
		JOIN users u ON u.id = d.user_id
		WHERE d.token_hash = ?
	`, tokenHash).Scan(
		&dev.ID, &dev.UserID, &dev.Name, &dev.TokenHash, &dev.LastSeenAt, &dev.CreatedAt, &revokedAt,
		&u.ID, &u.Username, &u.PasswordHash, &u.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil, ErrDeviceNotFound
		}
		return nil, nil, err
	}

	if revokedAt.Valid {
		dev.RevokedAt = &revokedAt.Time
		return dev, nil, ErrDeviceRevoked
	}

	return dev, u, nil
}

// UpdateDeviceLastSeen updates the timestamp of last communication
func (d *DB) UpdateDeviceLastSeen(deviceID string) error {
	_, err := d.conn.Exec(
		"UPDATE devices SET last_seen_at = ? WHERE id = ?",
		time.Now().UTC(), deviceID,
	)
	return err
}

// ListDevices returns all devices for a given user
func (d *DB) ListDevices(userID string) ([]models.Device, error) {
	rows, err := d.conn.Query(
		"SELECT id, user_id, name, last_seen_at, created_at, revoked_at FROM devices WHERE user_id = ? ORDER BY created_at DESC",
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var devices []models.Device
	for rows.Next() {
		var dev models.Device
		var revokedAt sql.NullTime
		if err := rows.Scan(&dev.ID, &dev.UserID, &dev.Name, &dev.LastSeenAt, &dev.CreatedAt, &revokedAt); err != nil {
			return nil, err
		}
		if revokedAt.Valid {
			dev.RevokedAt = &revokedAt.Time
		}
		devices = append(devices, dev)
	}
	return devices, rows.Err()
}

// RevokeDevice marks a device as revoked
func (d *DB) RevokeDevice(deviceID string) error {
	now := time.Now().UTC()
	res, err := d.conn.Exec("UPDATE devices SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL", now, deviceID)
	if err != nil {
		return err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrDeviceNotFound
	}
	return nil
}

// CreateVault creates a notebook vault for a user
func (d *DB) CreateVault(id, userID, name string, retentionDays int) (*models.Vault, error) {
	if retentionDays <= 0 {
		retentionDays = 30
	}
	now := time.Now().UTC()
	_, err := d.conn.Exec(
		"INSERT INTO vaults (id, user_id, name, created_at, updated_at, version_retention_days) VALUES (?, ?, ?, ?, ?, ?)",
		id, userID, name, now, now, retentionDays,
	)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrVaultExists, err)
	}

	return &models.Vault{
		ID:                   id,
		UserID:               userID,
		Name:                 name,
		CreatedAt:            now,
		UpdatedAt:            now,
		VersionRetentionDays: retentionDays,
	}, nil
}

// GetVault retrieves a vault by its ID
func (d *DB) GetVault(vaultID string) (*models.Vault, error) {
	v := &models.Vault{}
	err := d.conn.QueryRow(
		"SELECT id, user_id, name, created_at, updated_at, version_retention_days FROM vaults WHERE id = ?",
		vaultID,
	).Scan(&v.ID, &v.UserID, &v.Name, &v.CreatedAt, &v.UpdatedAt, &v.VersionRetentionDays)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrVaultNotFound
		}
		return nil, err
	}
	return v, nil
}

// ListVaults returns all vaults for a given user
func (d *DB) ListVaults(userID string) ([]models.Vault, error) {
	rows, err := d.conn.Query(
		"SELECT id, user_id, name, created_at, updated_at, version_retention_days FROM vaults WHERE user_id = ? ORDER BY name ASC",
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var vaults []models.Vault
	for rows.Next() {
		var v models.Vault
		if err := rows.Scan(&v.ID, &v.UserID, &v.Name, &v.CreatedAt, &v.UpdatedAt, &v.VersionRetentionDays); err != nil {
			return nil, err
		}
		vaults = append(vaults, v)
	}
	return vaults, rows.Err()
}

// GetManifestSince returns manifest items modified since cursor
func (d *DB) GetManifestSince(vaultID string, sinceCursor int64, limit int) (*models.ManifestResponse, error) {
	if limit <= 0 || limit > 1000 {
		limit = 500
	}

	// Fetch max cursor
	var maxCursor int64
	err := d.conn.QueryRow("SELECT COALESCE(MAX(cursor), 0) FROM changelog WHERE vault_id = ?", vaultID).Scan(&maxCursor)
	if err != nil {
		return nil, err
	}

	// Total active notes
	var totalNotes int
	_ = d.conn.QueryRow("SELECT COUNT(*) FROM manifest WHERE vault_id = ? AND deleted = 0", vaultID).Scan(&totalNotes)

	if sinceCursor <= 0 {
		// Full snapshot
		rows, err := d.conn.Query(`
			SELECT path, hash, size, mtime, version, deleted, updated_at
			FROM manifest
			WHERE vault_id = ?
			ORDER BY path ASC
			LIMIT ?
		`, vaultID, limit)
		if err != nil {
			return nil, err
		}
		defer rows.Close()

		items := make([]models.ManifestItem, 0)
		for rows.Next() {
			var it models.ManifestItem
			it.VaultID = vaultID
			var deletedInt int
			if err := rows.Scan(&it.Path, &it.Hash, &it.Size, &it.Mtime, &it.Version, &deletedInt, &it.UpdatedAt); err != nil {
				return nil, err
			}
			it.Deleted = deletedInt == 1
			items = append(items, it)
		}

		return &models.ManifestResponse{
			Cursor:    maxCursor,
			Items:     items,
			HasMore:   len(items) == limit,
			TotalNote: totalNotes,
		}, nil
	}

	// Incremental changelog since cursor
	rows, err := d.conn.Query(`
		SELECT cursor, path, hash, size, mtime, version, deleted, created_at
		FROM changelog
		WHERE vault_id = ? AND cursor > ?
		ORDER BY cursor ASC
		LIMIT ?
	`, vaultID, sinceCursor, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]models.ManifestItem, 0)
	currentCursor := sinceCursor
	for rows.Next() {
		var cur int64
		var it models.ManifestItem
		it.VaultID = vaultID
		var deletedInt int
		if err := rows.Scan(&cur, &it.Path, &it.Hash, &it.Size, &it.Mtime, &it.Version, &deletedInt, &it.UpdatedAt); err != nil {
			return nil, err
		}
		it.Deleted = deletedInt == 1
		items = append(items, it)
		if cur > currentCursor {
			currentCursor = cur
		}
	}

	return &models.ManifestResponse{
		Cursor:    currentCursor,
		Items:     items,
		HasMore:   len(items) == limit,
		TotalNote: totalNotes,
	}, nil
}

// ApplyPush atomically applies a batch of file changes with base version checking
func (d *DB) ApplyPush(vaultID string, changes []models.PushChange) (*models.PushResponse, error) {
	d.mu.Lock()
	defer d.mu.Unlock()

	tx, err := d.conn.Begin()
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	now := time.Now().UTC()
	var results []models.PushResult

	stmtCheckManifest, err := tx.Prepare(`
		SELECT hash, size, mtime, version, deleted
		FROM manifest
		WHERE vault_id = ? AND path = ?
	`)
	if err != nil {
		return nil, err
	}
	defer stmtCheckManifest.Close()

	stmtUpsertManifest, err := tx.Prepare(`
		INSERT INTO manifest (vault_id, path, hash, size, mtime, version, deleted, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(vault_id, path) DO UPDATE SET
			hash = excluded.hash,
			size = excluded.size,
			mtime = excluded.mtime,
			version = excluded.version,
			deleted = excluded.deleted,
			updated_at = excluded.updated_at
	`)
	if err != nil {
		return nil, err
	}
	defer stmtUpsertManifest.Close()

	stmtInsertChangelog, err := tx.Prepare(`
		INSERT INTO changelog (vault_id, path, hash, size, mtime, version, deleted, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return nil, err
	}
	defer stmtInsertChangelog.Close()

	stmtInsertHistory, err := tx.Prepare(`
		INSERT INTO version_history (vault_id, path, hash, size, mtime, version, deleted, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return nil, err
	}
	defer stmtInsertHistory.Close()

	for _, ch := range changes {
		var currentHash string
		var currentSize, currentMtime, currentVersion int64
		var currentDeleted int

		err := stmtCheckManifest.QueryRow(vaultID, ch.Path).Scan(
			&currentHash, &currentSize, &currentMtime, &currentVersion, &currentDeleted,
		)

		exists := err == nil
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("error querying manifest for %s: %w", ch.Path, err)
		}

		// Conflict detection:
		// If server has a newer version than client's base version, report conflict
		if exists && currentVersion > ch.BaseVersion {
			results = append(results, models.PushResult{
				Path:        ch.Path,
				Status:      "conflict",
				Version:     currentVersion,
				ServerHash:  currentHash,
				ServerMtime: currentMtime,
			})
			continue
		}

		// Determine new version
		newVersion := int64(1)
		if exists {
			newVersion = currentVersion + 1
		}

		deletedInt := 0
		if ch.Deleted {
			deletedInt = 1
		}

		// Update manifest
		if _, err := stmtUpsertManifest.Exec(
			vaultID, ch.Path, ch.Hash, ch.Size, ch.Mtime, newVersion, deletedInt, now,
		); err != nil {
			return nil, fmt.Errorf("failed to update manifest for %s: %w", ch.Path, err)
		}

		// Append to changelog
		if _, err := stmtInsertChangelog.Exec(
			vaultID, ch.Path, ch.Hash, ch.Size, ch.Mtime, newVersion, deletedInt, now,
		); err != nil {
			return nil, fmt.Errorf("failed to append changelog for %s: %w", ch.Path, err)
		}

		// Append to version history
		if _, err := stmtInsertHistory.Exec(
			vaultID, ch.Path, ch.Hash, ch.Size, ch.Mtime, newVersion, deletedInt, now,
		); err != nil {
			return nil, fmt.Errorf("failed to insert history for %s: %w", ch.Path, err)
		}

		results = append(results, models.PushResult{
			Path:    ch.Path,
			Status:  "applied",
			Version: newVersion,
		})
	}

	// Update vault updated_at
	if _, err := tx.Exec("UPDATE vaults SET updated_at = ? WHERE id = ?", now, vaultID); err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("failed to commit push transaction: %w", err)
	}

	var latestCursor int64
	_ = d.conn.QueryRow("SELECT COALESCE(MAX(cursor), 0) FROM changelog WHERE vault_id = ?", vaultID).Scan(&latestCursor)

	return &models.PushResponse{
		Results:   results,
		NewCursor: latestCursor,
	}, nil
}

// CleanOldVersions removes version history older than retentionDays
func (d *DB) CleanOldVersions(vaultID string, retentionDays int) (int64, error) {
	if retentionDays <= 0 {
		return 0, nil
	}
	cutoff := time.Now().UTC().AddDate(0, 0, -retentionDays)
	res, err := d.conn.Exec(`
		DELETE FROM version_history
		WHERE vault_id = ? AND created_at < ?
	`, vaultID, cutoff)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
