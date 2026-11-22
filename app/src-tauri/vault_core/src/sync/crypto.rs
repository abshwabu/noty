// Client-side End-to-End Encryption (XChaCha20-Poly1305 + Argon2id)

use argon2::Argon2;
use chacha20poly1305::{
    aead::{Aead, KeyInit, OsRng, rand_core::RngCore},
    XChaCha20Poly1305, XNonce,
};

/// Derives a 32-byte key from passphrase and salt using Argon2id
pub fn derive_vault_key(passphrase: &str, salt: &[u8]) -> Result<[u8; 32], String> {
    if salt.len() < 8 {
        return Err("Salt too short: must be at least 8 bytes".to_string());
    }

    let argon2 = Argon2::default();
    let mut key = [0u8; 32];
    argon2
        .hash_password_into(passphrase.as_bytes(), salt, &mut key)
        .map_err(|e| format!("Argon2 key derivation failed: {}", e))?;

    Ok(key)
}

/// Encrypts plaintext bytes using XChaCha20-Poly1305
/// Format: [24-byte Nonce][Ciphertext + 16-byte Poly1305 tag]
pub fn encrypt_payload(key: &[u8; 32], plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = XChaCha20Poly1305::new_from_slice(key)
        .map_err(|e| format!("Invalid key for cipher: {}", e))?;

    // Generate random 24-byte nonce
    let mut nonce_bytes = [0u8; 24];
    OsRng.fill_bytes(&mut nonce_bytes);

    let nonce = XNonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| format!("Encryption failed: {}", e))?;

    let mut result = Vec::with_capacity(24 + ciphertext.len());
    result.extend_from_slice(&nonce_bytes);
    result.extend_from_slice(&ciphertext);

    Ok(result)
}

/// Decrypts ciphertext bytes produced by `encrypt_payload`
pub fn decrypt_payload(key: &[u8; 32], payload: &[u8]) -> Result<Vec<u8>, String> {
    if payload.len() < 24 + 16 {
        return Err("Payload too short for XChaCha20-Poly1305 envelope".to_string());
    }

    let nonce_bytes = &payload[..24];
    let ciphertext = &payload[24..];

    let cipher = XChaCha20Poly1305::new_from_slice(key)
        .map_err(|e| format!("Invalid key for cipher: {}", e))?;

    let nonce = XNonce::from_slice(nonce_bytes);
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| "Decryption failed: corrupted ciphertext or invalid passphrase".to_string())?;

    Ok(plaintext)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_e2ee_encrypt_decrypt_roundtrip() {
        let passphrase = "my-secret-vault-passphrase";
        let salt = b"noty-vault-salt-123";
        let key = derive_vault_key(passphrase, salt).unwrap();

        let original = b"# Secret Note\nThis should be encrypted!";
        let ciphertext = encrypt_payload(&key, original).unwrap();

        assert_ne!(ciphertext.as_slice(), original.as_slice());
        assert!(ciphertext.len() > original.len() + 24);

        let decrypted = decrypt_payload(&key, &ciphertext).unwrap();
        assert_eq!(decrypted, original);
    }
}
