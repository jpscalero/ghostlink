/**
 * GhostLink — Sodium Init
 * v0.0.0.1
 * 
 * Singleton de inicialización de libsodium.js (WASM).
 * Todas las operaciones criptográficas de la app dependen de este módulo.
 * 
 * Uso:
 *   import { getSodium } from './sodium-init.js';
 *   const sodium = await getSodium();
 *   // sodium está listo para usar
 */

import _sodium from 'libsodium-wrappers-sumo';

let _instance = null;
let _initPromise = null;

/**
 * Inicializa libsodium si no está ya cargado.
 * Retorna la instancia singleton lista para usar.
 * Thread-safe: múltiples llamadas concurrentes comparten la misma promesa.
 * 
 * @returns {Promise<import('libsodium-wrappers-sumo')>}
 */
export async function getSodium() {
  if (_instance) return _instance;

  if (!_initPromise) {
    _initPromise = (async () => {
      await _sodium.ready;
      _instance = _sodium;
      return _instance;
    })();
  }

  return _initPromise;
}

/**
 * Verifica que sodium esté inicializado.
 * Lanza error si no lo está (útil para funciones síncronas).
 * 
 * @returns {import('libsodium-wrappers-sumo')}
 */
export function requireSodium() {
  if (!_instance) {
    throw new Error('[GhostLink] Sodium no inicializado. Llama a getSodium() primero.');
  }
  return _instance;
}
