/**
 * GhostLink v0.0.0.4 — Identity Tests
 *
 * Valida la generación de GhostLink IDs, recovery phrases BIP39,
 * creación/restauración de identidad, y cifrado/descifrado de private keys.
 */

import { initCrypto, sha256, randomBytes, toHex } from '../src/crypto/helpers.js';
import {
  generateGhostLinkId,
  generateRecoveryPhrase,
  recoveryPhraseToEntropy,
  createIdentity,
  restoreIdentity,
  unlockPrivateKey,
} from '../src/crypto/identity.js';
import { BIP39_WORDLIST } from '../src/crypto/bip39-wordlist.js';

let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}`);
    failed++;
  }
}

async function runTests() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   🆔 GhostLink v0.0.0.4 — Identity Tests       ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');

  await initCrypto();

  // ── BIP39 Wordlist ──
  console.log('── BIP39 Wordlist ──');
  assert(Array.isArray(BIP39_WORDLIST), 'Wordlist es un array');
  assert(BIP39_WORDLIST.length === 2048, 'Wordlist tiene 2048 palabras');
  assert(BIP39_WORDLIST[0] === 'abandon', 'Primera palabra es "abandon"');
  assert(BIP39_WORDLIST[2047] === 'zoo', 'Última palabra es "zoo"');
  assert(new Set(BIP39_WORDLIST).size === 2048, 'Todas las palabras son únicas');
  console.log('');

  // ── GhostLink ID ──
  console.log('── GhostLink ID ──');
  const testKey = randomBytes(32);
  const glId = generateGhostLinkId(testKey);
  assert(typeof glId === 'string', 'GhostLink ID es un string');
  assert(/^GL-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(glId), 'Formato GL-XXXX-XXXX-XXXX-XXXX');
  assert(glId.length === 22, 'GhostLink ID tiene 22 caracteres');

  // Determinístico
  const glId2 = generateGhostLinkId(testKey);
  assert(glId === glId2, 'Mismo publicKey → mismo GhostLink ID (determinístico)');

  // Diferentes keys → diferentes IDs
  const testKey2 = randomBytes(32);
  const glId3 = generateGhostLinkId(testKey2);
  assert(glId !== glId3, 'Diferentes publicKeys → diferentes GhostLink IDs');
  console.log('');

  // ── Recovery Phrase (BIP39) ──
  console.log('── Recovery Phrase (BIP39) ──');
  const entropy = randomBytes(32);
  const phrase = generateRecoveryPhrase(entropy);
  assert(Array.isArray(phrase), 'Recovery phrase es un array');
  assert(phrase.length === 24, 'Recovery phrase tiene 24 palabras');

  const allInWordlist = phrase.every((w) => BIP39_WORDLIST.includes(w));
  assert(allInWordlist, 'Todas las palabras están en la wordlist BIP39');

  // Ida y vuelta
  const recoveredEntropy = recoveryPhraseToEntropy(phrase);
  assert(recoveredEntropy instanceof Uint8Array, 'Entropía recuperada es Uint8Array');
  assert(recoveredEntropy.length === 32, 'Entropía recuperada tiene 32 bytes');
  assert(toHex(recoveredEntropy) === toHex(entropy), 'Ida y vuelta: entropía recuperada coincide con la original');

  // Determinístico
  const phrase2 = generateRecoveryPhrase(entropy);
  assert(phrase.join(' ') === phrase2.join(' '), 'Misma entropía → misma recovery phrase');

  // Checksum inválido
  let checksumFailed = false;
  try {
    const badPhrase = [...phrase];
    badPhrase[0] = badPhrase[0] === 'abandon' ? 'ability' : 'abandon';
    recoveryPhraseToEntropy(badPhrase);
  } catch (e) {
    checksumFailed = true;
  }
  assert(checksumFailed, 'Checksum inválido es rechazado');

  // Palabra no existente
  let invalidWordFailed = false;
  try {
    const badPhrase2 = [...phrase];
    badPhrase2[5] = 'xyznotaword';
    recoveryPhraseToEntropy(badPhrase2);
  } catch (e) {
    invalidWordFailed = true;
  }
  assert(invalidWordFailed, 'Palabra inexistente es rechazada');

  // Longitud incorrecta
  let wrongLengthFailed = false;
  try {
    recoveryPhraseToEntropy(phrase.slice(0, 12));
  } catch (e) {
    wrongLengthFailed = true;
  }
  assert(wrongLengthFailed, 'Longitud incorrecta (12 palabras) es rechazada');
  console.log('');

  // ── createIdentity ──
  console.log('── createIdentity ──');
  const passphrase = 'MiPassphrase$egura123!';
  const identity = createIdentity(passphrase);
  assert(typeof identity.ghostLinkId === 'string', 'createIdentity retorna ghostLinkId');
  assert(/^GL-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(identity.ghostLinkId), 'ghostLinkId tiene formato correcto');
  assert(Array.isArray(identity.recoveryPhrase), 'createIdentity retorna recoveryPhrase');
  assert(identity.recoveryPhrase.length === 24, 'recoveryPhrase tiene 24 palabras');
  assert(identity.publicIdentity.publicKey instanceof Uint8Array, 'publicIdentity tiene publicKey');
  assert(identity.publicIdentity.publicKey.length === 32, 'publicKey tiene 32 bytes');
  assert(identity.publicIdentity.ghostLinkId === identity.ghostLinkId, 'publicIdentity.ghostLinkId coincide');
  assert(typeof identity.encryptedPrivateKey.ciphertext === 'string', 'encryptedPrivateKey tiene ciphertext hex');
  assert(typeof identity.encryptedPrivateKey.nonce === 'string', 'encryptedPrivateKey tiene nonce hex');
  assert(typeof identity.encryptedPrivateKey.salt === 'string', 'encryptedPrivateKey tiene salt hex');
  assert(identity.bundle !== undefined, 'createIdentity retorna bundle X3DH');
  console.log('');

  // ── restoreIdentity ──
  console.log('── restoreIdentity ──');
  const newPassphrase = 'OtraPassphrase456!';
  const restored = restoreIdentity(identity.recoveryPhrase, newPassphrase);
  assert(restored.ghostLinkId === identity.ghostLinkId, 'restoreIdentity genera el MISMO GhostLink ID');
  assert(
    toHex(restored.publicIdentity.publicKey) === toHex(identity.publicIdentity.publicKey),
    'restoreIdentity genera la MISMA public key'
  );
  assert(restored.recoveryPhrase.join(' ') === identity.recoveryPhrase.join(' '), 'Recovery phrase es la misma');
  assert(restored.encryptedPrivateKey.salt !== identity.encryptedPrivateKey.salt, 'Salt es diferente (nueva passphrase)');
  console.log('');

  // ── unlockPrivateKey ──
  console.log('── unlockPrivateKey ──');
  const unlockedKey = unlockPrivateKey(identity.encryptedPrivateKey, passphrase);
  assert(unlockedKey instanceof Uint8Array, 'unlockPrivateKey retorna Uint8Array');
  assert(unlockedKey.length === 64, 'Private key desbloqueada tiene 64 bytes (Ed25519)');

  // Desbloquear con la passphrase restaurada
  const unlockedKey2 = unlockPrivateKey(restored.encryptedPrivateKey, newPassphrase);
  assert(toHex(unlockedKey) === toHex(unlockedKey2), 'Misma private key desbloqueada desde ambas identidades');

  // Passphrase incorrecta
  let wrongPassFailed = false;
  try {
    unlockPrivateKey(identity.encryptedPrivateKey, 'passphrase_incorrecta');
  } catch (e) {
    wrongPassFailed = true;
  }
  assert(wrongPassFailed, 'Passphrase incorrecta lanza error');
  console.log('');

  // ── Dos identidades diferentes ──
  console.log('── Dos identidades diferentes ──');
  const identity2 = createIdentity('OtraIdentidad!');
  assert(identity2.ghostLinkId !== identity.ghostLinkId, 'Dos identidades tienen GhostLink IDs diferentes');
  assert(
    toHex(identity2.publicIdentity.publicKey) !== toHex(identity.publicIdentity.publicKey),
    'Dos identidades tienen public keys diferentes'
  );
  console.log('');

  // ── Resumen ──
  console.log('╔══════════════════════════════════════════════════╗');
  console.log(`║  Resultados: ${passed} ✅ pasaron  ${failed} ❌ fallaron`);
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');

  if (failed === 0) {
    console.log('🎉 ¡Todos los tests pasaron! Identity v0.0.0.4 operativo.');
  } else {
    console.log('⚠️ Algunos tests fallaron.');
    process.exit(1);
  }
  console.log('');
}

runTests();
