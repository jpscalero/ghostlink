/**
 * GhostLink — Crypto Helpers
 * v0.0.0.1
 * 
 * Funciones criptográficas de alto nivel construidas sobre libsodium.
 * Ningún otro archivo de la app debería usar sodium directamente.
 * Todo pasa por aquí.
 */

import { getSodium, requireSodium } from './sodium-init.js';

// ═══════════════════════════════════════════════════════
// INICIALIZACIÓN
// ═══════════════════════════════════════════════════════

/**
 * Inicializa el motor criptográfico. DEBE llamarse antes de cualquier otra función.
 * @returns {Promise<void>}
 */
export async function initCrypto() {
  await getSodium();
}

// ═══════════════════════════════════════════════════════
// KEYPAIRS
// ═══════════════════════════════════════════════════════

/**
 * Genera un keypair Ed25519 para firma digital.
 * @returns {{ publicKey: Uint8Array, privateKey: Uint8Array }}
 */
export function generateSigningKeyPair() {
  const sodium = requireSodium();
  const kp = sodium.crypto_sign_keypair();
  return {
    publicKey: kp.publicKey,
    privateKey: kp.privateKey,
  };
}

/**
 * Genera un keypair X25519 para Diffie-Hellman key exchange.
 * @returns {{ publicKey: Uint8Array, privateKey: Uint8Array }}
 */
export function generateDHKeyPair() {
  const sodium = requireSodium();
  const kp = sodium.crypto_box_keypair();
  return {
    publicKey: kp.publicKey,
    privateKey: kp.privateKey,
  };
}

/**
 * Convierte un Ed25519 public key a X25519 (para poder hacer DH con signing keys).
 * @param {Uint8Array} edPublicKey
 * @returns {Uint8Array}
 */
export function edToX25519Public(edPublicKey) {
  const sodium = requireSodium();
  return sodium.crypto_sign_ed25519_pk_to_curve25519(edPublicKey);
}

/**
 * Convierte un Ed25519 private key a X25519.
 * @param {Uint8Array} edPrivateKey
 * @returns {Uint8Array}
 */
export function edToX25519Private(edPrivateKey) {
  const sodium = requireSodium();
  return sodium.crypto_sign_ed25519_sk_to_curve25519(edPrivateKey);
}

// ═══════════════════════════════════════════════════════
// CIFRADO SIMÉTRICO — XChaCha20-Poly1305 (AEAD)
// ═══════════════════════════════════════════════════════

/**
 * Cifra datos con XChaCha20-Poly1305 (AEAD).
 * Genera un nonce aleatorio automáticamente.
 * 
 * @param {Uint8Array|string} plaintext - Datos a cifrar
 * @param {Uint8Array} key - Clave de 32 bytes
 * @param {Uint8Array} [additionalData] - Datos adicionales autenticados (no cifrados)
 * @returns {{ ciphertext: Uint8Array, nonce: Uint8Array }}
 */
export function encrypt(plaintext, key, additionalData = null) {
  const sodium = requireSodium();

  const data = typeof plaintext === 'string'
    ? sodium.from_string(plaintext)
    : plaintext;

  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);

  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    data,
    additionalData,
    null, // nsec (no usado, siempre null)
    nonce,
    key
  );

  return { ciphertext, nonce };
}

/**
 * Descifra datos cifrados con XChaCha20-Poly1305.
 * 
 * @param {Uint8Array} ciphertext - Datos cifrados
 * @param {Uint8Array} nonce - Nonce usado al cifrar
 * @param {Uint8Array} key - Clave de 32 bytes
 * @param {Uint8Array} [additionalData] - Datos adicionales autenticados
 * @returns {Uint8Array} Datos descifrados
 * @throws Si la autenticación falla (datos manipulados)
 */
export function decrypt(ciphertext, nonce, key, additionalData = null) {
  const sodium = requireSodium();

  return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null, // nsec
    ciphertext,
    additionalData,
    nonce,
    key
  );
}

/**
 * Descifra y retorna como string UTF-8.
 * @param {Uint8Array} ciphertext
 * @param {Uint8Array} nonce
 * @param {Uint8Array} key
 * @param {Uint8Array} [additionalData]
 * @returns {string}
 */
export function decryptToString(ciphertext, nonce, key, additionalData = null) {
  const sodium = requireSodium();
  const decrypted = decrypt(ciphertext, nonce, key, additionalData);
  return sodium.to_string(decrypted);
}

// ═══════════════════════════════════════════════════════
// FIRMA DIGITAL — Ed25519
// ═══════════════════════════════════════════════════════

/**
 * Firma datos con Ed25519.
 * @param {Uint8Array|string} message - Mensaje a firmar
 * @param {Uint8Array} privateKey - Ed25519 private key (64 bytes)
 * @returns {Uint8Array} Firma de 64 bytes
 */
export function sign(message, privateKey) {
  const sodium = requireSodium();
  const data = typeof message === 'string'
    ? sodium.from_string(message)
    : message;
  return sodium.crypto_sign_detached(data, privateKey);
}

/**
 * Verifica una firma Ed25519.
 * @param {Uint8Array} signature - Firma de 64 bytes
 * @param {Uint8Array|string} message - Mensaje original
 * @param {Uint8Array} publicKey - Ed25519 public key (32 bytes)
 * @returns {boolean} true si la firma es válida
 */
export function verify(signature, message, publicKey) {
  const sodium = requireSodium();
  const data = typeof message === 'string'
    ? sodium.from_string(message)
    : message;
  return sodium.crypto_sign_verify_detached(signature, data, publicKey);
}

// ═══════════════════════════════════════════════════════
// HASHING
// ═══════════════════════════════════════════════════════

/**
 * SHA-256 hash.
 * @param {Uint8Array|string} data
 * @returns {Uint8Array} Hash de 32 bytes
 */
export function sha256(data) {
  const sodium = requireSodium();
  const input = typeof data === 'string'
    ? sodium.from_string(data)
    : data;
  return sodium.crypto_hash_sha256(input);
}

/**
 * BLAKE2b hash (más rápido que SHA-256, usado internamente).
 * @param {Uint8Array|string} data
 * @param {number} [hashLength=32] - Longitud del hash (16-64 bytes)
 * @param {Uint8Array} [key] - Clave opcional para keyed hash (HMAC-like)
 * @returns {Uint8Array}
 */
export function blake2b(data, hashLength = 32, key = null) {
  const sodium = requireSodium();
  const input = typeof data === 'string'
    ? sodium.from_string(data)
    : data;
  return sodium.crypto_generichash(hashLength, input, key);
}

// ═══════════════════════════════════════════════════════
// KEY DERIVATION — Argon2id + HKDF
// ═══════════════════════════════════════════════════════

/**
 * Deriva una clave criptográfica desde una passphrase usando Argon2id.
 * Lento por diseño: resistente a brute-force.
 * 
 * @param {string} passphrase - Contraseña del usuario
 * @param {Uint8Array} [salt] - Salt de 16 bytes (genera uno si no se proporciona)
 * @param {number} [keyLength=32] - Longitud de la clave derivada
 * @param {number} [opsLimit] - Iteraciones (default: MODERATE)
 * @param {number} [memLimit] - Memoria en bytes (default: MODERATE)
 * @returns {{ key: Uint8Array, salt: Uint8Array }}
 */
export function deriveKeyFromPassphrase(passphrase, salt = null, keyLength = 32, opsLimit = null, memLimit = null) {
  const sodium = requireSodium();

  const actualSalt = salt || sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
  const ops = opsLimit || sodium.crypto_pwhash_OPSLIMIT_MODERATE;
  const mem = memLimit || sodium.crypto_pwhash_MEMLIMIT_MODERATE;

  const key = sodium.crypto_pwhash(
    keyLength,
    passphrase,
    actualSalt,
    ops,
    mem,
    sodium.crypto_pwhash_ALG_ARGON2ID13
  );

  return { key, salt: actualSalt };
}

/**
 * HKDF-like key derivation usando BLAKE2b.
 * Deriva múltiples claves desde un material de entrada.
 * 
 * @param {Uint8Array} inputKeyMaterial - Material de entrada (ej: shared secret de DH)
 * @param {Uint8Array} salt - Salt (puede ser constante conocida)
 * @param {string|Uint8Array} info - Contexto/propósito de la clave derivada
 * @param {number} [keyLength=32] - Longitud de la clave derivada
 * @returns {Uint8Array}
 */
export function hkdfDerive(inputKeyMaterial, salt, info, keyLength = 32) {
  const sodium = requireSodium();

  // Extract: PRK = BLAKE2b(salt, IKM)
  const prk = sodium.crypto_generichash(32, inputKeyMaterial, salt);

  // Expand: OKM = BLAKE2b(PRK, info)
  const infoBytes = typeof info === 'string'
    ? sodium.from_string(info)
    : info;

  const combined = new Uint8Array(prk.length + infoBytes.length);
  combined.set(prk);
  combined.set(infoBytes, prk.length);

  return sodium.crypto_generichash(keyLength, combined);
}

// ═══════════════════════════════════════════════════════
// DIFFIE-HELLMAN
// ═══════════════════════════════════════════════════════

/**
 * Realiza un Diffie-Hellman key exchange (X25519 scalar multiplication).
 * 
 * @param {Uint8Array} myPrivateKey - Mi X25519 private key
 * @param {Uint8Array} theirPublicKey - Su X25519 public key
 * @returns {Uint8Array} Shared secret de 32 bytes
 */
export function diffieHellman(myPrivateKey, theirPublicKey) {
  const sodium = requireSodium();
  return sodium.crypto_scalarmult(myPrivateKey, theirPublicKey);
}

// ═══════════════════════════════════════════════════════
// RANDOM
// ═══════════════════════════════════════════════════════

/**
 * Genera bytes aleatorios criptográficamente seguros.
 * @param {number} length - Número de bytes
 * @returns {Uint8Array}
 */
export function randomBytes(length) {
  const sodium = requireSodium();
  return sodium.randombytes_buf(length);
}

/**
 * Genera una clave simétrica aleatoria de 32 bytes.
 * @returns {Uint8Array}
 */
export function generateSymmetricKey() {
  return randomBytes(32);
}

// ═══════════════════════════════════════════════════════
// UTILIDADES DE ENCODING
// ═══════════════════════════════════════════════════════

/**
 * Convierte bytes a hex string.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function toHex(bytes) {
  const sodium = requireSodium();
  return sodium.to_hex(bytes);
}

/**
 * Convierte hex string a bytes.
 * @param {string} hex
 * @returns {Uint8Array}
 */
export function fromHex(hex) {
  const sodium = requireSodium();
  return sodium.from_hex(hex);
}

/**
 * Convierte bytes a base64 (URL-safe, sin padding).
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function toBase64(bytes) {
  const sodium = requireSodium();
  return sodium.to_base64(bytes, sodium.base64_variants.URLSAFE_NO_PADDING);
}

/**
 * Convierte base64 (URL-safe, sin padding) a bytes.
 * @param {string} b64
 * @returns {Uint8Array}
 */
export function fromBase64(b64) {
  const sodium = requireSodium();
  return sodium.from_base64(b64, sodium.base64_variants.URLSAFE_NO_PADDING);
}

/**
 * Convierte string a Uint8Array (UTF-8).
 * @param {string} str
 * @returns {Uint8Array}
 */
export function fromString(str) {
  const sodium = requireSodium();
  return sodium.from_string(str);
}

/**
 * Convierte Uint8Array a string (UTF-8).
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function toString(bytes) {
  const sodium = requireSodium();
  return sodium.to_string(bytes);
}

// ═══════════════════════════════════════════════════════
// CONSTANTES EXPORTADAS
// ═══════════════════════════════════════════════════════

/** Longitud de clave simétrica en bytes */
export const SYMMETRIC_KEY_LENGTH = 32;

/** Longitud de nonce XChaCha20 en bytes */
export const NONCE_LENGTH = 24;

/** Longitud de public key Ed25519 en bytes */
export const SIGNING_PUBLIC_KEY_LENGTH = 32;

/** Longitud de private key Ed25519 en bytes */
export const SIGNING_PRIVATE_KEY_LENGTH = 64;

/** Longitud de public key X25519 en bytes */
export const DH_PUBLIC_KEY_LENGTH = 32;

/** Longitud de private key X25519 en bytes */
export const DH_PRIVATE_KEY_LENGTH = 32;

/** Longitud de firma Ed25519 en bytes */
export const SIGNATURE_LENGTH = 64;

/** Longitud de salt Argon2id en bytes */
export const ARGON2_SALT_LENGTH = 16;
