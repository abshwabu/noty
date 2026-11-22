package api

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/noty/sync-server/internal/auth"
	"github.com/noty/sync-server/internal/db"
	"github.com/noty/sync-server/internal/models"
)

type AuthHandler struct {
	db *db.DB
}

func NewAuthHandler(database *db.DB) *AuthHandler {
	return &AuthHandler{db: database}
}

type RegisterRequest struct {
	Username   string `json:"username"`
	Password   string `json:"password"`
	DeviceName string `json:"device_name"`
}

type LoginRequest struct {
	Username   string `json:"username"`
	Password   string `json:"password"`
	DeviceName string `json:"device_name"`
}

type AuthResponse struct {
	Token  string         `json:"token"`
	Device *models.Device `json:"device"`
	User   *models.User   `json:"user"`
}

func generateID(prefix string) string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return prefix + "_" + hex.EncodeToString(b)
}

// Register handles first-run single owner creation
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" || len(req.Password) < 8 {
		http.Error(w, `{"error":"username required and password must be at least 8 characters"}`, http.StatusBadRequest)
		return
	}

	passwordHash, err := auth.HashPassword(req.Password, auth.DefaultArgon2Params())
	if err != nil {
		http.Error(w, `{"error":"failed to hash password"}`, http.StatusInternalServerError)
		return
	}

	userID := generateID("usr")
	user, err := h.db.CreateUser(userID, req.Username, passwordHash)
	if err != nil {
		if err == db.ErrSingleOwnerLimit {
			http.Error(w, `{"error":"registration is closed: owner account already configured"}`, http.StatusForbidden)
			return
		}
		http.Error(w, `{"error":"failed to create user"}`, http.StatusInternalServerError)
		return
	}

	// Create initial device token
	deviceName := strings.TrimSpace(req.DeviceName)
	if deviceName == "" {
		deviceName = "Initial Device"
	}

	rawToken, err := auth.GenerateDeviceToken()
	if err != nil {
		http.Error(w, `{"error":"failed to generate token"}`, http.StatusInternalServerError)
		return
	}
	tokenHash := auth.HashToken(rawToken)

	deviceID := generateID("dev")
	dev, err := h.db.CreateDevice(deviceID, user.ID, deviceName, tokenHash)
	if err != nil {
		http.Error(w, `{"error":"failed to create initial device"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(AuthResponse{
		Token:  rawToken,
		Device: dev,
		User:   user,
	})
}

// Login verifies password and generates a new device token
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	user, err := h.db.GetUserByUsername(strings.TrimSpace(req.Username))
	if err != nil {
		http.Error(w, `{"error":"invalid username or password"}`, http.StatusUnauthorized)
		return
	}

	ok, err := auth.VerifyPassword(req.Password, user.PasswordHash)
	if err != nil || !ok {
		http.Error(w, `{"error":"invalid username or password"}`, http.StatusUnauthorized)
		return
	}

	deviceName := strings.TrimSpace(req.DeviceName)
	if deviceName == "" {
		deviceName = "Device"
	}

	rawToken, err := auth.GenerateDeviceToken()
	if err != nil {
		http.Error(w, `{"error":"failed to generate device token"}`, http.StatusInternalServerError)
		return
	}
	tokenHash := auth.HashToken(rawToken)

	deviceID := generateID("dev")
	dev, err := h.db.CreateDevice(deviceID, user.ID, deviceName, tokenHash)
	if err != nil {
		http.Error(w, `{"error":"failed to register device"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(AuthResponse{
		Token:  rawToken,
		Device: dev,
		User:   user,
	})
}

// ListDevices returns all devices for authenticated user
func (h *AuthHandler) ListDevices(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	user := GetUserFromContext(r.Context())
	devices, err := h.db.ListDevices(user.ID)
	if err != nil {
		http.Error(w, `{"error":"failed to list devices"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(devices)
}

// RevokeDevice revokes a device token
func (h *AuthHandler) RevokeDevice(w http.ResponseWriter, r *http.Request, deviceID string) {
	if r.Method != http.MethodDelete && r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	if err := h.db.RevokeDevice(deviceID); err != nil {
		if err == db.ErrDeviceNotFound {
			http.Error(w, `{"error":"device not found"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error":"failed to revoke device"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"revoked": true})
}
