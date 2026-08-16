/**
 * GhostLink — Tests Crypto v0.0.0.1
 * 
 * Tests completos para verificar el motor criptográfico.
 * Ejecutar: node tests/test-sodium.js
 */

import {
  initCrypto,
  generateSigningKeyPair,
  generateDHKeyPair,
  edToX25519Public,
  edToX25519Private,
  encrypt,
  decrypt,
  decryptToString,
  sign,
  verify,
  sha256,
  blake2b,
  deriveKeyFromPassphrase,
  hkdfDerive,
  diffieHellman,
  randomBytes,
  generateSymmetricKey,
  toHex,
  fromHex,
  toBase64,
  fromBase64,
  fromString,
  toString,
  SYMMETRIC_KEY_LENGTH,
  NONCE_LENGTH,
  SIGNING_PUBLIC_KEY_LENGTH,
  SIGNING_PRIVATE_KEY_LENGTH,
  DH_PUBLIC_KEY_LENGTH,
  DH_PRIVATE_KEY_LENGTH,
  SIGNATURE_LENGTH,
  ARGON2_SALT_LENGTH,
} from '../src/crypto/helpers.js';

// ═══════════════════════════════════════════════════════
// Test Runner
// ═══════════════════════════════════════════════════════

let passed = 0;
let failed = 0;
const errors = [];

function assert(condition, testName) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${testName}`);
  } else {
    failed++;
    errors.push(testName);
    console.log(`  ❌ ${testName}`);
  }
}

function assertThrows(fn, testName) {
  try {
    fn();
    failed++;
    errors.push(testName);
    console.log(`  ❌ ${testName} (no lanzó error)`);
  } catch {
    passed++;
    console.log(`  ✅ ${testName}`);
  }
}

function section(name) {
  console.log(`\n── ${name} ──`);
}

// ═══════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════

async function runTests() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║      🔒 GhostLink v0.0.0.1 — Crypto Tests       ║');
  console.log('╚══════════════════════════════════════════════════╝');

  // ── Inicialización ──
  section('Inicialización de libsodium');
  await initCrypto();
  assert(true, 'libsodium.js WASM cargado correctamente');

  // Verificar que una segunda llamada no falla (singleton)
  await initCrypto();
  assert(true, 'Segunda llamada a initCrypto() es idempotente');

  // ── Ed25519 Signing Keypair ──
  section('Ed25519 Signing Keypair');
  const signingKP = generateSigningKeyPair();
  assert(signingKP.publicKey instanceof Uint8Array, 'publicKey es Uint8Array');
  assert(signingKP.privateKey instanceof Uint8Array, 'privateKey es Uint8Array');
  assert(signingKP.publicKey.length === SIGNING_PUBLIC_KEY_LENGTH, `publicKey tiene ${SIGNING_PUBLIC_KEY_LENGTH} bytes`);
  assert(signingKP.privateKey.length === SIGNING_PRIVATE_KEY_LENGTH, `privateKey tiene ${SIGNING_PRIVATE_KEY_LENGTH} bytes`);

  // Dos keypairs deben ser diferentes
  const signingKP2 = generateSigningKeyPair();
  assert(toHex(signingKP.publicKey) !== toHex(signingKP2.publicKey), 'Dos keypairs son diferentes');

  // ── X25519 DH Keypair ──
  section('X25519 DH Keypair');
  const dhKP = generateDHKeyPair();
  assert(dhKP.publicKey.length === DH_PUBLIC_KEY_LENGTH, `DH publicKey tiene ${DH_PUBLIC_KEY_LENGTH} bytes`);
  assert(dhKP.privateKey.length === DH_PRIVATE_KEY_LENGTH, `DH privateKey tiene ${DH_PRIVATE_KEY_LENGTH} bytes`);

  // ── Conversión Ed25519 → X25519 ──
  section('Conversión Ed25519 → X25519');
  const xPub = edToX25519Public(signingKP.publicKey);
  const xPriv = edToX25519Private(signingKP.privateKey);
  assert(xPub.length === DH_PUBLIC_KEY_LENGTH, 'Ed→X25519 public key tiene 32 bytes');
  assert(xPriv.length === DH_PRIVATE_KEY_LENGTH, 'Ed→X25519 private key tiene 32 bytes');

  // ── Cifrado Simétrico XChaCha20-Poly1305 ──
  section('Cifrado Simétrico (XChaCha20-Poly1305)');
  const key = generateSymmetricKey();
  assert(key.length === SYMMETRIC_KEY_LENGTH, `Clave simétrica tiene ${SYMMETRIC_KEY_LENGTH} bytes`);

  // Cifrar string
  const message = '¡Hola GhostLink! 🔒 Este mensaje es secreto.';
  const { ciphertext, nonce } = encrypt(message, key);
  assert(ciphertext instanceof Uint8Array, 'Ciphertext es Uint8Array');
  assert(nonce.length === NONCE_LENGTH, `Nonce tiene ${NONCE_LENGTH} bytes`);
  assert(ciphertext.length > 0, 'Ciphertext no está vacío');

  // Descifrar
  const decrypted = decryptToString(ciphertext, nonce, key);
  assert(decrypted === message, 'Descifrado produce el mensaje original');

  // Cifrar bytes
  const binaryData = randomBytes(256);
  const { ciphertext: ct2, nonce: n2 } = encrypt(binaryData, key);
  const decrypted2 = decrypt(ct2, n2, key);
  assert(toHex(decrypted2) === toHex(binaryData), 'Cifrado/descifrado de datos binarios funciona');

  // Clave incorrecta debe fallar
  const wrongKey = generateSymmetricKey();
  assertThrows(
    () => decrypt(ciphertext, nonce, wrongKey),
    'Descifrar con clave incorrecta lanza error'
  );

  // Nonce incorrecto debe fallar
  const wrongNonce = randomBytes(NONCE_LENGTH);
  assertThrows(
    () => decrypt(ciphertext, wrongNonce, key),
    'Descifrar con nonce incorrecto lanza error'
  );

  // Datos manipulados deben fallar
  const tampered = new Uint8Array(ciphertext);
  tampered[0] ^= 0xFF;
  assertThrows(
    () => decrypt(tampered, nonce, key),
    'Descifrar datos manipulados lanza error (autenticación AEAD)'
  );

  // AEAD con additional data
  const ad = fromString('metadata-no-cifrada');
  const { ciphertext: ct3, nonce: n3 } = encrypt('secreto', key, ad);
  const dec3 = decryptToString(ct3, n3, key, ad);
  assert(dec3 === 'secreto', 'AEAD con additional data funciona');

  assertThrows(
    () => decrypt(ct3, n3, key, fromString('ad-diferente')),
    'AEAD falla si additional data es diferente'
  );

  // ── Firma Digital Ed25519 ──
  section('Firma Digital (Ed25519)');
  const sigMessage = 'Documento oficial de GhostLink v0.0.0.1';
  const signature = sign(sigMessage, signingKP.privateKey);
  assert(signature.length === SIGNATURE_LENGTH, `Firma tiene ${SIGNATURE_LENGTH} bytes`);

  const isValid = verify(signature, sigMessage, signingKP.publicKey);
  assert(isValid === true, 'Firma válida se verifica correctamente');

  const isInvalid = verify(signature, 'mensaje alterado', signingKP.publicKey);
  assert(isInvalid === false, 'Firma inválida es rechazada');

  const isWrongKey = verify(signature, sigMessage, signingKP2.publicKey);
  assert(isWrongKey === false, 'Firma con clave incorrecta es rechazada');

  // Firmar bytes
  const binSig = sign(binaryData, signingKP.privateKey);
  assert(verify(binSig, binaryData, signingKP.publicKey), 'Firma de datos binarios funciona');

  // ── Hashing ──
  section('Hashing (SHA-256 + BLAKE2b)');
  const hash1 = sha256('GhostLink');
  assert(hash1.length === 32, 'SHA-256 produce 32 bytes');

  const hash2 = sha256('GhostLink');
  assert(toHex(hash1) === toHex(hash2), 'SHA-256 es determinista');

  const hash3 = sha256('Diferente');
  assert(toHex(hash1) !== toHex(hash3), 'SHA-256 produce hashes diferentes para inputs diferentes');

  const b2hash = blake2b('GhostLink', 32);
  assert(b2hash.length === 32, 'BLAKE2b produce 32 bytes');

  const b2hash16 = blake2b('GhostLink', 16);
  assert(b2hash16.length === 16, 'BLAKE2b respeta longitud personalizada');

  // Keyed BLAKE2b (HMAC-like)
  const hmacKey = randomBytes(32);
  const keyed1 = blake2b('data', 32, hmacKey);
  const keyed2 = blake2b('data', 32, hmacKey);
  assert(toHex(keyed1) === toHex(keyed2), 'Keyed BLAKE2b es determinista');

  const keyed3 = blake2b('data', 32, randomBytes(32));
  assert(toHex(keyed1) !== toHex(keyed3), 'Keyed BLAKE2b con clave diferente produce hash diferente');

  // ── Key Derivation (Argon2id) ──
  section('Key Derivation (Argon2id)');
  const passphrase = 'MiContraseñaSegura2025!';
  const derived1 = deriveKeyFromPassphrase(passphrase);
  assert(derived1.key.length === 32, 'Argon2id produce clave de 32 bytes');
  assert(derived1.salt.length === ARGON2_SALT_LENGTH, `Salt tiene ${ARGON2_SALT_LENGTH} bytes`);

  // Misma passphrase + mismo salt = misma clave
  const derived2 = deriveKeyFromPassphrase(passphrase, derived1.salt);
  assert(toHex(derived2.key) === toHex(derived1.key), 'Misma passphrase + salt = misma clave');

  // Passphrase diferente = clave diferente
  const derived3 = deriveKeyFromPassphrase('OtraContraseña', derived1.salt);
  assert(toHex(derived3.key) !== toHex(derived1.key), 'Passphrase diferente = clave diferente');

  // Salt diferente = clave diferente
  const derived4 = deriveKeyFromPassphrase(passphrase);
  assert(toHex(derived4.key) !== toHex(derived1.key), 'Salt diferente = clave diferente');

  // ── HKDF ──
  section('HKDF (Key Derivation)');
  const ikm = randomBytes(32);
  const hkdfSalt = randomBytes(32);
  const hkdf1 = hkdfDerive(ikm, hkdfSalt, 'chain-key');
  const hkdf2 = hkdfDerive(ikm, hkdfSalt, 'message-key');
  assert(hkdf1.length === 32, 'HKDF produce 32 bytes');
  assert(toHex(hkdf1) !== toHex(hkdf2), 'HKDF con diferente info produce claves diferentes');

  const hkdf3 = hkdfDerive(ikm, hkdfSalt, 'chain-key');
  assert(toHex(hkdf1) === toHex(hkdf3), 'HKDF es determinista');

  // ── Diffie-Hellman ──
  section('Diffie-Hellman (X25519)');
  const alice = generateDHKeyPair();
  const bob = generateDHKeyPair();

  const sharedAlice = diffieHellman(alice.privateKey, bob.publicKey);
  const sharedBob = diffieHellman(bob.privateKey, alice.publicKey);
  assert(sharedAlice.length === 32, 'DH shared secret tiene 32 bytes');
  assert(toHex(sharedAlice) === toHex(sharedBob), '¡Alice y Bob derivan el MISMO shared secret!');

  // Con tercero, el secret es diferente
  const eve = generateDHKeyPair();
  const sharedEve = diffieHellman(eve.privateKey, bob.publicKey);
  assert(toHex(sharedEve) !== toHex(sharedAlice), 'Eve NO puede derivar el secret de Alice-Bob');

  // ── Random ──
  section('Random Bytes');
  const rand1 = randomBytes(32);
  const rand2 = randomBytes(32);
  assert(rand1.length === 32, 'randomBytes produce longitud correcta');
  assert(toHex(rand1) !== toHex(rand2), 'Dos llamadas producen bytes diferentes');

  // ── Encoding ──
  section('Encoding (Hex, Base64, String)');
  const testBytes = randomBytes(16);

  const hex = toHex(testBytes);
  assert(typeof hex === 'string', 'toHex produce string');
  assert(hex.length === 32, 'Hex de 16 bytes tiene 32 caracteres');

  const backFromHex = fromHex(hex);
  assert(toHex(backFromHex) === hex, 'fromHex es inversa de toHex');

  const b64 = toBase64(testBytes);
  assert(typeof b64 === 'string', 'toBase64 produce string');

  const backFromB64 = fromBase64(b64);
  assert(toHex(backFromB64) === toHex(testBytes), 'fromBase64 es inversa de toBase64');

  const str = 'GhostLink 🔒';
  const strBytes = fromString(str);
  const backToStr = toString(strBytes);
  assert(backToStr === str, 'fromString/toString preserva UTF-8 con emojis');

  // ── Flujo Completo: Cifrado con clave derivada ──
  section('Flujo Completo: Passphrase → Clave → Cifrar → Descifrar');
  const userPassphrase = 'P@ssw0rd_GhostL1nk_2025!';
  const { key: derivedKey, salt: derivedSalt } = deriveKeyFromPassphrase(userPassphrase);

  const secretMessage = 'Este mensaje está protegido por una passphrase del usuario';
  const encrypted = encrypt(secretMessage, derivedKey);
  const decryptedMessage = decryptToString(encrypted.ciphertext, encrypted.nonce, derivedKey);
  assert(decryptedMessage === secretMessage, 'Flujo completo: passphrase → encrypt → decrypt ✅');

  // Simular "reabrir app" con la misma passphrase
  const { key: reopenKey } = deriveKeyFromPassphrase(userPassphrase, derivedSalt);
  const reopenDecrypted = decryptToString(encrypted.ciphertext, encrypted.nonce, reopenKey);
  assert(reopenDecrypted === secretMessage, 'Reabrir app con misma passphrase descifra correctamente');

  // ═══════════════════════════════════════════════════════
  // Resultados
  // ═══════════════════════════════════════════════════════
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log(`║  Resultados: ${passed} ✅ pasaron  ${failed} ❌ fallaron`);
  console.log('╚══════════════════════════════════════════════════╝');

  if (failed > 0) {
    console.log('\n❌ Tests fallidos:');
    errors.forEach(e => console.log(`   - ${e}`));
    process.exit(1);
  } else {
    console.log('\n🎉 ¡Todos los tests pasaron! Motor criptográfico v0.0.0.1 operativo.\n');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('💥 Error fatal en tests:', err);
  process.exit(1);
});
