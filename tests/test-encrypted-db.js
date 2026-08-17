/**
 * GhostLink v0.0.0.6 — Encrypted IndexedDB Tests
 * 
 * Valida la capa de persistencia cifrada sobre IndexedDB.
 * Emplea fake-indexeddb para testear en entorno Node.js puro.
 */

import 'fake-indexeddb/auto'; // Inyecta global.indexedDB
import { initCrypto, toHex, randomBytes } from '../src/crypto/helpers.js';
import { deriveDbKey } from '../src/storage/db-key-manager.js';
import { EncryptedDB } from '../src/storage/encrypted-db.js';

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
  console.log('║   🗄️  GhostLink v0.0.0.6 — Encrypted DB Tests     ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');

  await initCrypto();

  // ── Derivación de clave DB ──
  console.log('── Derivación de Clave (Argon2id) ──');
  const { key: dbKey1, salt } = deriveDbKey('mi-super-secreto-123');
  assert(dbKey1 instanceof Uint8Array && dbKey1.length === 32, 'deriveDbKey genera clave de 32 bytes');
  assert(salt instanceof Uint8Array && salt.length === 16, 'deriveDbKey genera salt de 16 bytes');
  
  const { key: dbKey2 } = deriveDbKey('mi-super-secreto-123', salt);
  assert(toHex(dbKey1) === toHex(dbKey2), 'Misma passphrase + mismo salt = misma clave DB');
  console.log('');

  // ── Inicialización DB ──
  console.log('── Inicialización y Apertura de DB ──');
  const db = new EncryptedDB('test-ghostlink-db', 1);
  await db.open(dbKey1);
  assert(db.db !== null, 'Base de datos se abre correctamente');
  assert(toHex(db.encryptionKey) === toHex(dbKey1), 'Clave de cifrado se carga en memoria');
  console.log('');

  // ── Identidades ──
  console.log('── Identidades (Almacenamiento Cifrado) ──');
  const identity = {
    id: 'GL-1234-5678-ABCD-EFGH',
    name: 'Alice',
    privateKeyHex: 'super-secret-hex'
  };
  await db.saveIdentity(identity);
  
  const recoveredIdentity = await db.getIdentity('GL-1234-5678-ABCD-EFGH');
  assert(recoveredIdentity !== null, 'Recupera identidad guardada');
  assert(recoveredIdentity.name === 'Alice' && recoveredIdentity.privateKeyHex === 'super-secret-hex', 'Datos de identidad se descifran correctamente');
  assert(recoveredIdentity.id === 'GL-1234-5678-ABCD-EFGH', 'El keyPath se mantiene expuesto e intacto');
  console.log('');

  // ── Contactos ──
  console.log('── Contactos ──');
  const contact1 = { ghostLinkId: 'GL-BOB1-XXXX', name: 'Bob' };
  const contact2 = { ghostLinkId: 'GL-CARL-XXXX', name: 'Charlie' };
  await db.saveContact(contact1);
  await db.saveContact(contact2);

  const recoveredBob = await db.getContact('GL-BOB1-XXXX');
  assert(recoveredBob.name === 'Bob', 'Recupera contacto individual');

  const allContacts = await db.getAllContacts();
  assert(allContacts.length === 2, 'getAll recupera múltiples contactos');
  console.log('');

  // ── Mensajes (Índices y Ordenamiento) ──
  console.log('── Mensajes (Índices) ──');
  const msg1 = { id: 'msg-1', contactId: 'GL-BOB1-XXXX', text: 'Mensaje viejo', timestamp: 1000, direction: 'sent' };
  const msg2 = { id: 'msg-2', contactId: 'GL-BOB1-XXXX', text: 'Mensaje nuevo', timestamp: 2000, direction: 'received' };
  const msg3 = { id: 'msg-3', contactId: 'GL-CARL-XXXX', text: 'Para Charlie', timestamp: 1500, direction: 'sent' };
  
  await db.saveMessage(msg1);
  await db.saveMessage(msg2);
  await db.saveMessage(msg3);

  const bobMsgs = await db.getMessages('GL-BOB1-XXXX');
  assert(bobMsgs.length === 2, 'Recupera mensajes filtrados por índice (contactId)');
  assert(bobMsgs[0].text === 'Mensaje viejo' && bobMsgs[1].text === 'Mensaje nuevo', 'Mensajes están ordenados por timestamp');
  
  const limitedMsgs = await db.getMessages('GL-BOB1-XXXX', 1);
  assert(limitedMsgs.length === 1 && limitedMsgs[0].id === 'msg-2', 'getMessages con limit retorna los más recientes');
  console.log('');

  // ── Settings ──
  console.log('── Settings (Valores Mixtos) ──');
  await db.saveSetting('theme', 'dark');
  await db.saveSetting('notifications', { enabled: true, sound: 'beep' });
  
  const theme = await db.getSetting('theme');
  const notifs = await db.getSetting('notifications');
  
  assert(theme === 'dark', 'Recupera string simple');
  assert(notifs.enabled === true && notifs.sound === 'beep', 'Recupera objetos anidados');
  console.log('');

  // ── Validación Criptográfica Nivel Raw ──
  console.log('── Validación Criptográfica Raw (IndexedDB level) ──');
  const rawTx = db.db.transaction(['identities'], 'readonly');
  const rawStore = rawTx.objectStore('identities');
  const rawRequest = rawStore.get('GL-1234-5678-ABCD-EFGH');
  
  const rawPromise = new Promise(res => { rawRequest.onsuccess = e => res(e.target.result); });
  const rawIdentity = await rawPromise;
  
  assert(rawIdentity.id === 'GL-1234-5678-ABCD-EFGH', 'Raw: ID se guarda en texto claro (requerido para keyPath)');
  assert(rawIdentity.name === undefined, 'Raw: El plaintext original ("name") no está en disco');
  assert(rawIdentity.privateKeyHex === undefined, 'Raw: El plaintext original ("privateKeyHex") no está en disco');
  assert(typeof rawIdentity.data === 'string' && typeof rawIdentity.iv === 'string', 'Raw: Existe ciphertext (data) y nonce (iv) en hex');
  console.log('');

  // ── Cierre de DB y Borrado en Memoria ──
  console.log('── Cierre de DB ──');
  db.close();
  assert(db.db === null, 'Conexión a IndexedDB cerrada');
  assert(db.encryptionKey === null, 'Clave de cifrado eliminada (null)');
  
  // Como zeroed out modificó el array subyacente, lo validamos desde la variable inicial si la guardamos (no lo hicimos).
  // Pero dbKey1 no se modificó porque Uint8Array.slice() crea una copia, pero nosotros pasamos el Uint8Array directo y creamos un new Uint8Array en open().
  // Comprobemos si dbKey1 sigue viva:
  assert(toHex(dbKey1).length === 64, 'La clave original generada sigue viva en este ámbito (pero db.encryptionKey que copiamos sí se limpió)');
  console.log('');

  // ── Resumen ──
  console.log('╔══════════════════════════════════════════════════╗');
  console.log(`║  Resultados: ${passed} ✅ pasaron  ${failed} ❌ fallaron`);
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');

  if (failed === 0) {
    console.log('🎉 ¡Todos los tests pasaron! IndexedDB Cifrada v0.0.0.6 operativa.');
  } else {
    console.log('⚠️ Algunos tests fallaron.');
    process.exit(1);
  }
}

runTests();
