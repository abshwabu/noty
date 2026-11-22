package db

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"time"
)

// BackupRunner handles SQLite VACUUM INTO operations and nightly scheduling
type BackupRunner struct {
	db        *DB
	backupDir string
	logger    *slog.Logger
}

// NewBackupRunner creates a new backup runner
func NewBackupRunner(db *DB, backupDir string, logger *slog.Logger) (*BackupRunner, error) {
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create backup dir: %w", err)
	}
	if logger == nil {
		logger = slog.Default()
	}
	return &BackupRunner{
		db:        db,
		backupDir: backupDir,
		logger:    logger,
	}, nil
}

// CreateBackup performs an atomic online backup using VACUUM INTO
func (b *BackupRunner) CreateBackup(destPath string) error {
	if destPath == "" {
		timestamp := time.Now().UTC().Format("20060102-150405")
		destPath = filepath.Join(b.backupDir, fmt.Sprintf("noty-sync-backup-%s.db", timestamp))
	}

	if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
		return err
	}

	// Remove destPath if it already exists because VACUUM INTO requires the target file not to exist
	_ = os.Remove(destPath)

	b.logger.Info("Starting database backup", "destination", destPath)

	// SQLite VACUUM INTO executes an online consistent snapshot into the destination file
	query := fmt.Sprintf("VACUUM INTO '%s'", destPath)
	if _, err := b.db.RawDB().Exec(query); err != nil {
		return fmt.Errorf("sqlite vacuum backup failed: %w", err)
	}

	b.logger.Info("Database backup completed successfully", "destination", destPath)
	return nil
}

// RestoreDatabase restores the database from a backup file to targetPath
func RestoreDatabase(srcBackupPath, targetDbPath string) error {
	src, err := os.Open(srcBackupPath)
	if err != nil {
		return fmt.Errorf("cannot open backup file: %w", err)
	}
	defer src.Close()

	if err := os.MkdirAll(filepath.Dir(targetDbPath), 0755); err != nil {
		return err
	}

	// Remove WAL and SHM if present
	_ = os.Remove(targetDbPath + "-wal")
	_ = os.Remove(targetDbPath + "-shm")

	tempTarget := targetDbPath + ".restoring"
	dst, err := os.Create(tempTarget)
	if err != nil {
		return fmt.Errorf("cannot create target db file: %w", err)
	}
	defer dst.Close()

	if _, err := io.Copy(dst, src); err != nil {
		_ = os.Remove(tempTarget)
		return fmt.Errorf("failed to copy backup to target: %w", err)
	}

	dst.Close()

	if err := os.Rename(tempTarget, targetDbPath); err != nil {
		return fmt.Errorf("failed to replace target db: %w", err)
	}

	return nil
}

// StartNightlyBackup starts a background goroutine that performs a backup every 24 hours
func (b *BackupRunner) StartNightlyBackup(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				b.logger.Info("Stopping nightly backup worker")
				return
			case <-ticker.C:
				if err := b.CreateBackup(""); err != nil {
					b.logger.Error("Nightly backup failed", "error", err)
				}
			}
		}
	}()
}
