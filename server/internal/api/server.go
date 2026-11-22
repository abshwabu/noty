package api

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"golang.org/x/time/rate"
	"github.com/noty/sync-server/internal/db"
	"github.com/noty/sync-server/internal/storage"
)

type Config struct {
	Port           int
	DataDir        string
	MaxRequestBody int64
	RateLimit      float64
	RateBurst      int
}

func DefaultConfig() Config {
	return Config{
		Port:           8080,
		DataDir:        "./data",
		MaxRequestBody: 100 * 1024 * 1024, // 100MB
		RateLimit:      50,                // 50 req/sec
		RateBurst:      100,
	}
}

type Server struct {
	cfg        Config
	db         *db.DB
	blobStore  *storage.BlobStore
	logger     *slog.Logger
	httpServer *http.Server
	startTime  time.Time
}

func NewServer(cfg Config, database *db.DB, store *storage.BlobStore, logger *slog.Logger) *Server {
	if logger == nil {
		logger = slog.Default()
	}
	return &Server{
		cfg:       cfg,
		db:        database,
		blobStore: store,
		logger:    logger,
		startTime: time.Now().UTC(),
	}
}

// Router sets up the API routes and middlewares
func (s *Server) Router() http.Handler {
	mux := http.NewServeMux()

	authH := NewAuthHandler(s.db)
	vaultH := NewVaultHandler(s.db)
	blobH := NewBlobHandler(s.blobStore)

	// Health check
	mux.HandleFunc("GET /healthz", HealthHandler(s.startTime))

	// Public Auth endpoints
	mux.HandleFunc("POST /api/v1/auth/register", authH.Register)
	mux.HandleFunc("POST /api/v1/auth/login", authH.Login)

	// Protected Endpoints
	authMW := AuthMiddleware(s.db)

	// Device management
	mux.Handle("GET /api/v1/auth/devices", authMW(http.HandlerFunc(authH.ListDevices)))
	mux.Handle("DELETE /api/v1/auth/devices/{id}", authMW(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		authH.RevokeDevice(w, r, id)
	})))

	// Vault management
	mux.Handle("GET /api/v1/vaults", authMW(http.HandlerFunc(vaultH.ListVaults)))
	mux.Handle("POST /api/v1/vaults", authMW(http.HandlerFunc(vaultH.CreateVault)))
	mux.Handle("GET /api/v1/vaults/{vaultId}/manifest", authMW(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		vaultID := r.PathValue("vaultId")
		vaultH.GetManifest(w, r, vaultID)
	})))
	mux.Handle("POST /api/v1/vaults/{vaultId}/push", authMW(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		vaultID := r.PathValue("vaultId")
		vaultH.Push(w, r, vaultID)
	})))

	// Blob management
	mux.Handle("GET /api/v1/blobs/{hash}", authMW(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hash := r.PathValue("hash")
		blobH.GetBlob(w, r, hash)
	})))
	mux.Handle("POST /api/v1/blobs", authMW(http.HandlerFunc(blobH.PutBlob)))
	mux.Handle("POST /api/v1/blobs/chunk", authMW(http.HandlerFunc(blobH.PutChunk)))
	mux.Handle("POST /api/v1/blobs/chunk/assemble", authMW(http.HandlerFunc(blobH.AssembleChunks)))

	// Apply Middlewares in chain:
	// Logging -> MaxBytes -> RateLimit -> Routes
	rateLimiter := NewIPRateLimiter(rate.Limit(s.cfg.RateLimit), s.cfg.RateBurst)

	handler := http.Handler(mux)
	handler = RateLimitMiddleware(rateLimiter)(handler)
	handler = MaxBytesMiddleware(s.cfg.MaxRequestBody)(handler)
	handler = LoggingMiddleware(s.logger)(handler)

	return handler
}

// Start launches the HTTP server
func (s *Server) Start() error {
	addr := fmt.Sprintf("0.0.0.0:%d", s.cfg.Port)
	s.httpServer = &http.Server{
		Addr:              addr,
		Handler:           s.Router(),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	s.logger.Info("Noty sync server listening", "addr", addr)
	return s.httpServer.ListenAndServe()
}

// Shutdown gracefully shuts down the HTTP server
func (s *Server) Shutdown(ctx context.Context) error {
	if s.httpServer != nil {
		return s.httpServer.Shutdown(ctx)
	}
	return nil
}
