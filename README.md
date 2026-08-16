# 🔒 GhostLink

**Ultra-private encrypted messenger with offline capability.**

GhostLink es una aplicación de mensajería cifrada de extremo a extremo que funciona sin necesidad de número de teléfono, email, ni ningún dato personal. Diseñada para funcionar incluso sin conexión a internet usando Bluetooth y redes locales.

---

## 🚀 Estado Actual: v0.0.0.1 (Crypto Engine)

En esta primera versión (**v0.0.0.1**), se ha establecido el cimiento fundamental de la aplicación: el **Motor Criptográfico**. 
Se ha implementado una capa de abstracción robusta y de alto nivel sobre `libsodium` (compilado a WebAssembly para máximo rendimiento y portabilidad).

### 🛠️ Proceso de Implementación

1. **Inicialización (Singleton):** Se creó un inicializador asíncrono para garantizar que el módulo WASM de `libsodium` se cargue correctamente antes de cualquier operación.
2. **Generación de Claves:**
   - **Ed25519** para firmas digitales (autenticación).
   - **X25519** para intercambio de claves (Diffie-Hellman).
3. **Cifrado Simétrico Autenticado (AEAD):** Implementación de **XChaCha20-Poly1305**, el estándar moderno que previene la manipulación de datos cifrados.
4. **Hashing y KDF:**
   - **SHA-256** y **BLAKE2b** para comprobaciones de integridad.
   - **Argon2id** para derivar claves seguras a partir de contraseñas humanas (resistente a ataques de fuerza bruta por GPU/ASIC).
   - **HKDF** para expandir y derivar material de claves (esencial para el futuro protocolo *Double Ratchet*).
5. **Testing Exhaustivo:** Se programó una batería de **55 tests** (`tests/test-sodium.js`) que validan desde la longitud de las claves generadas, hasta el flujo completo de derivar una clave desde una contraseña, cifrar un mensaje y descifrarlo simulando un reinicio de la aplicación. (Todos los tests pasan con éxito 55/55).

### 📂 Estructura del Código

```text
ghostlink/
├── src/
│   └── crypto/
│       ├── sodium-init.js    # Singleton para inicializar libsodium.js WASM
│       └── helpers.js        # Wrappers criptográficos (Firmas, AEAD, KDF, DH, Hashing)
├── tests/
│   └── test-sodium.js        # Suite de 55 tests de validación criptográfica
├── package.json              # Configuración del proyecto y scripts (pnpm)
└── ROADMAP.md                # (Próximamente) Plan granular de las 190 versiones
```

---

## 💻 Instalación y Uso (Desarrollo)

Por el momento, GhostLink es un motor criptográfico backend. Puedes instalarlo y probar las primitivas de cifrado.

### Prerrequisitos
- **Node.js** (v18 o superior)
- **pnpm** (Gestor de paquetes)

### 1. Clonar e Instalar
```bash
git clone https://github.com/jpscalero/ghostlink.git
cd ghostlink
pnpm install
```

### 2. Ejecutar la Batería de Tests
Para comprobar que el motor criptográfico funciona correctamente en tu entorno:
```bash
pnpm test
```
Verás la salida del test suite verificando inicialización, cifrado simétrico, firmas Ed25519, hashing, Argon2id, HKDF y conversiones.

### 3. Uso en tu propio código (Ejemplo)
Puedes importar el motor y usar las primitivas de forma sencilla:

```javascript
import { 
  initCrypto, 
  deriveKeyFromPassphrase, 
  encrypt, 
  decryptToString 
} from './src/crypto/helpers.js';

async function demo() {
  // 1. Inicializar siempre primero
  await initCrypto();

  // 2. Derivar una clave segura de una contraseña
  const { key, salt } = deriveKeyFromPassphrase("MiContraseñaSecreta");

  // 3. Cifrar un mensaje
  const { ciphertext, nonce } = encrypt("Hola GhostLink, mensaje ultra secreto", key);
  console.log("Cifrado:", ciphertext);

  // 4. Descifrar el mensaje
  const mensaje = decryptToString(ciphertext, nonce, key);
  console.log("Descifrado:", mensaje);
}

demo();
```

---

## ✨ Características Futuras (Roadmap)

- 🔐 **v0.0.0.2 a v0.0.0.9:** Cimientos P2P (Double Ratchet, X3DH, IndexedDB, WebRTC, Relay Server).
- 👻 **Era Beta (v0.0.1.0+):** App Desktop con Electron, UI moderna, mensajería básica y multimedia.
- 📡 **Era RC (v0.1.0.0+):** Android APK, modo offline verdadero (Bluetooth, WiFi Direct), llamadas de voz, grupos.
- 🚀 **Release (v1.0.0.0):** Auditoría final y lanzamiento de producción.

## 📄 Licencia
GPL-3.0 — Software libre y de código abierto.
