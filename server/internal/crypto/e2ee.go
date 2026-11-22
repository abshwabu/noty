package crypto

import (
	"crypto/rand"
	"crypto/subtle"
	"errors"
	"fmt"
	"io"

	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/chacha20poly1305"
)

var (
	ErrDecryptionFailed = errors.New("decryption failed: invalid key or corrupted ciphertext")
	ErrCiphertextTooShort = errors.New("ciphertext too short")
)

// DeriveKey derives a 32-byte encryption key from a passphrase and salt using Argon2id
func DeriveKey(passphrase string, salt []byte) []byte {
	return argon2.IDKey([]byte(passphrase), salt, 3, 64*1024, 2, chacha20poly1305.KeySize)
}

// EncryptXChaCha20Poly1305 encrypts plaintext using XChaCha20-Poly1305 with a 24-byte random nonce
// Output format: [24-byte Nonce][Ciphertext + 16-byte Poly1305 Tag]
func EncryptXChaCha20Poly1305(key, plaintext []byte) ([]byte, error) {
	if len(key) != chacha20poly1305.KeySize {
		return nil, fmt.Errorf("invalid key size: must be %d bytes", chacha20poly1305.KeySize)
	}

	aead, err := chacha20poly1305.NewX(key)
	if err != nil {
		return nil, fmt.Errorf("failed to create aead: %w", err)
	}

	nonce := make([]byte, aead.NonceSize()) // 24 bytes for XChaCha20
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("failed to generate nonce: %w", err)
	}

	ciphertext := aead.Seal(nonce, nonce, plaintext, nil)
	return ciphertext, nil
}

// DecryptXChaCha20Poly1305 decrypts ciphertext encrypted with EncryptXChaCha20Poly1305
func DecryptXChaCha20Poly1305(key, ciphertextWithNonce []byte) ([]byte, error) {
	if len(key) != chacha20poly1305.KeySize {
		return nil, fmt.Errorf("invalid key size: must be %d bytes", chacha20poly1305.KeySize)
	}

	aead, err := chacha20poly1305.NewX(key)
	if err != nil {
		return nil, fmt.Errorf("failed to create aead: %w", err)
	}

	if len(ciphertextWithNonce) < aead.NonceSize()+aead.Overhead() {
		return nil, ErrCiphertextTooShort
	}

	nonce := ciphertextWithNonce[:aead.NonceSize()]
	ciphertext := ciphertextWithNonce[aead.NonceSize():]

	plaintext, err := aead.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, ErrDecryptionFailed
	}

	return plaintext, nil
}

// SecureCompare performs a constant time equality check on byte slices
func SecureCompare(a, b []byte) bool {
	return subtle.ConstantTimeCompare(a, b) == 1
}
