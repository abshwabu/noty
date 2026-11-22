package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/noty/sync-server/internal/api"
	"github.com/noty/sync-server/internal/auth"
	"github.com/noty/sync-server/internal/db"
	"github.com/noty/sync-server/internal/storage"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	if len(os.Args) < 2 {
		runServe(logger, os.Args[1:])
		return
	}

	switch os.Args[1] {
	case "serve":
		runServe(logger, os.Args[2:])
	case "user":
		runUser(logger, os.Args[2:])
	case "device":
		runDevice(logger, os.Args[2:])
	case "backup":
		runBackup(logger, os.Args[2:])
	case "restore":
		runRestore(logger, os.Args[2:])
	case "help", "-h", "--help":
		printUsage()
	default:
		// Default to serve if flag starts with '-'
		if len(os.Args[1]) > 0 && os.Args[1][0] == '-' {
			runServe(logger, os.Args[1:])
			return
		}
		fmt.Fprintf(os.Stderr, "Unknown subcommand: %s\n\n", os.Args[1])
		printUsage()
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Println(`Noty Sync Server - Self-hosted Obsidian-compatible Sync Service

Commands:
  serve              Start the HTTP sync server (default)
    --port           Port to listen on (default: 8080 or $PORT)
    --data-dir       Storage directory for SQLite and blobs (default: ./data or $DATA_DIR)

  user create        Create the single owner user account
    --username       Username for the account
    --password       Account password (min 8 chars)
    --data-dir       Data directory

  device list        List all authorized devices
    --data-dir       Data directory

  device revoke      Revoke an authorized device token
    --id             Device ID to revoke
    --data-dir       Data directory

  backup             Create an atomic SQLite online backup
    --dest           Destination backup file path (.db)
    --data-dir       Data directory

  restore            Restore SQLite database from backup
    --src            Source backup file path (.db)
    --data-dir       Data directory`)
}

func getDataDir(flagVal string) string {
	if flagVal != "" {
		return flagVal
	}
	if env := os.Getenv("DATA_DIR"); env != "" {
		return env
	}
	return "./data"
}

func getPort(flagVal int) int {
	if flagVal > 0 {
		return flagVal
	}
	return 8080
}

func openStoreAndDB(dataDir string) (*db.DB, *storage.BlobStore, error) {
	dbPath := filepath.Join(dataDir, "noty.db")
	database, err := db.OpenDB(dbPath)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to open database: %w", err)
	}

	blobStore, err := storage.NewBlobStore(dataDir)
	if err != nil {
		database.Close()
		return nil, nil, fmt.Errorf("failed to initialize blob store: %w", err)
	}

	return database, blobStore, nil
}

func runServe(logger *slog.Logger, args []string) {
	fs := flag.NewFlagSet("serve", flag.ExitOnError)
	port := fs.Int("port", 8080, "Port to listen on")
	dataDir := fs.String("data-dir", "./data", "Directory to store database and blobs")
	_ = fs.Parse(args)

	finalDataDir := getDataDir(*dataDir)
	finalPort := getPort(*port)

	database, blobStore, err := openStoreAndDB(finalDataDir)
	if err != nil {
		logger.Error("Initialization failed", "error", err)
		os.Exit(1)
	}
	defer database.Close()

	// Backup runner
	backupDir := filepath.Join(finalDataDir, "backups")
	backupRunner, err := db.NewBackupRunner(database, backupDir, logger)
	if err != nil {
		logger.Error("Backup initialization failed", "error", err)
		os.Exit(1)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	backupRunner.StartNightlyBackup(ctx)

	cfg := api.Config{
		Port:           finalPort,
		DataDir:        finalDataDir,
		MaxRequestBody: 100 * 1024 * 1024,
		RateLimit:      50,
		RateBurst:      100,
	}

	srv := api.NewServer(cfg, database, blobStore, logger)

	// Graceful shutdown handling
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	go func() {
		if err := srv.Start(); err != nil && err != http.ErrServerClosed {
			logger.Error("Server error", "error", err)
			os.Exit(1)
		}
	}()

	logger.Info("Noty sync server running", "port", finalPort, "dataDir", finalDataDir)

	<-stop
	logger.Info("Shutting down sync server gracefully...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("Error during shutdown", "error", err)
	}
	logger.Info("Sync server stopped")
}

func runUser(logger *slog.Logger, args []string) {
	if len(args) == 0 || args[0] != "create" {
		fmt.Println("Usage: noty-sync user create --username <name> --password <pass> [--data-dir <dir>]")
		os.Exit(1)
	}

	fs := flag.NewFlagSet("user create", flag.ExitOnError)
	username := fs.String("username", "", "Username")
	password := fs.String("password", "", "Password")
	dataDir := fs.String("data-dir", "./data", "Data directory")
	_ = fs.Parse(args[1:])

	if *username == "" || len(*password) < 8 {
		fmt.Fprintln(os.Stderr, "Error: --username is required and --password must be at least 8 characters")
		os.Exit(1)
	}

	database, _, err := openStoreAndDB(getDataDir(*dataDir))
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	defer database.Close()

	hash, err := auth.HashPassword(*password, auth.DefaultArgon2Params())
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error hashing password: %v\n", err)
		os.Exit(1)
	}

	user, err := database.CreateUser("usr_cli_"+*username, *username, hash)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error creating user: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("User successfully created: ID=%s Username=%s\n", user.ID, user.Username)
}

func runDevice(logger *slog.Logger, args []string) {
	if len(args) == 0 {
		fmt.Println("Usage: noty-sync device [list|revoke]")
		os.Exit(1)
	}

	switch args[0] {
	case "list":
		fs := flag.NewFlagSet("device list", flag.ExitOnError)
		dataDir := fs.String("data-dir", "./data", "Data directory")
		_ = fs.Parse(args[1:])

		database, _, err := openStoreAndDB(getDataDir(*dataDir))
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		defer database.Close()

		// List all users to get their devices
		var userIDs []string
		rows, err := database.RawDB().Query("SELECT id, username FROM users")
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		defer rows.Close()

		for rows.Next() {
			var uid, uname string
			_ = rows.Scan(&uid, &uname)
			userIDs = append(userIDs, uid)
		}

		fmt.Printf("%-24s %-20s %-24s %-10s\n", "DEVICE ID", "NAME", "LAST SEEN", "STATUS")
		fmt.Println("---------------------------------------------------------------------------------")
		for _, uid := range userIDs {
			devs, _ := database.ListDevices(uid)
			for _, d := range devs {
				status := "ACTIVE"
				if d.RevokedAt != nil {
					status = "REVOKED"
				}
				fmt.Printf("%-24s %-20s %-24s %-10s\n", d.ID, d.Name, d.LastSeenAt.Format("2006-01-02 15:04:05"), status)
			}
		}

	case "revoke":
		fs := flag.NewFlagSet("device revoke", flag.ExitOnError)
		id := fs.String("id", "", "Device ID")
		dataDir := fs.String("data-dir", "./data", "Data directory")
		_ = fs.Parse(args[1:])

		if *id == "" {
			fmt.Fprintln(os.Stderr, "Error: --id is required")
			os.Exit(1)
		}

		database, _, err := openStoreAndDB(getDataDir(*dataDir))
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		defer database.Close()

		if err := database.RevokeDevice(*id); err != nil {
			fmt.Fprintf(os.Stderr, "Failed to revoke device: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("Device %s revoked successfully.\n", *id)

	default:
		fmt.Fprintf(os.Stderr, "Unknown device command: %s\n", args[0])
		os.Exit(1)
	}
}

func runBackup(logger *slog.Logger, args []string) {
	fs := flag.NewFlagSet("backup", flag.ExitOnError)
	dest := fs.String("dest", "", "Destination backup path")
	dataDir := fs.String("data-dir", "./data", "Data directory")
	_ = fs.Parse(args)

	finalDataDir := getDataDir(*dataDir)
	database, _, err := openStoreAndDB(finalDataDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	defer database.Close()

	runner, err := db.NewBackupRunner(database, filepath.Join(finalDataDir, "backups"), logger)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	if err := runner.CreateBackup(*dest); err != nil {
		fmt.Fprintf(os.Stderr, "Backup failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("Backup created successfully.")
}

func runRestore(logger *slog.Logger, args []string) {
	fs := flag.NewFlagSet("restore", flag.ExitOnError)
	src := fs.String("src", "", "Source backup database path")
	dataDir := fs.String("data-dir", "./data", "Data directory")
	_ = fs.Parse(args)

	if *src == "" {
		fmt.Fprintln(os.Stderr, "Error: --src is required")
		os.Exit(1)
	}

	targetDB := filepath.Join(getDataDir(*dataDir), "noty.db")
	if err := db.RestoreDatabase(*src, targetDB); err != nil {
		fmt.Fprintf(os.Stderr, "Restore failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Database successfully restored from %s to %s\n", *src, targetDB)
}
