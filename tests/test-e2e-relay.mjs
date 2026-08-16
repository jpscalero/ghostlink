/**
 * Test E2E completo: simula DOS personas usando GhostLink
 * Persona A y Persona B intercambian claves, se conectan al relay,
 * y se envían mensajes cifrados.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const WebSocket = require('ws');

import {
  initCrypto,
  generateDHKeyPair,
  diffieHellman,
  encrypt,
  decryptToString,
  toHex,
  fromHex
} from '../src/crypto/helpers.js';

const RELAY_URL = 'wss://ghostlink-2pwd.onrender.com';

async function runTest() {
  console.log('=== TEST E2E COMPLETO DE GHOSTLINK ===\n');

  // 1. Inicializar crypto
  console.log('[1] Inicializando libsodium...');
  await initCrypto();
  console.log('    OK\n');

  // 2. Generar claves para ambas personas
  console.log('[2] Generando claves para Persona A y Persona B...');
  const personaA = generateDHKeyPair();
  const personaB = generateDHKeyPair();
  const pubA = toHex(personaA.publicKey);
  const pubB = toHex(personaB.publicKey);
  console.log(`    Persona A pub: ${pubA.substring(0, 16)}...`);
  console.log(`    Persona B pub: ${pubB.substring(0, 16)}...`);
  console.log('    OK\n');

  // 3. Derivar secreto compartido
  console.log('[3] Derivando secreto compartido...');
  const privAHex = toHex(personaA.privateKey);
  const privBHex = toHex(personaB.privateKey);
  
  const sharedA_bytes = diffieHellman(fromHex(privAHex), fromHex(pubB));
  const sharedB_bytes = diffieHellman(fromHex(privBHex), fromHex(pubA));
  const sharedA = toHex(sharedA_bytes);
  const sharedB = toHex(sharedB_bytes);
  
  console.log(`    SharedSecret A: ${sharedA.substring(0, 16)}...`);
  console.log(`    SharedSecret B: ${sharedB.substring(0, 16)}...`);
  console.log(`    Iguales: ${sharedA === sharedB}`);
  if (sharedA !== sharedB) {
    console.error('FALLO: Los secretos compartidos no coinciden.');
    process.exit(1);
  }
  console.log('');

  // 4. Test de cifrado/descifrado local
  console.log('[4] Test de cifrado/descifrado local...');
  const testMsg = 'Hola desde GhostLink E2E test';
  const encrypted = encrypt(testMsg, fromHex(sharedA));
  const encPayload = {
    c: toHex(encrypted.ciphertext),
    n: toHex(encrypted.nonce)
  };
  const decrypted = decryptToString(
    fromHex(encPayload.c),
    fromHex(encPayload.n),
    fromHex(sharedB)
  );
  console.log(`    Original:   "${testMsg}"`);
  console.log(`    Descifrado: "${decrypted}"`);
  console.log(`    Coinciden:  ${testMsg === decrypted}\n`);

  // 5. Test completo a través del relay
  console.log('[5] Conectando ambas personas al relay...');
  console.log(`    URL: ${RELAY_URL}`);
  console.log('    (Puede tardar hasta 60s si el servidor esta dormido...)\n');

  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('TIMEOUT: El relay no respondio en 60 segundos'));
    }, 60000);

    const wsA = new WebSocket(RELAY_URL);
    const wsB = new WebSocket(RELAY_URL);
    let bothOpen = 0;

    const onBothOpen = () => {
      bothOpen++;
      if (bothOpen < 2) return;
      
      console.log('    Ambas personas conectadas al relay\n');
      console.log('[6] Persona A envia mensaje cifrado...');

      const msg = 'Hola Persona B! Este mensaje es secreto';
      const enc = encrypt(msg, fromHex(sharedA));
      const payload = JSON.stringify({
        c: toHex(enc.ciphertext),
        n: toHex(enc.nonce)
      });
      console.log(`    Mensaje original: "${msg}"`);
      console.log(`    Payload size:     ${payload.length} bytes`);
      wsA.send(payload);
      console.log('    Enviado al relay\n');
    };

    wsA.on('open', () => {
      console.log('    Persona A: conectada');
      onBothOpen();
    });

    wsB.on('open', () => {
      console.log('    Persona B: conectada');
      onBothOpen();
    });

    wsB.on('message', (rawData) => {
      console.log('[7] Persona B recibe paquete del relay...');
      try {
        const dataStr = rawData.toString();
        console.log(`    Raw type:   ${rawData.constructor.name}`);
        console.log(`    Str length: ${dataStr.length}`);
        
        const data = JSON.parse(dataStr);
        console.log(`    Campo c:    ${!!data.c}`);
        console.log(`    Campo n:    ${!!data.n}`);
        
        if (data.c && data.n) {
          const plaintext = decryptToString(
            fromHex(data.c),
            fromHex(data.n),
            fromHex(sharedB)
          );
          console.log(`    Descifrado: "${plaintext}"`);
          console.log('\n    === TEST E2E: EXITO TOTAL ===');
          clearTimeout(timeout);
          wsA.close();
          wsB.close();
          resolve(true);
        }
      } catch (err) {
        console.error(`    Error al descifrar: ${err.message}`);
        clearTimeout(timeout);
        wsA.close();
        wsB.close();
        resolve(false);
      }
    });

    wsA.on('error', (e) => { console.error('    Error WS A:', e.message); });
    wsB.on('error', (e) => { console.error('    Error WS B:', e.message); });
  });

  console.log('\n=== FIN DEL TEST ===');
  process.exit(result ? 0 : 1);
}

runTest().catch((err) => {
  console.error('\nERROR FATAL:', err.message);
  process.exit(1);
});
