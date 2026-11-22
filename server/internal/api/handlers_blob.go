package api

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"

	"github.com/noty/sync-server/internal/storage"
)

type BlobHandler struct {
	store *storage.BlobStore
}

func NewBlobHandler(store *storage.BlobStore) *BlobHandler {
	return &BlobHandler{store: store}
}

type BlobUploadResponse struct {
	Hash string `json:"hash"`
	Size int64  `json:"size"`
}

type AssembleChunkRequest struct {
	UploadID     string `json:"upload_id"`
	TotalChunks  int    `json:"total_chunks"`
	ExpectedHash string `json:"expected_hash"`
}

// GetBlob streams content-addressed blob data
func (h *BlobHandler) GetBlob(w http.ResponseWriter, r *http.Request, hash string) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	reader, size, err := h.store.Get(hash)
	if err != nil {
		if errors.Is(err, storage.ErrBlobNotFound) {
			http.Error(w, `{"error":"blob not found"}`, http.StatusNotFound)
			return
		}
		http.Error(w, `{"error":"internal server error"}`, http.StatusInternalServerError)
		return
	}
	defer reader.Close()

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Length", strconv.FormatInt(size, 10))
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")

	_, _ = io.Copy(w, reader)
}

// PutBlob stores an uploaded content-addressed blob
func (h *BlobHandler) PutBlob(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	hash, size, err := h.store.Put(r.Body)
	if err != nil {
		http.Error(w, `{"error":"failed to store blob"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(BlobUploadResponse{
		Hash: hash,
		Size: size,
	})
}

// PutChunk uploads a chunk of a large file
func (h *BlobHandler) PutChunk(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	uploadID := r.URL.Query().Get("upload_id")
	chunkIdxStr := r.URL.Query().Get("chunk_index")
	chunkIdx, err := strconv.Atoi(chunkIdxStr)
	if uploadID == "" || err != nil || chunkIdx < 0 {
		http.Error(w, `{"error":"valid upload_id and chunk_index query parameters required"}`, http.StatusBadRequest)
		return
	}

	chunkData, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, `{"error":"failed to read chunk payload"}`, http.StatusBadRequest)
		return
	}

	if err := h.store.PutChunk(uploadID, chunkIdx, chunkData); err != nil {
		http.Error(w, `{"error":"failed to write chunk"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

// AssembleChunks finalizes a chunked upload
func (h *BlobHandler) AssembleChunks(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req AssembleChunkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	if req.UploadID == "" || req.TotalChunks <= 0 {
		http.Error(w, `{"error":"upload_id and positive total_chunks required"}`, http.StatusBadRequest)
		return
	}

	hash, size, err := h.store.AssembleChunks(req.UploadID, req.TotalChunks, req.ExpectedHash)
	if err != nil {
		http.Error(w, `{"error":"failed to assemble chunks: `+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(BlobUploadResponse{
		Hash: hash,
		Size: size,
	})
}
