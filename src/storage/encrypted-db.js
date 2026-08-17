/**
 * GhostLink v0.0.0.6 — Encrypted IndexedDB
 * 
 * Capa de persistencia cifrada sobre IndexedDB.
 * Todos los datos sensibles (excepto los keys/índices estrictamente necesarios)
 * se cifran usando XChaCha20-Poly1305 antes de almacenarse en el disco.
 */

import { encrypt, decrypt, toHex, fromHex, fromString, toString } from '../crypto/helpers.js';

export class EncryptedDB {
  /**
   * Inicializa la configuración de la base de datos.
   * @param {string} dbName - Nombre de la base de datos en IndexedDB
   * @param {number} version - Versión del esquema
   */
  constructor(dbName = "ghostlink-db", version = 1) {
    this.dbName = dbName;
    this.version = version;
    /** @type {IDBDatabase | null} */
    this.db = null;
    /** @type {Uint8Array | null} */
    this.encryptionKey = null;
    
    // Inyectar compatibilidad con Node.js si existe global.indexedDB (vía fake-indexeddb)
    // De lo contrario usa window.indexedDB (en el navegador)
    this._indexedDB = typeof globalThis.indexedDB !== 'undefined' 
      ? globalThis.indexedDB 
      : (typeof window !== 'undefined' ? window.indexedDB : null);
  }

  /**
   * Abre la conexión a la base de datos y almacena la clave en memoria.
   * @param {Uint8Array} encryptionKey - Clave simétrica de 32 bytes para cifrar la DB
   * @returns {Promise<void>}
   */
  open(encryptionKey) {
    if (!this._indexedDB) {
      return Promise.reject(new Error('IndexedDB no está disponible en este entorno.'));
    }

    // Almacenamos la clave en memoria
    this.encryptionKey = new Uint8Array(encryptionKey);

    return new Promise((resolve, reject) => {
      const request = this._indexedDB.open(this.dbName, this.version);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // "identities": guarda identidades creadas (keyPath = id)
        if (!db.objectStoreNames.contains('identities')) {
          db.createObjectStore('identities', { keyPath: 'id' });
        }

        // "contacts": guarda contactos (keyPath = ghostLinkId)
        if (!db.objectStoreNames.contains('contacts')) {
          db.createObjectStore('contacts', { keyPath: 'ghostLinkId' });
        }

        // "sessions": guarda estado de Double Ratchet (keyPath = contactId)
        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions', { keyPath: 'contactId' });
        }

        // "messages": guarda mensajes (keyPath = id, índices = contactId, timestamp)
        if (!db.objectStoreNames.contains('messages')) {
          const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
          msgStore.createIndex('contactId', 'contactId', { unique: false });
          msgStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // "settings": configuración de la app (keyPath = key)
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve();
      };

      request.onerror = (event) => {
        reject(new Error(`Error al abrir IndexedDB: ${event.target.error}`));
      };
    });
  }

  /**
   * Cierra la base de datos y borra la clave de memoria.
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    // Zero-out the key in memory for security
    if (this.encryptionKey) {
      this.encryptionKey.fill(0);
      this.encryptionKey = null;
    }
  }

  // ═══════════════════════════════════════════════════════
  // UTILIDADES CRIPTOGRÁFICAS (PRIVADAS)
  // ═══════════════════════════════════════════════════════

  /**
   * Cifra un objeto plano serializándolo a JSON primero.
   * @param {object} plainObject - El objeto a cifrar
   * @returns {{ iv: string, data: string }} Objeto con el ciphertext y el nonce en hex
   * @private
   */
  _encryptValue(plainObject) {
    if (!this.encryptionKey) throw new Error('Database no está abierta (encryptionKey missing)');
    const jsonStr = JSON.stringify(plainObject);
    const { ciphertext, nonce } = encrypt(fromString(jsonStr), this.encryptionKey);
    return {
      iv: toHex(nonce),
      data: toHex(ciphertext)
    };
  }

  /**
   * Descifra un ciphertext en hex y lo deserializa de JSON a objeto.
   * @param {{ iv: string, data: string }} encryptedObj - Ciphertext y nonce en hex
   * @returns {object} Objeto original
   * @private
   */
  _decryptValue(encryptedObj) {
    if (!this.encryptionKey) throw new Error('Database no está abierta (encryptionKey missing)');
    if (!encryptedObj || !encryptedObj.data || !encryptedObj.iv) {
      return encryptedObj; // No está cifrado, probablemente es un dato RAW
    }
    const decryptedBytes = decrypt(fromHex(encryptedObj.data), fromHex(encryptedObj.iv), this.encryptionKey);
    return JSON.parse(toString(decryptedBytes));
  }

  /**
   * Extrae el keyPath del objeto para mantenerlo en texto claro en el registro,
   * y cifra el resto del payload.
   * @param {string} storeName - Nombre del object store
   * @param {object} object - Objeto original
   * @returns {object} Objeto con las keys expuestas + payload cifrado
   * @private
   */
  _prepareRecordForStore(storeName, object) {
    // Clonamos para no mutar el original
    const plainPayload = { ...object };
    const record = {};

    // IndexedDB necesita ver las claves en claro para indexar
    switch (storeName) {
      case 'identities':
        record.id = plainPayload.id;
        delete plainPayload.id;
        break;
      case 'contacts':
        record.ghostLinkId = plainPayload.ghostLinkId;
        delete plainPayload.ghostLinkId;
        break;
      case 'sessions':
        record.contactId = plainPayload.contactId;
        delete plainPayload.contactId;
        break;
      case 'messages':
        record.id = plainPayload.id;
        record.contactId = plainPayload.contactId;
        record.timestamp = plainPayload.timestamp;
        delete plainPayload.id;
        delete plainPayload.contactId;
        delete plainPayload.timestamp;
        break;
      case 'settings':
        record.key = plainPayload.key;
        delete plainPayload.key;
        break;
    }

    // Cifrar el resto del payload
    const encrypted = this._encryptValue(plainPayload);
    record.iv = encrypted.iv;
    record.data = encrypted.data;

    return record;
  }

  /**
   * Reconstruye el objeto original combinando las keys en texto claro
   * con el payload descifrado.
   * @param {string} storeName - Nombre del object store
   * @param {object} record - Registro obtenido de IndexedDB
   * @returns {object} Objeto original descifrado
   * @private
   */
  _restoreRecordFromStore(storeName, record) {
    if (!record) return null;
    
    // Descifrar payload
    const plainPayload = this._decryptValue({ iv: record.iv, data: record.data });
    
    // Combinar con keys expuestas
    const result = { ...plainPayload };
    
    switch (storeName) {
      case 'identities':
        result.id = record.id;
        break;
      case 'contacts':
        result.ghostLinkId = record.ghostLinkId;
        break;
      case 'sessions':
        result.contactId = record.contactId;
        break;
      case 'messages':
        result.id = record.id;
        result.contactId = record.contactId;
        result.timestamp = record.timestamp;
        break;
      case 'settings':
        result.key = record.key;
        break;
    }
    
    return result;
  }

  // ═══════════════════════════════════════════════════════
  // OPERACIONES GENÉRICAS CRUD
  // ═══════════════════════════════════════════════════════

  async put(storeName, object) {
    if (!this.db) throw new Error('Database no está abierta');
    const record = this._prepareRecordForStore(storeName, object);
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(record);
      
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async get(storeName, key) {
    if (!this.db) throw new Error('Database no está abierta');
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);
      
      request.onsuccess = (e) => {
        if (e.target.result) {
          try {
            resolve(this._restoreRecordFromStore(storeName, e.target.result));
          } catch (err) {
            reject(new Error(`Failed to decrypt record in ${storeName}: ${err.message}`));
          }
        } else {
          resolve(null);
        }
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async getAll(storeName) {
    if (!this.db) throw new Error('Database no está abierta');
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();
      
      request.onsuccess = (e) => {
        try {
          const results = e.target.result.map(record => this._restoreRecordFromStore(storeName, record));
          resolve(results);
        } catch (err) {
          reject(new Error(`Failed to decrypt records in ${storeName}: ${err.message}`));
        }
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async delete(storeName, key) {
    if (!this.db) throw new Error('Database no está abierta');
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);
      
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async getByIndex(storeName, indexName, value, limit = null) {
    if (!this.db) throw new Error('Database no está abierta');
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(value, limit ? limit : undefined);
      
      request.onsuccess = (e) => {
        try {
          const results = e.target.result.map(record => this._restoreRecordFromStore(storeName, record));
          resolve(results);
        } catch (err) {
          reject(new Error(`Failed to decrypt index records in ${storeName}: ${err.message}`));
        }
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  // ═══════════════════════════════════════════════════════
  // MÉTODOS DE CONVENIENCIA
  // ═══════════════════════════════════════════════════════

  async saveIdentity(identity) { return this.put('identities', identity); }
  async getIdentity(ghostLinkId) { return this.get('identities', ghostLinkId); }
  
  async saveContact(contact) { return this.put('contacts', contact); }
  async getContact(ghostLinkId) { return this.get('contacts', ghostLinkId); }
  async getAllContacts() { return this.getAll('contacts'); }
  
  async saveSession(session) { return this.put('sessions', session); }
  async getSession(contactId) { return this.get('sessions', contactId); }
  
  async saveMessage(message) { return this.put('messages', message); }
  async getMessages(contactId, limit = 50) { 
    // Los mensajes se obtienen por el index contactId.
    // IndexedDB los devuelve ordenados por la primary key por defecto (que es id).
    // Si queremos que los devuelva por timestamp de forma nativa, tendríamos que iterar 
    // un cursor con IDBKeyRange e index compuesto.
    // Por simplicidad, obtenemos todos los del contacto y ordenamos/limitamos en memoria,
    // asumiendo que para una app de chat local esto es razonablemente rápido.
    // Una implementación más avanzada usaría cursores y 'prev'.
    let msgs = await this.getByIndex('messages', 'contactId', contactId);
    msgs.sort((a, b) => a.timestamp - b.timestamp);
    if (limit && msgs.length > limit) {
      msgs = msgs.slice(msgs.length - limit);
    }
    return msgs;
  }
  
  async saveSetting(key, value) { return this.put('settings', { key, value }); }
  async getSetting(key) { 
    const res = await this.get('settings', key); 
    return res ? res.value : null;
  }
}
