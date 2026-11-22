package storage

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
)

var (
	ErrBlobNotFound   = errors.New("blob not found")
	ErrHashMismatch   = errors.New("blob hash does not match computed sha256")
	ErrInvalidChunk   = errors.New("invalid chunk or upload not found")
)

// BlobStore manages content-addressed storage on disk
type BlobStore struct {
	baseDir  string
	tempDir  string
	chunkDir string
	mu       sync.RWMutex
}

// NewBlobStore initializes a blob store inside baseDir
func NewBlobStore(baseDir string) (*BlobStore, error) {
	tempDir := filepath.Join(baseDir, ".temp")
	chunkDir := filepath.Join(baseDir, ".chunks")
	blobsDir := filepath.Join(baseDir, "blobs")

	for _, dir := range []string{baseDir, tempDir, chunkDir, blobsDir} {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return nil, fmt.Errorf("failed to create directory %s: %w", dir, err)
		}
	}

	return &BlobStore{
		baseDir:  blobsDir,
		tempDir:  tempDir,
		chunkDir: chunkDir,
	}, nil
}

func (s *BlobStore) blobPath(hash string) string {
	if len(hash) < 4 {
		return filepath.Join(s.baseDir, hash)
	}
	// Partition by first 4 characters: blobs/ab/cd/abcdef...
	return filepath.Join(s.baseDir, hash[0:2], hash[2:4], hash)
}

// Put writes data from reader into content-addressed storage and verifies SHA-256
func (s *BlobStore) Put(r io.Reader) (hash string, size int64, err error) {
	tempFile, err := os.CreateTemp(s.tempDir, "blob-*")
	if err != nil {
		return "", 0, fmt.Errorf("failed to create temp file: %w", err)
	}
	tempPath := tempFile.Name()
	defer func() {
		tempFile.Close()
		os.Remove(tempPath)
	}()

	hasher := sha256.New()
	multiWriter := io.MultiWriter(tempFile, hasher)

	written, err := io.Copy(multiWriter, r)
	if err != nil {
		return "", 0, fmt.Errorf("failed to write blob: %w", err)
	}

	hash = hex.EncodeToString(hasher.Sum(nil))
	finalPath := s.blobPath(hash)

	// If already exists, we are done
	if _, err := os.Stat(finalPath); err == nil {
		return hash, written, nil
	}

	if err := os.MkdirAll(filepath.Dir(finalPath), 0755); err != nil {
		return "", 0, fmt.Errorf("failed to create blob subdir: %w", err)
	}

	if err := os.Rename(tempPath, finalPath); err != nil {
		// Fallback to copy if cross-device link
		if err := copyFile(tempPath, finalPath); err != nil {
			return "", 0, fmt.Errorf("failed to move blob to final path: %w", err)
		}
	}

	return hash, written, nil
}

// Get retrieves a reader for the blob
func (s *BlobStore) Get(hash string) (io.ReadCloser, int64, error) {
	path := s.blobPath(hash)
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, 0, ErrBlobNotFound
		}
		return nil, 0, err
	}

	file, err := os.Open(path)
	if err != nil {
		return nil, 0, err
	}

	return file, info.Size(), nil
}

// Exists checks if a blob with the given hash exists
func (s *BlobStore) Exists(hash string) bool {
	path := s.blobPath(hash)
	_, err := os.Stat(path)
	return err == nil
}

// PutChunk stores an individual chunk for an in-progress upload
func (s *BlobStore) PutChunk(uploadID string, chunkIndex int, data []byte) error {
	dir := filepath.Join(s.chunkDir, uploadID)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	chunkPath := filepath.Join(dir, fmt.Sprintf("chunk-%05d", chunkIndex))
	return os.WriteFile(chunkPath, data, 0644)
}

// AssembleChunks concatenates all chunks, verifies expected hash, and saves as a final blob
func (s *BlobStore) AssembleChunks(uploadID string, totalChunks int, expectedHash string) (string, int64, error) {
	dir := filepath.Join(s.chunkDir, uploadID)
	defer os.RemoveAll(dir)

	tempFile, err := os.CreateTemp(s.tempDir, "chunk-assemble-*")
	if err != nil {
		return "", 0, err
	}
	tempPath := tempFile.Name()
	defer func() {
		tempFile.Close()
		os.Remove(tempPath)
	}()

	hasher := sha256.New()
	multiWriter := io.MultiWriter(tempFile, hasher)

	var totalSize int64
	for i := 0; i < totalChunks; i++ {
		chunkPath := filepath.Join(dir, fmt.Sprintf("chunk-%05d", i))
		chunkData, err := os.ReadFile(chunkPath)
		if err != nil {
			return "", 0, fmt.Errorf("%w: chunk %d missing", ErrInvalidChunk, i)
		}

		n, err := multiWriter.Write(chunkData)
		if err != nil {
			return "", 0, err
		}
		totalSize += int64(n)
	}

	actualHash := hex.EncodeToString(hasher.Sum(nil))
	if expectedHash != "" && actualHash != expectedHash {
		return "", 0, fmt.Errorf("%w: expected %s got %s", ErrHashMismatch, expectedHash, actualHash)
	}

	finalPath := s.blobPath(actualHash)
	if _, err := os.Stat(finalPath); err == nil {
		return actualHash, totalSize, nil
	}

	if err := os.MkdirAll(filepath.Dir(finalPath), 0755); err != nil {
		return "", 0, err
	}

	if err := os.Rename(tempPath, finalPath); err != nil {
		if err := copyFile(tempPath, finalPath); err != nil {
			return "", 0, err
		}
	}

	return actualHash, totalSize, nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}
