package models

import "time"

// User represents the single owner account
type User struct {
	ID           string    `json:"id"`
	Username     string    `json:"username"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
}

// Device represents an authorized client device
type Device struct {
	ID         string     `json:"id"`
	UserID     string     `json:"user_id"`
	Name       string     `json:"name"`
	TokenHash  string     `json:"-"`
	LastSeenAt time.Time  `json:"last_seen_at"`
	CreatedAt  time.Time  `json:"created_at"`
	RevokedAt  *time.Time `json:"revoked_at,omitempty"`
}

// Vault represents a user notebook vault
type Vault struct {
	ID                   string    `json:"id"`
	UserID               string    `json:"user_id"`
	Name                 string    `json:"name"`
	CreatedAt            time.Time `json:"created_at"`
	UpdatedAt            time.Time `json:"updated_at"`
	VersionRetentionDays int       `json:"version_retention_days"`
}

// ManifestItem represents an entry in a vault's file manifest
type ManifestItem struct {
	VaultID   string    `json:"vault_id,omitempty"`
	Path      string    `json:"path"`
	Hash      string    `json:"hash"`
	Size      int64     `json:"size"`
	Mtime     int64     `json:"mtime"` // Unix millisecond or second timestamp
	Version   int64     `json:"version"`
	Deleted   bool      `json:"deleted"`
	UpdatedAt time.Time `json:"updated_at"`
}

// PushChange represents an incoming change from a client
type PushChange struct {
	Path        string `json:"path"`
	Hash        string `json:"hash"`
	Size        int64  `json:"size"`
	Mtime       int64  `json:"mtime"`
	BaseVersion int64  `json:"base_version"`
	Deleted     bool   `json:"deleted"`
}

// PushResult represents the outcome for an individual file change
type PushResult struct {
	Path        string `json:"path"`
	Status      string `json:"status"` // "applied", "conflict", "skipped"
	Version     int64  `json:"version"`
	ServerHash  string `json:"server_hash,omitempty"`
	ServerMtime int64  `json:"server_mtime,omitempty"`
}

// PushResponse represents the overall response from POST /push
type PushResponse struct {
	Results   []PushResult `json:"results"`
	NewCursor int64        `json:"new_cursor"`
}

// ManifestResponse represents the response from GET /manifest
type ManifestResponse struct {
	Cursor    int64          `json:"cursor"`
	Items     []ManifestItem `json:"items"`
	HasMore   bool           `json:"has_more"`
	TotalNote int            `json:"total_notes"`
}
