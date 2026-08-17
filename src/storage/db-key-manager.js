/**
 * GhostLink v0.0.0.6 — Database Key Manager
 * 
 * Gestiona la derivación de la clave de cifrado para la base de datos
 * IndexedDB a partir de la passphrase del usuario, usando Argon2id.
 */

import { deriveKeyFromPassphrase, randomBytes, toHex } from '../crypto/helpers.js';

/**
 * Deriva una clave de 32 bytes para cifrar la base de datos a partir
 * de la passphrase del usuario.
 * 
 * NOTA: El salt generado debe guardarse (en localStorage o en texto claro
 * en otro lugar) para poder re-derivar la MISMA clave cuando el usuario
 * vuelva a abrir la aplicación.
 * 
 * @param {string} passphrase - Passphrase ingresada por el usuario
 * @param {Uint8Array} [salt] - Salt de 16 bytes. Si no se provee, se genera uno nuevo.
 * @returns {{ key: Uint8Array, salt: Uint8Array }}
 */
export function deriveDbKey(passphrase, salt = null) {
  // Helpers.js deriveKeyFromPassphrase usa libsodium crypto_pwhash
  // con parámetros interactivos por defecto, lo cual es adecuado para
  // derivar claves rápidamente al abrir la app.
  return deriveKeyFromPassphrase(passphrase, salt);
}
