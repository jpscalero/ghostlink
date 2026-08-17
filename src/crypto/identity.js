import {
  initCrypto,
  generateSigningKeyPairFromSeed,
  sha256,
  hkdfDerive,
  deriveKeyFromPassphrase,
  encrypt,
  decrypt,
  decryptToString,
  randomBytes,
  toHex,
  fromHex,
  fromString
} from './helpers.js';

import { BIP39_WORDLIST } from './bip39-wordlist.js';
import { generateKeyBundle } from './x3dh-keystore.js';

/**
 * Generates a GhostLink ID from an Ed25519 public key.
 * @param {Uint8Array} publicKey - Ed25519 public key
 * @returns {string} GhostLink ID in format GL-XXXX-XXXX-XXXX-XXXX
 */
export function generateGhostLinkId(publicKey) {
  const hash = sha256(publicKey);
  const prefix = hash.slice(0, 8);
  const hex = toHex(prefix).toUpperCase();
  return `GL-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
}

/**
 * Generates a 24-word BIP39 recovery phrase from 32 bytes of entropy.
 * @param {Uint8Array} entropy - 32 bytes of random entropy
 * @returns {string[]} Array of 24 words
 */
export function generateRecoveryPhrase(entropy) {
  if (entropy.length !== 32) {
    throw new Error('Entropy must be exactly 32 bytes');
  }

  const hash = sha256(entropy);
  const checksumBits = hash[0]; // First 8 bits

  // Convert entropy to bits
  let bits = '';
  for (let i = 0; i < entropy.length; i++) {
    bits += entropy[i].toString(2).padStart(8, '0');
  }
  // Append checksum bits
  bits += checksumBits.toString(2).padStart(8, '0'); // Total 264 bits

  const words = [];
  for (let i = 0; i < 24; i++) {
    const chunk = bits.slice(i * 11, (i + 1) * 11);
    const index = parseInt(chunk, 2);
    words.push(BIP39_WORDLIST[index]);
  }

  return words;
}

/**
 * Converts a 24-word recovery phrase back to 32 bytes of entropy.
 * @param {string[]} words - Array of 24 words
 * @returns {Uint8Array} 32 bytes of entropy
 */
export function recoveryPhraseToEntropy(words) {
  if (words.length !== 24) {
    throw new Error('Recovery phrase must be exactly 24 words');
  }

  let bits = '';
  for (const word of words) {
    const index = BIP39_WORDLIST.indexOf(word);
    if (index === -1) {
      throw new Error(`Invalid word in recovery phrase: ${word}`);
    }
    bits += index.toString(2).padStart(11, '0');
  }

  const entropyBits = bits.slice(0, 256);
  const checksumBitsStr = bits.slice(256, 264);

  const entropy = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    entropy[i] = parseInt(entropyBits.slice(i * 8, (i + 1) * 8), 2);
  }

  // Verify checksum
  const expectedChecksumBits = sha256(entropy)[0].toString(2).padStart(8, '0');
  if (checksumBitsStr !== expectedChecksumBits) {
    throw new Error('Invalid recovery phrase checksum');
  }

  return entropy;
}

/**
 * Creates a new GhostLink identity.
 * @param {string} passphrase - User's passphrase to encrypt the private key
 * @returns {object} Identity object containing ID, recovery phrase, keys, and X3DH bundle
 */
export function createIdentity(passphrase) {
  const entropy = randomBytes(32);
  const recoveryPhrase = generateRecoveryPhrase(entropy);
  
  const seed = hkdfDerive(
    entropy,
    fromString('GhostLink_IdentitySeed'),
    'Ed25519_Identity',
    32
  );
  
  const identityKey = generateSigningKeyPairFromSeed(seed);
  const ghostLinkId = generateGhostLinkId(identityKey.publicKey);
  const bundle = generateKeyBundle();

  const { key, salt } = deriveKeyFromPassphrase(passphrase);
  const encrypted = encrypt(identityKey.privateKey, key);

  return {
    ghostLinkId,
    recoveryPhrase,
    publicIdentity: {
      publicKey: identityKey.publicKey,
      ghostLinkId
    },
    encryptedPrivateKey: {
      ciphertext: toHex(encrypted.ciphertext),
      nonce: toHex(encrypted.nonce),
      salt: toHex(salt)
    },
    bundle
  };
}

/**
 * Restores a GhostLink identity from a recovery phrase.
 * @param {string[]} words - 24-word recovery phrase
 * @param {string} passphrase - New passphrase to encrypt the private key
 * @returns {object} Identity object containing ID, recovery phrase, keys, and a new X3DH bundle
 */
export function restoreIdentity(words, passphrase) {
  const entropy = recoveryPhraseToEntropy(words);
  
  const seed = hkdfDerive(
    entropy,
    fromString('GhostLink_IdentitySeed'),
    'Ed25519_Identity',
    32
  );
  
  const identityKey = generateSigningKeyPairFromSeed(seed);
  const ghostLinkId = generateGhostLinkId(identityKey.publicKey);
  const bundle = generateKeyBundle();

  const { key, salt } = deriveKeyFromPassphrase(passphrase);
  const encrypted = encrypt(identityKey.privateKey, key);

  return {
    ghostLinkId,
    recoveryPhrase: words,
    publicIdentity: {
      publicKey: identityKey.publicKey,
      ghostLinkId
    },
    encryptedPrivateKey: {
      ciphertext: toHex(encrypted.ciphertext),
      nonce: toHex(encrypted.nonce),
      salt: toHex(salt)
    },
    bundle
  };
}

/**
 * Unlocks the encrypted private key.
 * @param {object} encryptedPrivateKey - The encrypted key object (ciphertext, nonce, salt)
 * @param {string} passphrase - The user's passphrase
 * @returns {Uint8Array} The decrypted private key
 */
export function unlockPrivateKey(encryptedPrivateKey, passphrase) {
  const { key } = deriveKeyFromPassphrase(
    passphrase,
    fromHex(encryptedPrivateKey.salt)
  );
  
  return decrypt(
    fromHex(encryptedPrivateKey.ciphertext),
    fromHex(encryptedPrivateKey.nonce),
    key
  );
}
