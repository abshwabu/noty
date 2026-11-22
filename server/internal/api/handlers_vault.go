package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/noty/sync-server/internal/db"
	"github.com/noty/sync-server/internal/models"
)

type VaultHandler struct {
	db *db.DB
}

func NewVaultHandler(database *db.DB) *VaultHandler {
	return &VaultHandler{db: database}
}

type CreateVaultRequest struct {
	Name                 string `json:"name"`
	VersionRetentionDays int    `json:"version_retention_days"`
}

// ListVaults lists vaults belonging to user
func (h *VaultHandler) ListVaults(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	user := GetUserFromContext(r.Context())
	vaults, err := h.db.ListVaults(user.ID)
	if err != nil {
		http.Error(w, `{"error":"failed to fetch vaults"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(vaults)
}

// CreateVault creates a new vault
func (h *VaultHandler) CreateVault(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req CreateVaultRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		http.Error(w, `{"error":"vault name is required"}`, http.StatusBadRequest)
		return
	}

	user := GetUserFromContext(r.Context())
	vaultID := generateID("vlt")

	vault, err := h.db.CreateVault(vaultID, user.ID, req.Name, req.VersionRetentionDays)
	if err != nil {
		http.Error(w, `{"error":"vault creation failed or name already exists"}`, http.StatusConflict)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(vault)
}

// GetManifest retrieves vault manifest (snapshot or delta since cursor)
func (h *VaultHandler) GetManifest(w http.ResponseWriter, r *http.Request, vaultID string) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	user := GetUserFromContext(r.Context())
	vault, err := h.db.GetVault(vaultID)
	if err != nil || vault.UserID != user.ID {
		http.Error(w, `{"error":"vault not found or access denied"}`, http.StatusNotFound)
		return
	}

	sinceStr := r.URL.Query().Get("since")
	var sinceCursor int64
	if sinceStr != "" {
		sinceCursor, _ = strconv.ParseInt(sinceStr, 10, 64)
	}

	limit := 500
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	resp, err := h.db.GetManifestSince(vaultID, sinceCursor, limit)
	if err != nil {
		http.Error(w, `{"error":"failed to load manifest"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

// Push applies a batch of file changes with base-version checking
func (h *VaultHandler) Push(w http.ResponseWriter, r *http.Request, vaultID string) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	user := GetUserFromContext(r.Context())
	vault, err := h.db.GetVault(vaultID)
	if err != nil || vault.UserID != user.ID {
		http.Error(w, `{"error":"vault not found or access denied"}`, http.StatusNotFound)
		return
	}

	var changes []models.PushChange
	if err := json.NewDecoder(r.Body).Decode(&changes); err != nil {
		http.Error(w, `{"error":"invalid json body"}`, http.StatusBadRequest)
		return
	}

	resp, err := h.db.ApplyPush(vaultID, changes)
	if err != nil {
		http.Error(w, `{"error":"failed to apply push batch"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}
