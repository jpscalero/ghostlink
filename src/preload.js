import { contextBridge } from 'electron';
import {
  initCrypto,
  generateDHKeyPair,
  diffieHellman,
  encrypt,
  decryptToString,
  toHex,
  fromHex
} from './crypto/helpers.js';

contextBridge.exposeInMainWorld('ghostCrypto', {
  init: async () => {
    await initCrypto();
  },
  generateDHKeyPair: () => {
    const kp = generateDHKeyPair();
    // No podemos pasar Uint8Arrays directo si hay problemas de clonado, 
    // pero contextBridge en Electron moderno soporta TypedArrays.
    // De todos modos, pasaremos a Hex por seguridad en el IPC.
    return {
      publicKey: toHex(kp.publicKey),
      privateKey: toHex(kp.privateKey)
    };
  },
  deriveSharedSecret: (privateKeyHex, otherPublicKeyHex) => {
    const priv = fromHex(privateKeyHex);
    const pub = fromHex(otherPublicKeyHex);
    const shared = diffieHellman(priv, pub);
    return toHex(shared);
  },
  encryptMessage: (message, sharedSecretHex) => {
    const sharedSecret = fromHex(sharedSecretHex);
    const result = encrypt(message, sharedSecret);
    return {
      ciphertext: toHex(result.ciphertext),
      nonce: toHex(result.nonce)
    };
  },
  decryptMessage: (ciphertextHex, nonceHex, sharedSecretHex) => {
    const ciphertext = fromHex(ciphertextHex);
    const nonce = fromHex(nonceHex);
    const sharedSecret = fromHex(sharedSecretHex);
    return decryptToString(ciphertext, nonce, sharedSecret);
  }
});

import { SignalingAdapter } from './net/signaling-adapter.js';
import { WebRTCTransport } from './net/webrtc-transport.js';

let _adapter = null;
let _transport = null;

contextBridge.exposeInMainWorld('ghostNet', {
  connectP2P: (url, onStateChange, onMessage, onOpen) => {
    _adapter = new SignalingAdapter(url);
    _transport = new WebRTCTransport(_adapter);

    _transport.onStateChange((state) => onStateChange(state));
    _transport.onMessage((msg) => onMessage(msg));
    
    _adapter.onOpen = () => {
      if (onOpen) onOpen();
    };
  },
  createOffer: async () => {
    if (_transport) await _transport.createOffer();
  },
  send: (payload) => {
    if (_transport) _transport.send(payload);
  },
  getState: () => {
    return _transport ? _transport.getState() : 'disconnected';
  }
});
