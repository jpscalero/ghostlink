/**
 * GhostLink — X3DH Keystore
 * v0.0.0.3
 *
 * Implementa la generación de bundles de claves X3DH (Extended Triple
 * Diffie-Hellman), el mismo protocolo que usa Signal para establecer
 * sesiones cifradas de forma asíncrona.
 *
 * Un bundle X3DH contiene:
 *   - Identity Key (IK):     Ed25519 permanente — la identidad del usuario
 *   - Signed PreKey (SPK):   X25519 rotativo (7 días), firmado por la IK
 *   - One-Time PreKeys (OPK): X25519 efímeros de un solo uso (100 por defecto)
 *
 * Dependencias: solo helpers.js (que envuelve libsodium)
 */

import {
  generateSigningKeyPair,
  generateDHKeyPair,
  edToX25519Public,
  edToX25519Private,
  sign,
  verify,
  diffieHellman,
  hkdfDerive,
  toHex,
  fromHex,
  fromString,
  randomBytes,
} from './helpers.js';

// ═══════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════

/** Días antes de rotar el Signed PreKey */
export const SIGNED_PREKEY_ROTATION_DAYS = 7;

/** Número predeterminado de One-Time PreKeys por bundle */
export const DEFAULT_OPK_COUNT = 100;

/** Info string para HKDF en el handshake X3DH */
const X3DH_HKDF_INFO = 'GhostLink_X3DH_SharedSecret';

/** Salt fijo para HKDF (32 bytes de ceros, como en la spec de Signal) */
const X3DH_HKDF_SALT = new Uint8Array(32);

// ═══════════════════════════════════════════════════════
// IDENTITY KEY
// ═══════════════════════════════════════════════════════

/**
 * Genera un Identity Key (IK) permanente.
 * Es un par Ed25519 que representa la identidad criptográfica del usuario.
 * Se genera UNA vez y se mantiene para siempre.
 *
 * @returns {{ publicKey: Uint8Array, privateKey: Uint8Array }}
 */
export function generateIdentityKey() {
  return generateSigningKeyPair();
}

// ═══════════════════════════════════════════════════════
// SIGNED PREKEY
// ═══════════════════════════════════════════════════════

/**
 * Genera un Signed PreKey (SPK).
 * Es un par X25519 firmado digitalmente por la Identity Key.
 * Se rota cada SIGNED_PREKEY_ROTATION_DAYS días.
 *
 * @param {Uint8Array} identityPrivateKey — Ed25519 private key (64 bytes)
 * @returns {{
 *   keyPair: { publicKey: Uint8Array, privateKey: Uint8Array },
 *   signature: Uint8Array,
 *   timestamp: number,
 *   keyId: number
 * }}
 */
export function generateSignedPreKey(identityPrivateKey) {
  const keyPair = generateDHKeyPair();
  const timestamp = Date.now();

  // Firmamos la public key del SPK con la Identity Key
  const signature = sign(keyPair.publicKey, identityPrivateKey);

  // ID aleatorio de 4 bytes para identificar este SPK
  const idBytes = randomBytes(4);
  const keyId = new DataView(idBytes.buffer).getUint32(0);

  return {
    keyPair,
    signature,
    timestamp,
    keyId,
  };
}

/**
 * Verifica la firma de un Signed PreKey recibido.
 *
 * @param {Uint8Array} signature — Firma de 64 bytes
 * @param {Uint8Array} preKeyPublic — X25519 public key del SPK
 * @param {Uint8Array} identityPublicKey — Ed25519 public key del firmante
 * @returns {boolean}
 */
export function verifySignedPreKey(signature, preKeyPublic, identityPublicKey) {
  return verify(signature, preKeyPublic, identityPublicKey);
}

// ═══════════════════════════════════════════════════════
// ONE-TIME PREKEYS
// ═══════════════════════════════════════════════════════

/**
 * Genera N One-Time PreKeys (OPK) efímeros.
 * Cada OPK es un par X25519 con un ID secuencial.
 * Se consumen de uno en uno cuando alguien inicia una sesión.
 *
 * @param {number} [count=DEFAULT_OPK_COUNT] — Número de OPKs a generar
 * @param {number} [startId=0] — ID inicial (para generar más sin solapar)
 * @returns {Array<{ keyId: number, keyPair: { publicKey: Uint8Array, privateKey: Uint8Array } }>}
 */
export function generateOneTimePreKeys(count = DEFAULT_OPK_COUNT, startId = 0) {
  const keys = [];
  for (let i = 0; i < count; i++) {
    keys.push({
      keyId: startId + i,
      keyPair: generateDHKeyPair(),
    });
  }
  return keys;
}

// ═══════════════════════════════════════════════════════
// BUNDLE COMPLETO
// ═══════════════════════════════════════════════════════

/**
 * Genera un bundle X3DH completo: IK + SPK firmado + OPKs.
 * Esto es lo que un usuario "sube" al servidor para que otros
 * puedan iniciar sesiones cifradas con él, incluso estando offline.
 *
 * @param {number} [opkCount=DEFAULT_OPK_COUNT] — Número de One-Time PreKeys
 * @returns {{
 *   identityKey: { publicKey: Uint8Array, privateKey: Uint8Array },
 *   signedPreKey: { keyPair, signature, timestamp, keyId },
 *   oneTimePreKeys: Array<{ keyId, keyPair }>
 * }}
 */
export function generateKeyBundle(opkCount = DEFAULT_OPK_COUNT) {
  const identityKey = generateIdentityKey();
  const signedPreKey = generateSignedPreKey(identityKey.privateKey);
  const oneTimePreKeys = generateOneTimePreKeys(opkCount);

  return {
    identityKey,
    signedPreKey,
    oneTimePreKeys,
  };
}

// ═══════════════════════════════════════════════════════
// SERIALIZACIÓN (para intercambio/almacenamiento)
// ═══════════════════════════════════════════════════════

/**
 * Serializa las partes PÚBLICAS de un bundle a JSON hex.
 * Esto es lo que se compartiría con otros usuarios o se subiría a un servidor.
 * Las private keys NUNCA salen del dispositivo.
 *
 * @param {{ identityKey, signedPreKey, oneTimePreKeys }} bundle
 * @returns {string} JSON string
 */
export function serializePublicBundle(bundle) {
  return JSON.stringify({
    ik: toHex(bundle.identityKey.publicKey),
    spk: {
      key: toHex(bundle.signedPreKey.keyPair.publicKey),
      sig: toHex(bundle.signedPreKey.signature),
      ts: bundle.signedPreKey.timestamp,
      id: bundle.signedPreKey.keyId,
    },
    opks: bundle.oneTimePreKeys.map((opk) => ({
      id: opk.keyId,
      key: toHex(opk.keyPair.publicKey),
    })),
  });
}

/**
 * Deserializa un bundle público desde JSON hex.
 *
 * @param {string} json — JSON string producido por serializePublicBundle
 * @returns {{
 *   identityPublicKey: Uint8Array,
 *   signedPreKey: { publicKey: Uint8Array, signature: Uint8Array, timestamp: number, keyId: number },
 *   oneTimePreKeys: Array<{ keyId: number, publicKey: Uint8Array }>
 * }}
 */
export function deserializePublicBundle(json) {
  const data = JSON.parse(json);

  return {
    identityPublicKey: fromHex(data.ik),
    signedPreKey: {
      publicKey: fromHex(data.spk.key),
      signature: fromHex(data.spk.sig),
      timestamp: data.spk.ts,
      keyId: data.spk.id,
    },
    oneTimePreKeys: data.opks.map((opk) => ({
      keyId: opk.id,
      publicKey: fromHex(opk.key),
    })),
  };
}

// ═══════════════════════════════════════════════════════
// HANDSHAKE X3DH (Initiator / Responder)
// ═══════════════════════════════════════════════════════

/**
 * Ejecuta el lado del INICIADOR del handshake X3DH.
 *
 * Alice (iniciadora) usa el bundle público de Bob para derivar un
 * secreto compartido sin que Bob esté online.
 *
 * Los 3-4 intercambios DH son:
 *   DH1 = DH(IK_A_x25519, SPK_B)      — Alice IK ↔ Bob SPK
 *   DH2 = DH(EK_A, IK_B_x25519)       — Alice ephemeral ↔ Bob IK
 *   DH3 = DH(EK_A, SPK_B)             — Alice ephemeral ↔ Bob SPK
 *   DH4 = DH(EK_A, OPK_B)            — Alice ephemeral ↔ Bob OPK (opcional)
 *
 * @param {Uint8Array} aliceIdentityPrivate — Ed25519 private key de Alice (64 bytes)
 * @param {{
 *   identityPublicKey: Uint8Array,
 *   signedPreKey: { publicKey, signature, keyId },
 *   oneTimePreKeys: Array<{ keyId, publicKey }>
 * }} bobBundle — Bundle público de Bob (deserializado)
 * @param {number} [opkIndex=0] — Índice del OPK de Bob a consumir
 * @returns {{
 *   sharedSecret: Uint8Array,
 *   ephemeralPublicKey: Uint8Array,
 *   usedOpkId: number | null
 * }}
 * @throws Si la firma del SPK de Bob no es válida
 */
export function x3dhInitiate(aliceIdentityPrivate, bobBundle, opkIndex = 0) {
  // 1. Verificar la firma del SPK de Bob
  const spkValid = verifySignedPreKey(
    bobBundle.signedPreKey.signature,
    bobBundle.signedPreKey.publicKey,
    bobBundle.identityPublicKey
  );
  if (!spkValid) {
    throw new Error('X3DH: La firma del Signed PreKey de Bob es inválida. Posible ataque MITM.');
  }

  // 2. Convertir la IK de Alice (Ed25519) a X25519 para poder hacer DH
  const aliceIkX25519Private = edToX25519Private(aliceIdentityPrivate);

  // 3. Generar ephemeral key de Alice
  const ephemeralKey = generateDHKeyPair();

  // 4. Ejecutar los DH
  const dh1 = diffieHellman(aliceIkX25519Private, bobBundle.signedPreKey.publicKey);
  const dh2 = diffieHellman(ephemeralKey.privateKey, edToX25519Public(bobBundle.identityPublicKey));
  const dh3 = diffieHellman(ephemeralKey.privateKey, bobBundle.signedPreKey.publicKey);

  // DH4 es opcional (solo si hay OPKs disponibles)
  let dh4 = null;
  let usedOpkId = null;
  if (bobBundle.oneTimePreKeys && bobBundle.oneTimePreKeys.length > opkIndex) {
    const opk = bobBundle.oneTimePreKeys[opkIndex];
    dh4 = diffieHellman(ephemeralKey.privateKey, opk.publicKey);
    usedOpkId = opk.keyId;
  }

  // 5. Concatenar todos los DH outputs
  const dhConcat = dh4
    ? concatBytes(dh1, dh2, dh3, dh4)
    : concatBytes(dh1, dh2, dh3);

  // 6. Derivar el shared secret final con HKDF
  const sharedSecret = hkdfDerive(
    dhConcat,
    X3DH_HKDF_SALT,
    X3DH_HKDF_INFO,
    32
  );

  return {
    sharedSecret,
    ephemeralPublicKey: ephemeralKey.publicKey,
    usedOpkId,
  };
}

/**
 * Ejecuta el lado del RESPONDEDOR del handshake X3DH.
 *
 * Bob (respondedor) recibe el mensaje inicial de Alice que contiene
 * su IK pública y su ephemeral key, y deriva el mismo secreto compartido.
 *
 * @param {Uint8Array} bobIdentityPrivate — Ed25519 private key de Bob (64 bytes)
 * @param {Uint8Array} bobSpkPrivate — X25519 private key del SPK de Bob (32 bytes)
 * @param {Uint8Array} aliceIdentityPublic — Ed25519 public key de Alice (32 bytes)
 * @param {Uint8Array} aliceEphemeralPublic — X25519 ephemeral public key de Alice
 * @param {Uint8Array | null} [bobOpkPrivate=null] — X25519 private key del OPK consumido
 * @returns {{ sharedSecret: Uint8Array }}
 */
export function x3dhRespond(
  bobIdentityPrivate,
  bobSpkPrivate,
  aliceIdentityPublic,
  aliceEphemeralPublic,
  bobOpkPrivate = null
) {
  // Convertir la IK de Bob (Ed25519) a X25519
  const bobIkX25519Private = edToX25519Private(bobIdentityPrivate);

  // Ejecutar los mismos DH en espejo
  const dh1 = diffieHellman(bobSpkPrivate, edToX25519Public(aliceIdentityPublic));
  const dh2 = diffieHellman(bobIkX25519Private, aliceEphemeralPublic);
  const dh3 = diffieHellman(bobSpkPrivate, aliceEphemeralPublic);

  let dh4 = null;
  if (bobOpkPrivate) {
    dh4 = diffieHellman(bobOpkPrivate, aliceEphemeralPublic);
  }

  // Concatenar y derivar
  const dhConcat = dh4
    ? concatBytes(dh1, dh2, dh3, dh4)
    : concatBytes(dh1, dh2, dh3);

  const sharedSecret = hkdfDerive(
    dhConcat,
    X3DH_HKDF_SALT,
    X3DH_HKDF_INFO,
    32
  );

  return { sharedSecret };
}

// ═══════════════════════════════════════════════════════
// UTILIDADES INTERNAS
// ═══════════════════════════════════════════════════════

/**
 * Concatena múltiples Uint8Arrays en uno solo.
 * @param {...Uint8Array} arrays
 * @returns {Uint8Array}
 */
function concatBytes(...arrays) {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}
