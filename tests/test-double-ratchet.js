/**
 * GhostLink v0.0.0.5 — Double Ratchet Tests
 *
 * Valida el algoritmo Double Ratchet: cifrado/descifrado,
 * ping-pong, mensajes desordenados, export/import de estado,
 * e integración con X3DH.
 */

import { initCrypto, toHex, generateDHKeyPair } from '../src/crypto/helpers.js';
import { DoubleRatchet } from '../src/crypto/double-ratchet.js';
import {
  generateKeyBundle,
  serializePublicBundle,
  deserializePublicBundle,
  x3dhInitiate,
  x3dhRespond,
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

/**
 * Crea un par de ratchets inicializados (Alice como iniciadora, Bob como respondedor)
 * usando un shared secret simulado.
 */
function createRatchetPair() {
  const sharedSecret = new Uint8Array(32);
  for (let i = 0; i < 32; i++) sharedSecret[i] = i;

  const bobDHKeyPair = generateDHKeyPair();

  const alice = new DoubleRatchet(sharedSecret, true);
  alice.initAsInitiator(bobDHKeyPair.publicKey);

  const bob = new DoubleRatchet(sharedSecret, false, bobDHKeyPair);
  bob.initAsResponder(alice.myDHKeyPair.publicKey);

  return { alice, bob };
}

async function runTests() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   🔄 GhostLink v0.0.0.5 — Double Ratchet Tests ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');

  await initCrypto();

  // ── Inicialización ──
  console.log('── Inicialización ──');
  const { alice, bob } = createRatchetPair();
  assert(alice.sendChainKey !== null, 'Alice tiene sendChainKey tras init');
  assert(bob.recvChainKey !== null, 'Bob tiene recvChainKey tras init');
  console.log('');

  // ── Alice → Bob ──
  console.log('── Alice → Bob (primer mensaje) ──');
  const msg1 = 'Hola Bob, soy Alice 🔒';
  const enc1 = alice.ratchetEncrypt(msg1);
  assert(typeof enc1.header === 'object', 'Encrypt retorna header');
  assert(typeof enc1.ciphertext === 'string', 'Encrypt retorna ciphertext hex');
  assert(typeof enc1.nonce === 'string', 'Encrypt retorna nonce hex');
  assert(enc1.header.n === 0, 'Primer mensaje tiene n=0');

  const dec1 = bob.ratchetDecrypt(enc1.header, enc1.ciphertext, enc1.nonce);
  assert(dec1 === msg1, 'Bob descifra correctamente el mensaje de Alice');
  console.log('');

  // ── Bob → Alice ──
  console.log('── Bob → Alice (respuesta) ──');
  const msg2 = '¡Hola Alice! Recibido 👍';
  const enc2 = bob.ratchetEncrypt(msg2);
  const dec2 = alice.ratchetDecrypt(enc2.header, enc2.ciphertext, enc2.nonce);
  assert(dec2 === msg2, 'Alice descifra correctamente la respuesta de Bob');
  console.log('');

  // ── Ping-pong de 10 mensajes ──
  console.log('── Ping-pong de 10 mensajes ──');
  const { alice: a2, bob: b2 } = createRatchetPair();
  let allOk = true;
  for (let i = 0; i < 10; i++) {
    const sender = i % 2 === 0 ? a2 : b2;
    const receiver = i % 2 === 0 ? b2 : a2;
    const text = `Mensaje #${i} de ${i % 2 === 0 ? 'Alice' : 'Bob'}`;
    const enc = sender.ratchetEncrypt(text);
    const dec = receiver.ratchetDecrypt(enc.header, enc.ciphertext, enc.nonce);
    if (dec !== text) {
      allOk = false;
      break;
    }
  }
  assert(allOk, '10 mensajes de ping-pong se cifran/descifran correctamente');
  console.log('');

  // ── Claves diferentes por mensaje ──
  console.log('── Forward secrecy: cada mensaje usa clave diferente ──');
  const { alice: a3, bob: b3 } = createRatchetPair();
  const sameText = 'Mismo texto repetido';
  const enc_a = a3.ratchetEncrypt(sameText);
  const enc_b = a3.ratchetEncrypt(sameText);
  assert(enc_a.ciphertext !== enc_b.ciphertext, 'Mismo plaintext → ciphertexts diferentes');
  assert(enc_a.nonce !== enc_b.nonce, 'Mismo plaintext → nonces diferentes');
  // Descifrar ambos
  const dec_a = b3.ratchetDecrypt(enc_a.header, enc_a.ciphertext, enc_a.nonce);
  const dec_b = b3.ratchetDecrypt(enc_b.header, enc_b.ciphertext, enc_b.nonce);
  assert(dec_a === sameText && dec_b === sameText, 'Ambos mensajes se descifran correctamente');
  console.log('');

  // ── Mensajes fuera de orden ──
  console.log('── Mensajes fuera de orden ──');
  const { alice: a4, bob: b4 } = createRatchetPair();
  const enc_1 = a4.ratchetEncrypt('Mensaje 1');
  const enc_2 = a4.ratchetEncrypt('Mensaje 2');
  const enc_3 = a4.ratchetEncrypt('Mensaje 3');

  // Bob descifra en orden inverso: 3, 1, 2
  const d3 = b4.ratchetDecrypt(enc_3.header, enc_3.ciphertext, enc_3.nonce);
  assert(d3 === 'Mensaje 3', 'Mensaje 3 descifrado fuera de orden');

  const d1 = b4.ratchetDecrypt(enc_1.header, enc_1.ciphertext, enc_1.nonce);
  assert(d1 === 'Mensaje 1', 'Mensaje 1 descifrado fuera de orden');

  const d2 = b4.ratchetDecrypt(enc_2.header, enc_2.ciphertext, enc_2.nonce);
  assert(d2 === 'Mensaje 2', 'Mensaje 2 descifrado fuera de orden');
  console.log('');

  // ── Exceder MAX_SKIP ──
  console.log('── Exceder MAX_SKIP ──');
  const { alice: a5, bob: b5 } = createRatchetPair();
  // Alice envía 102 mensajes
  const encrypted102 = [];
  for (let i = 0; i < 102; i++) {
    encrypted102.push(a5.ratchetEncrypt(`Skip msg ${i}`));
  }
  // Bob intenta descifrar el último (saltándose 101 mensajes)
  let skipFailed = false;
  try {
    b5.ratchetDecrypt(encrypted102[101].header, encrypted102[101].ciphertext, encrypted102[101].nonce);
  } catch (e) {
    skipFailed = true;
  }
  assert(skipFailed, 'Exceder MAX_SKIP (101 mensajes saltados) lanza error');
  console.log('');

  // ── Export / Import de estado ──
  console.log('── Export / Import de estado ──');
  const { alice: a6, bob: b6 } = createRatchetPair();

  // Intercambiar algunos mensajes
  const e1 = a6.ratchetEncrypt('Pre-export 1');
  b6.ratchetDecrypt(e1.header, e1.ciphertext, e1.nonce);
  const e2 = b6.ratchetEncrypt('Pre-export 2');
  a6.ratchetDecrypt(e2.header, e2.ciphertext, e2.nonce);

  // Exportar ambos estados
  const aliceState = a6.exportState();
  const bobState = b6.exportState();

  assert(typeof aliceState.rootKey === 'string', 'Estado exportado tiene rootKey hex');
  assert(typeof aliceState.sendMessageNumber === 'number', 'Estado exportado tiene sendMessageNumber');

  // Importar y seguir cifrando
  const a6r = DoubleRatchet.importState(aliceState);
  const b6r = DoubleRatchet.importState(bobState);

  const e3 = a6r.ratchetEncrypt('Post-import from Alice');
  const d4 = b6r.ratchetDecrypt(e3.header, e3.ciphertext, e3.nonce);
  assert(d4 === 'Post-import from Alice', 'Mensaje post-import se descifra correctamente');

  const e4 = b6r.ratchetEncrypt('Post-import from Bob');
  const d5 = a6r.ratchetDecrypt(e4.header, e4.ciphertext, e4.nonce);
  assert(d5 === 'Post-import from Bob', 'Respuesta post-import se descifra correctamente');
  console.log('');

  // ── Múltiples mensajes consecutivos en una dirección ──
  console.log('── Múltiples mensajes consecutivos en una dirección ──');
  const { alice: a7, bob: b7 } = createRatchetPair();
  const batch = [];
  for (let i = 0; i < 5; i++) {
    batch.push(a7.ratchetEncrypt(`Batch msg ${i}`));
  }
  let batchOk = true;
  for (let i = 0; i < 5; i++) {
    const d = b7.ratchetDecrypt(batch[i].header, batch[i].ciphertext, batch[i].nonce);
    if (d !== `Batch msg ${i}`) batchOk = false;
  }
  assert(batchOk, '5 mensajes consecutivos en una dirección se descifran correctamente');
  console.log('');

  // ── Integración con X3DH ──
  console.log('── Integración con X3DH ──');
  const aliceBundle = generateKeyBundle(10);
  const bobBundle = generateKeyBundle(10);

  const bobPublicJson = serializePublicBundle(bobBundle);
  const bobPublic = deserializePublicBundle(bobPublicJson);

  // Alice inicia handshake X3DH
  const aliceX3DH = x3dhInitiate(aliceBundle.identityKey.privateKey, bobPublic, 0);

  // Bob responde al handshake X3DH
  const bobX3DH = x3dhRespond(
    bobBundle.identityKey.privateKey,
    bobBundle.signedPreKey.keyPair.privateKey,
    aliceBundle.identityKey.publicKey,
    aliceX3DH.ephemeralPublicKey,
    bobBundle.oneTimePreKeys[0].keyPair.privateKey
  );

  assert(
    toHex(aliceX3DH.sharedSecret) === toHex(bobX3DH.sharedSecret),
    'X3DH: Alice y Bob derivan el mismo shared secret'
  );

  // Crear ratchets desde el shared secret del X3DH
  const bobRatchetDH = generateDHKeyPair();

  const aliceRatchet = new DoubleRatchet(aliceX3DH.sharedSecret, true);
  aliceRatchet.initAsInitiator(bobRatchetDH.publicKey);

  const bobRatchet = new DoubleRatchet(bobX3DH.sharedSecret, false, bobRatchetDH);
  bobRatchet.initAsResponder(aliceRatchet.myDHKeyPair.publicKey);

  // Probar E2E
  const x3dhMsg1 = aliceRatchet.ratchetEncrypt('X3DH + Double Ratchet E2E 🚀');
  const x3dhDec1 = bobRatchet.ratchetDecrypt(x3dhMsg1.header, x3dhMsg1.ciphertext, x3dhMsg1.nonce);
  assert(x3dhDec1 === 'X3DH + Double Ratchet E2E 🚀', 'X3DH → Double Ratchet: Alice → Bob funciona');

  const x3dhMsg2 = bobRatchet.ratchetEncrypt('Confirmado desde Bob! 🔐');
  const x3dhDec2 = aliceRatchet.ratchetDecrypt(x3dhMsg2.header, x3dhMsg2.ciphertext, x3dhMsg2.nonce);
  assert(x3dhDec2 === 'Confirmado desde Bob! 🔐', 'X3DH → Double Ratchet: Bob → Alice funciona');
  console.log('');

  // ── Resumen ──
  console.log('╔══════════════════════════════════════════════════╗');
  console.log(`║  Resultados: ${passed} ✅ pasaron  ${failed} ❌ fallaron`);
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');

  if (failed === 0) {
    console.log('🎉 ¡Todos los tests pasaron! Double Ratchet v0.0.0.5 operativo.');
  } else {
    console.log('⚠️ Algunos tests fallaron.');
    process.exit(1);
  }
  console.log('');
}

runTests();
