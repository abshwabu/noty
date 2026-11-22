# End-to-End Encryption (E2EE) Architecture

## Overview
Noty supports an optional zero-knowledge, End-to-End Encryption (E2EE) mode. When E2EE is enabled for a vault, all note contents and attachment blobs are encrypted on the client device before transmission over the network. The sync server stores only ciphertext blobs and encrypted metadata:
- The server **never** receives or stores the vault passphrase.
- The server **never** possesses the derived encryption keys.
- Even with direct physical or root access to the server disk and database, note contents and media cannot be decrypted without the user's passphrase.

---

## Cryptographic Primitives

| Purpose | Algorithm / Primitive | Parameters |
| :--- | :--- | :--- |
| **Key Derivation** | Argon2id | Memory: 64 MB, Iterations: 3, Parallelism: 2, Key size: 32 bytes (256-bit) |
| **Authenticated Encryption** | XChaCha20-Poly1305 | 256-bit key, 192-bit (24-byte) random nonce, 128-bit Poly1305 MAC tag |
| **Content Addressing** | SHA-256 | Content hash computed over ciphertext payload |
| **Passphrase Entropy** | BIP-39 mnemonic / 12-word phrase or high-entropy passphrase | 128+ bits entropy |

---

## Key Derivation (Argon2id)

Each E2EE vault has a unique 16-byte cryptographically secure random salt generated at vault initialization:

```
VaultKey = Argon2id(
    Passphrase: UserMasterPassphrase,
    Salt:       VaultSalt,
    Memory:     64 MB,
    Iterations: 3,
    Parallel:   2,
    KeyLength:  32 bytes
)
```

The `VaultSalt` is stored in the vault metadata so any authorized client device belonging to the user can derive the identical `VaultKey` after entering the passphrase.

---

## File and Blob Encryption

### Envelope Structure
Every encrypted payload written to the blob store adheres to the following binary envelope:

```
+-----------------------------------+--------------------------------------------+
| 24-byte XChaCha20 Nonce (Random)  | Ciphertext + 16-byte Poly1305 Auth Tag     |
+-----------------------------------+--------------------------------------------+
```

1. **Nonce Generation**: A fresh, cryptographically secure 24-byte random nonce (`crypto/rand`) is generated for every write. The extended 192-bit nonce space of XChaCha20 eliminates nonce-collision risks even with billions of encrypted files.
2. **Encryption**: The plaintext note or attachment is encrypted and authenticated using `XChaCha20-Poly1305` using the 32-byte `VaultKey`.
3. **Envelope Packaging**: The 24-byte nonce is prepended directly to the resulting ciphertext and authentication tag.
4. **Content-Addressing**: The client hashes the entire envelope using SHA-256 (`Hash = SHA-256(Envelope)`).
5. **Transmission**: The client uploads the ciphertext envelope to `POST /api/v1/blobs` and updates the manifest via `POST /api/v1/vaults/:id/push`.

---

## Zero-Knowledge Server Verification

- **Integrity**: The server verifies that the uploaded blob matches the claimed SHA-256 hash before storing it.
- **De-duplication**: Identical encrypted versions produce matching content-addressed hashes.
- **Tombstones & Revisions**: Manifest updates record the encrypted file's version, size, and timestamp. The server maintains conflict resolution and revision trees without parsing file contents.

---

## Key Rotation and Device Recovery

1. **Adding a New Device**:
   - The user authorizes the new device using account credentials.
   - The user inputs the vault passphrase.
   - The client derives the `VaultKey` locally and decrypts incoming blobs pulled from the server.
2. **Passphrase Change / Key Rotation**:
   - The client generates a new `VaultSalt` and derives `NewVaultKey`.
   - The client iterates active notes, re-encrypts payloads with `NewVaultKey`, and pushes a bulk batch of updated blobs.
   - Previous versions in version history can be pruned or preserved according to the vault's retention policy.
