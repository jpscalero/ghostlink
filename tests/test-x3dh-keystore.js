/**
 * GhostLink v0.0.0.3 — X3DH Keystore Tests
 *
 * Valida la generación de bundles de claves X3DH, la firma/verificación
 * del Signed PreKey, la generación de One-Time PreKeys, la serialización,
 * y el handshake completo entre Alice (iniciadora) y Bob (respondedor).
 */

import { initCrypto, toHex } from '../src/crypto/helpers.js';
import {
  generateIdentityKey,
  generateSignedPreKey,
  verifySignedPreKey,
  generateOneTimePreKeys,
  generateKeyBundle,
  serializePublicBundle,
  deserializePublicBundle,
  x3dhInitiate,
  x3dhRespond,
  SIGNED_PREKEY_ROTATION_DAYS,
  DEFAULT_OPK_COUNT,
} from '../src/crypto/x3dh-keystore.js';

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
  console.log('║   🔑 GhostLink v0.0.0.3 — X3DH Keystore Tests  ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');

  await initCrypto();

  // ── Constantes ──
  console.log('── Constantes ──');
  assert(SIGNED_PREKEY_ROTATION_DAYS === 7, 'Rotación de SPK es 7 días');
  assert(DEFAULT_OPK_COUNT === 100, 'Cantidad por defecto de OPKs es 100');
  console.log('');

  // ── Identity Key ──
  console.log('── Identity Key (Ed25519) ──');
  const ik = generateIdentityKey();
  assert(ik.publicKey instanceof Uint8Array, 'IK publicKey es Uint8Array');
  assert(ik.privateKey instanceof Uint8Array, 'IK privateKey es Uint8Array');
  assert(ik.publicKey.length === 32, 'IK publicKey tiene 32 bytes');
  assert(ik.privateKey.length === 64, 'IK privateKey tiene 64 bytes (Ed25519)');

  const ik2 = generateIdentityKey();
  assert(toHex(ik.publicKey) !== toHex(ik2.publicKey), 'Dos IKs son diferentes');
  console.log('');

  // ── Signed PreKey ──
  console.log('── Signed PreKey (X25519 + firma Ed25519) ──');
  const spk = generateSignedPreKey(ik.privateKey);
  assert(spk.keyPair.publicKey instanceof Uint8Array, 'SPK publicKey es Uint8Array');
  assert(spk.keyPair.privateKey instanceof Uint8Array, 'SPK privateKey es Uint8Array');
  assert(spk.keyPair.publicKey.length === 32, 'SPK publicKey tiene 32 bytes');
  assert(spk.keyPair.privateKey.length === 32, 'SPK privateKey tiene 32 bytes (X25519)');
  assert(spk.signature instanceof Uint8Array, 'Firma es Uint8Array');
  assert(spk.signature.length === 64, 'Firma tiene 64 bytes');
  assert(typeof spk.timestamp === 'number', 'Timestamp es un número');
  assert(spk.timestamp > 0, 'Timestamp es positivo');
  assert(typeof spk.keyId === 'number', 'keyId es un número');

  // Verificar firma positiva
  const spkValid = verifySignedPreKey(spk.signature, spk.keyPair.publicKey, ik.publicKey);
  assert(spkValid === true, 'Firma del SPK se verifica correctamente con la IK');

  // Verificar firma negativa (con otra IK)
  const spkInvalid = verifySignedPreKey(spk.signature, spk.keyPair.publicKey, ik2.publicKey);
  assert(spkInvalid === false, 'Firma del SPK falla con una IK diferente');

  // Verificar firma negativa (con otra key)
  const spk2 = generateSignedPreKey(ik.privateKey);
  const spkWrongKey = verifySignedPreKey(spk.signature, spk2.keyPair.publicKey, ik.publicKey);
  assert(spkWrongKey === false, 'Firma del SPK falla con una public key diferente');
  console.log('');

  // ── One-Time PreKeys ──
  console.log('── One-Time PreKeys (X25519 efímeros) ──');
  const opks = generateOneTimePreKeys(100);
  assert(opks.length === 100, 'Se generan 100 OPKs');
  assert(opks[0].keyId === 0, 'Primer OPK tiene keyId 0');
  assert(opks[99].keyId === 99, 'Último OPK tiene keyId 99');
  assert(opks[0].keyPair.publicKey.length === 32, 'OPK publicKey tiene 32 bytes');
  assert(opks[0].keyPair.privateKey.length === 32, 'OPK privateKey tiene 32 bytes');

  // Todas las OPKs son únicas
  const opkHexSet = new Set(opks.map((o) => toHex(o.keyPair.publicKey)));
  assert(opkHexSet.size === 100, 'Las 100 OPKs tienen public keys únicas');

  // Generación con offset
  const opksOffset = generateOneTimePreKeys(10, 100);
  assert(opksOffset[0].keyId === 100, 'OPKs con offset empiezan desde 100');
  assert(opksOffset[9].keyId === 109, 'OPKs con offset terminan en 109');
  console.log('');

  // ── Bundle Completo ──
  console.log('── Bundle Completo ──');
  const bundle = generateKeyBundle(50);
  assert(bundle.identityKey.publicKey.length === 32, 'Bundle tiene IK válida');
  assert(bundle.signedPreKey.keyPair.publicKey.length === 32, 'Bundle tiene SPK válido');
  assert(bundle.signedPreKey.signature.length === 64, 'Bundle tiene firma SPK válida');
  assert(bundle.oneTimePreKeys.length === 50, 'Bundle tiene 50 OPKs (custom)');

  const bundleDefault = generateKeyBundle();
  assert(bundleDefault.oneTimePreKeys.length === 100, 'Bundle por defecto tiene 100 OPKs');
  console.log('');

  // ── Serialización / Deserialización ──
  console.log('── Serialización / Deserialización ──');
  const serialized = serializePublicBundle(bundle);
  assert(typeof serialized === 'string', 'Serialización produce un string');
  assert(serialized.startsWith('{'), 'Serialización es JSON válido');

  const parsed = JSON.parse(serialized);
  assert(typeof parsed.ik === 'string', 'JSON tiene campo ik (hex)');
  assert(typeof parsed.spk === 'object', 'JSON tiene campo spk (objeto)');
  assert(Array.isArray(parsed.opks), 'JSON tiene campo opks (array)');
  assert(parsed.opks.length === 50, 'JSON tiene 50 OPKs');

  const deserialized = deserializePublicBundle(serialized);
  assert(deserialized.identityPublicKey instanceof Uint8Array, 'Deserialización produce IK como Uint8Array');
  assert(deserialized.identityPublicKey.length === 32, 'IK deserializada tiene 32 bytes');
  assert(
    toHex(deserialized.identityPublicKey) === toHex(bundle.identityKey.publicKey),
    'IK deserializada coincide con la original'
  );
  assert(
    toHex(deserialized.signedPreKey.publicKey) === toHex(bundle.signedPreKey.keyPair.publicKey),
    'SPK deserializado coincide con el original'
  );
  assert(deserialized.oneTimePreKeys.length === 50, 'OPKs deserializadas son 50');
  assert(
    toHex(deserialized.oneTimePreKeys[0].publicKey) === toHex(bundle.oneTimePreKeys[0].keyPair.publicKey),
    'Primera OPK deserializada coincide'
  );

  // Verificar firma del SPK deserializado
  const deserializedSpkValid = verifySignedPreKey(
    deserialized.signedPreKey.signature,
    deserialized.signedPreKey.publicKey,
    deserialized.identityPublicKey
  );
  assert(deserializedSpkValid === true, 'Firma del SPK se verifica tras serialización/deserialización');
  console.log('');

  // ── Handshake X3DH Completo (con OPK) ──
  console.log('── Handshake X3DH Completo (con OPK) ──');
  const alice = generateKeyBundle(10);
  const bob = generateKeyBundle(10);

  // Alice obtiene el bundle público de Bob
  const bobPublicJson = serializePublicBundle(bob);
  const bobPublic = deserializePublicBundle(bobPublicJson);

  // Alice inicia el handshake
  const aliceResult = x3dhInitiate(alice.identityKey.privateKey, bobPublic, 0);
  assert(aliceResult.sharedSecret instanceof Uint8Array, 'Alice obtiene sharedSecret');
  assert(aliceResult.sharedSecret.length === 32, 'sharedSecret tiene 32 bytes');
  assert(aliceResult.ephemeralPublicKey instanceof Uint8Array, 'Alice genera ephemeral key');
  assert(aliceResult.ephemeralPublicKey.length === 32, 'Ephemeral key tiene 32 bytes');
  assert(aliceResult.usedOpkId === 0, 'Alice consumió OPK con ID 0');

  // Bob responde al handshake
  const bobResult = x3dhRespond(
    bob.identityKey.privateKey,
    bob.signedPreKey.keyPair.privateKey,
    alice.identityKey.publicKey,
    aliceResult.ephemeralPublicKey,
    bob.oneTimePreKeys[0].keyPair.privateKey // OPK consumida
  );
  assert(bobResult.sharedSecret instanceof Uint8Array, 'Bob obtiene sharedSecret');
  assert(bobResult.sharedSecret.length === 32, 'sharedSecret de Bob tiene 32 bytes');

  // El momento de la verdad: ambos deben obtener el MISMO secreto
  const aliceHex = toHex(aliceResult.sharedSecret);
  const bobHex = toHex(bobResult.sharedSecret);
  assert(
    aliceHex === bobHex,
    '¡Alice y Bob derivan el MISMO secreto compartido via X3DH!'
  );
  console.log('');

  // ── Handshake X3DH Sin OPK ──
  console.log('── Handshake X3DH Sin OPK (fallback) ──');
  const carol = generateKeyBundle(10);
  const dave = generateKeyBundle(0); // Dave NO tiene OPKs

  const davePublicJson = serializePublicBundle(dave);
  const davePublic = deserializePublicBundle(davePublicJson);

  const carolResult = x3dhInitiate(carol.identityKey.privateKey, davePublic);
  assert(carolResult.usedOpkId === null, 'Sin OPKs, usedOpkId es null');
  assert(carolResult.sharedSecret.length === 32, 'sharedSecret sin OPK tiene 32 bytes');

  const daveResult = x3dhRespond(
    dave.identityKey.privateKey,
    dave.signedPreKey.keyPair.privateKey,
    carol.identityKey.publicKey,
    carolResult.ephemeralPublicKey,
    null // Sin OPK
  );

  assert(
    toHex(carolResult.sharedSecret) === toHex(daveResult.sharedSecret),
    'Carol y Dave derivan el mismo secreto sin OPK'
  );
  console.log('');

  // ── Seguridad: SPK con firma inválida ──
  console.log('── Seguridad: Rechazo de SPK falsificado ──');
  const eve = generateKeyBundle(5);
  const evePublicJson = serializePublicBundle(eve);
  const evePublic = deserializePublicBundle(evePublicJson);

  // Simular firma falsificada: cambiar la IK pública
  const mallory = generateIdentityKey();
  evePublic.identityPublicKey = mallory.publicKey; // MITM

  let mitm_caught = false;
  try {
    x3dhInitiate(alice.identityKey.privateKey, evePublic);
  } catch (e) {
    mitm_caught = true;
  }
  assert(mitm_caught === true, 'X3DH rechaza bundle con firma SPK falsificada (anti-MITM)');
  console.log('');

  // ── Resumen ──
  console.log('╔══════════════════════════════════════════════════╗');
  console.log(`║  Resultados: ${passed} ✅ pasaron  ${failed} ❌ fallaron`);
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');

  if (failed === 0) {
    console.log('🎉 ¡Todos los tests pasaron! X3DH Keystore v0.0.0.3 operativo.');
  } else {
    console.log('⚠️ Algunos tests fallaron. Revisa los errores arriba.');
    process.exit(1);
  }
  console.log('');
}

runTests();
