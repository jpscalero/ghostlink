/**
 * GhostLink v0.0.0.5 — Double Ratchet
 *
 * Implementación del algoritmo Double Ratchet de Signal sobre libsodium.
 * Cada mensaje usa una clave única, proporcionando forward secrecy
 * y break-in recovery.
 *
 * Referencia: https://signal.org/docs/specifications/doubleratchet/
 */

import {
  generateDHKeyPair,
  diffieHellman,
  encrypt,
  decrypt,
  blake2b,
  hkdfDerive,
  toHex,
  fromHex,
  fromString,
  toString,
} from './helpers.js';

/**
 * Máximo de mensajes que se pueden saltar en una cadena (defensa contra DoS).
 */
const MAX_SKIP = 100;

// ═══════════════════════════════════════════════════════
// KDF HELPERS
// ═══════════════════════════════════════════════════════

/**
 * Root KDF: deriva un nuevo rootKey y un chainKey a partir del rootKey actual
 * y el output de un intercambio DH.
 *
 * @param {Uint8Array} rootKey - Root key actual (32 bytes)
 * @param {Uint8Array} dhOutput - Output del intercambio DH (32 bytes)
 * @returns {{ rootKey: Uint8Array, chainKey: Uint8Array }}
 */
function rootKDF(rootKey, dhOutput) {
  // Derivamos 32 bytes para el nuevo rootKey
  const newRootKey = hkdfDerive(dhOutput, rootKey, 'GhostLink_RootKDF_r', 32);
  // Derivamos 32 bytes para el nuevo chainKey
  const newChainKey = hkdfDerive(dhOutput, rootKey, 'GhostLink_RootKDF_c', 32);
  return { rootKey: newRootKey, chainKey: newChainKey };
}

/**
 * Chain KDF: deriva una messageKey y el siguiente chainKey a partir
 * del chainKey actual.
 *
 * @param {Uint8Array} chainKey - Chain key actual (32 bytes)
 * @returns {{ messageKey: Uint8Array, nextChainKey: Uint8Array }}
 */
function chainKDF(chainKey) {
  // messageKey = BLAKE2b(chainKey || 0x01, 32)
  const mkInput = new Uint8Array(chainKey.length + 1);
  mkInput.set(chainKey);
  mkInput[chainKey.length] = 0x01;
  const messageKey = blake2b(mkInput, 32);

  // nextChainKey = BLAKE2b(chainKey || 0x02, 32)
  const ckInput = new Uint8Array(chainKey.length + 1);
  ckInput.set(chainKey);
  ckInput[chainKey.length] = 0x02;
  const nextChainKey = blake2b(ckInput, 32);

  return { messageKey, nextChainKey };
}

// ═══════════════════════════════════════════════════════
// DOUBLE RATCHET
// ═══════════════════════════════════════════════════════

export class DoubleRatchet {
  /**
   * Crea una nueva instancia del Double Ratchet.
   *
   * @param {Uint8Array} sharedSecret - Secreto compartido del handshake X3DH (32 bytes)
   * @param {boolean} isInitiator - true si esta parte inició la sesión (Alice)
   * @param {{ publicKey: Uint8Array, privateKey: Uint8Array }} [myDHKeyPair] - Par X25519 inicial (opcional)
   */
  constructor(sharedSecret, isInitiator, myDHKeyPair = null) {
    /** @type {Uint8Array} Root key */
    this.rootKey = new Uint8Array(sharedSecret);

    /** @type {Uint8Array|null} Chain key de envío */
    this.sendChainKey = null;

    /** @type {Uint8Array|null} Chain key de recepción */
    this.recvChainKey = null;

    /** @type {number} Contador de mensajes enviados en la cadena actual */
    this.sendMessageNumber = 0;

    /** @type {number} Contador de mensajes recibidos en la cadena actual */
    this.recvMessageNumber = 0;

    /** @type {number} Mensajes enviados en la cadena anterior (para header) */
    this.previousSendCount = 0;

    /** @type {{ publicKey: Uint8Array, privateKey: Uint8Array }} Par DH actual */
    this.myDHKeyPair = myDHKeyPair || generateDHKeyPair();

    /** @type {Uint8Array|null} Última public key DH del peer */
    this.remoteDHPublicKey = null;

    /** @type {Map<string, Uint8Array>} Claves de mensajes saltados */
    this.skippedMessages = new Map();

    /** @type {boolean} Si esta parte es la iniciadora */
    this._isInitiator = isInitiator;
  }

  /**
   * Inicializa el ratchet como iniciador (Alice).
   * Se llama después de recibir el bundle público del respondedor.
   *
   * @param {Uint8Array} remoteDHPublicKey - Public key DH del respondedor (normalmente la SPK de Bob)
   */
  initAsInitiator(remoteDHPublicKey) {
    this.remoteDHPublicKey = new Uint8Array(remoteDHPublicKey);

    // DH ratchet step: DH(myPriv, remotePub)
    const dhOutput = diffieHellman(this.myDHKeyPair.privateKey, this.remoteDHPublicKey);

    // Derivar rootKey y sendChainKey
    const derived = rootKDF(this.rootKey, dhOutput);
    this.rootKey = derived.rootKey;
    this.sendChainKey = derived.chainKey;
  }

  /**
   * Inicializa el ratchet como respondedor (Bob).
   * Se llama al crear la sesión del lado respondedor.
   *
   * @param {Uint8Array} remoteDHPublicKey - Public key DH del iniciador (ephemeral key de Alice)
   */
  initAsResponder(remoteDHPublicKey) {
    this.remoteDHPublicKey = new Uint8Array(remoteDHPublicKey);

    // DH con el par actual del respondedor
    const dhOutput = diffieHellman(this.myDHKeyPair.privateKey, this.remoteDHPublicKey);

    // Derivar rootKey y recvChainKey (Bob RECIBE primero)
    const derived = rootKDF(this.rootKey, dhOutput);
    this.rootKey = derived.rootKey;
    this.recvChainKey = derived.chainKey;
  }

  /**
   * Cifra un mensaje con el Double Ratchet.
   *
   * @param {string|Uint8Array} plaintext - Mensaje a cifrar
   * @returns {{ header: object, ciphertext: string, nonce: string }}
   */
  ratchetEncrypt(plaintext) {
    if (this.sendChainKey === null) {
      // Si no hay sendChainKey, necesitamos hacer un DH ratchet step
      if (this.remoteDHPublicKey === null) {
        throw new Error('Session not initialized: no remoteDHPublicKey and no sendChainKey');
      }

      // Generar nuevo DH keypair
      this.previousSendCount = this.sendMessageNumber;
      this.sendMessageNumber = 0;
      this.myDHKeyPair = generateDHKeyPair();

      // DH ratchet
      const dhOutput = diffieHellman(this.myDHKeyPair.privateKey, this.remoteDHPublicKey);
      const derived = rootKDF(this.rootKey, dhOutput);
      this.rootKey = derived.rootKey;
      this.sendChainKey = derived.chainKey;
    }

    // Chain KDF: derivar messageKey y avanzar cadena
    const { messageKey, nextChainKey } = chainKDF(this.sendChainKey);
    this.sendChainKey = nextChainKey;

    // Cifrar con XChaCha20-Poly1305
    const data = typeof plaintext === 'string' ? fromString(plaintext) : plaintext;
    const { ciphertext, nonce } = encrypt(data, messageKey);

    // Header
    const header = {
      dh: toHex(this.myDHKeyPair.publicKey),
      pn: this.previousSendCount,
      n: this.sendMessageNumber,
    };

    this.sendMessageNumber++;

    return {
      header,
      ciphertext: toHex(ciphertext),
      nonce: toHex(nonce),
    };
  }

  /**
   * Descifra un mensaje con el Double Ratchet.
   *
   * @param {{ dh: string, pn: number, n: number }} header - Header del mensaje
   * @param {string} ciphertextHex - Ciphertext en hex
   * @param {string} nonceHex - Nonce en hex
   * @returns {string} Mensaje descifrado
   */
  ratchetDecrypt(header, ciphertextHex, nonceHex) {
    const remotePubHex = header.dh;
    const remotePub = fromHex(remotePubHex);

    // Intentar con mensajes saltados primero
    const skipKey = `${remotePubHex}:${header.n}`;
    if (this.skippedMessages.has(skipKey)) {
      const mk = this.skippedMessages.get(skipKey);
      this.skippedMessages.delete(skipKey);
      return toString(decrypt(fromHex(ciphertextHex), fromHex(nonceHex), mk));
    }

    // ¿El remitente hizo un DH ratchet step?
    const currentRemoteHex = this.remoteDHPublicKey ? toHex(this.remoteDHPublicKey) : null;

    if (currentRemoteHex !== remotePubHex) {
      // Guardar mensajes saltados de la cadena de recepción actual
      if (this.recvChainKey !== null) {
        this._skipMessages(currentRemoteHex, header.pn);
      }

      // DH ratchet step: recibir
      this.remoteDHPublicKey = remotePub;
      const dhOutput1 = diffieHellman(this.myDHKeyPair.privateKey, remotePub);
      const derived1 = rootKDF(this.rootKey, dhOutput1);
      this.rootKey = derived1.rootKey;
      this.recvChainKey = derived1.chainKey;

      // DH ratchet step: enviar (generar nuevo par)
      this.previousSendCount = this.sendMessageNumber;
      this.sendMessageNumber = 0;
      this.myDHKeyPair = generateDHKeyPair();

      const dhOutput2 = diffieHellman(this.myDHKeyPair.privateKey, remotePub);
      const derived2 = rootKDF(this.rootKey, dhOutput2);
      this.rootKey = derived2.rootKey;
      this.sendChainKey = derived2.chainKey;

      this.recvMessageNumber = 0;
    }

    // Guardar mensajes saltados hasta header.n
    this._skipMessages(remotePubHex, header.n);

    // Derivar messageKey
    const { messageKey, nextChainKey } = chainKDF(this.recvChainKey);
    this.recvChainKey = nextChainKey;
    this.recvMessageNumber++;

    return toString(decrypt(fromHex(ciphertextHex), fromHex(nonceHex), messageKey));
  }

  /**
   * Guarda las message keys de mensajes saltados en la cadena de recepción actual.
   *
   * @param {string} dhPubHex - Public key DH del remitente (hex)
   * @param {number} untilNumber - Número de mensaje hasta el que saltar
   * @private
   */
  _skipMessages(dhPubHex, untilNumber) {
    if (this.recvChainKey === null) return;

    if (this.recvMessageNumber + MAX_SKIP < untilNumber) {
      throw new Error(`Cannot skip more than ${MAX_SKIP} messages (attempted ${untilNumber - this.recvMessageNumber})`);
    }

    while (this.recvMessageNumber < untilNumber) {
      const { messageKey, nextChainKey } = chainKDF(this.recvChainKey);
      this.recvChainKey = nextChainKey;
      const key = `${dhPubHex}:${this.recvMessageNumber}`;
      this.skippedMessages.set(key, messageKey);
      this.recvMessageNumber++;
    }
  }

  /**
   * Exporta el estado completo del ratchet a un objeto serializable.
   *
   * @returns {object}
   */
  exportState() {
    const skipped = {};
    for (const [k, v] of this.skippedMessages.entries()) {
      skipped[k] = toHex(v);
    }

    return {
      rootKey: toHex(this.rootKey),
      sendChainKey: this.sendChainKey ? toHex(this.sendChainKey) : null,
      recvChainKey: this.recvChainKey ? toHex(this.recvChainKey) : null,
      sendMessageNumber: this.sendMessageNumber,
      recvMessageNumber: this.recvMessageNumber,
      previousSendCount: this.previousSendCount,
      myDHPublicKey: toHex(this.myDHKeyPair.publicKey),
      myDHPrivateKey: toHex(this.myDHKeyPair.privateKey),
      remoteDHPublicKey: this.remoteDHPublicKey ? toHex(this.remoteDHPublicKey) : null,
      skippedMessages: skipped,
      isInitiator: this._isInitiator,
    };
  }

  /**
   * Importa un estado serializado y crea una nueva instancia.
   *
   * @param {object} state - Estado exportado
   * @returns {DoubleRatchet}
   */
  static importState(state) {
    const ratchet = Object.create(DoubleRatchet.prototype);
    ratchet.rootKey = fromHex(state.rootKey);
    ratchet.sendChainKey = state.sendChainKey ? fromHex(state.sendChainKey) : null;
    ratchet.recvChainKey = state.recvChainKey ? fromHex(state.recvChainKey) : null;
    ratchet.sendMessageNumber = state.sendMessageNumber;
    ratchet.recvMessageNumber = state.recvMessageNumber;
    ratchet.previousSendCount = state.previousSendCount;
    ratchet.myDHKeyPair = {
      publicKey: fromHex(state.myDHPublicKey),
      privateKey: fromHex(state.myDHPrivateKey),
    };
    ratchet.remoteDHPublicKey = state.remoteDHPublicKey ? fromHex(state.remoteDHPublicKey) : null;
    ratchet._isInitiator = state.isInitiator;

    ratchet.skippedMessages = new Map();
    if (state.skippedMessages) {
      for (const [k, v] of Object.entries(state.skippedMessages)) {
        ratchet.skippedMessages.set(k, fromHex(v));
      }
    }

    return ratchet;
  }
}
