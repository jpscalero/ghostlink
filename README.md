# 🔒 GhostLink

![Version](https://img.shields.io/badge/version-v0.0.0.3-blue)
[![CI](https://github.com/jpscalero/ghostlink/actions/workflows/ci.yml/badge.svg)](https://github.com/jpscalero/ghostlink/actions/workflows/ci.yml)
![License](https://img.shields.io/badge/license-GPL--3.0-green)

**Ultra-private encrypted messenger with offline capability.**

GhostLink es una aplicación de mensajería cifrada de extremo a extremo que funciona sin necesidad de número de teléfono, email, ni ningún dato personal. Diseñada para funcionar incluso sin conexión a internet usando Bluetooth y redes locales.

---

## 🚀 Estado Actual: v0.0.0.3 (X3DH Keypairs)

En esta versión (**v0.0.0.3**), hemos implementado el sistema de bundles de claves **X3DH** (Extended Triple Diffie-Hellman), el mismo protocolo que usa Signal para establecer sesiones cifradas de forma asíncrona.

### 🌟 Novedades v0.0.0.3
- **Identity Key (Ed25519):** Clave permanente que representa la identidad criptográfica del usuario.
- **Signed PreKey (X25519):** Clave rotativa (cada 7 días), firmada digitalmente por la Identity Key para evitar ataques MITM.
- **100 One-Time PreKeys (X25519):** Claves efímeras de un solo uso que garantizan *forward secrecy* desde el primer mensaje.
- **Handshake X3DH completo:** Tanto el lado iniciador como el respondedor derivan el mismo secreto compartido.
- **Serialización de bundles:** Los bundles públicos se pueden exportar/importar en formato JSON hex.

### 🔧 Novedades v0.0.0.2
- **App de Escritorio Nativa:** Integración con `Electron` para una experiencia de usuario moderna, oscura y minimalista.
- **Relay Server:** Mini-servidor de WebSockets para enrutamiento de paquetes en tiempo real (local o en la nube).
- **Chat E2EE Funcional:** Generación de claves `X25519` automáticas, derivación de secreto compartido mediante Diffie-Hellman, y cifrado con `XChaCha20-Poly1305`.
- **Modo Notas Personales:** Chat privado contigo mismo para guardar notas cifradas.

---

## 💻 Instalación y Uso (Desarrollo)

### Prerrequisitos
- **Node.js** (v18 o superior)
- **pnpm** (Gestor de paquetes)

### 1. Clonar e Instalar
```bash
git clone https://github.com/jpscalero/ghostlink.git
cd ghostlink
pnpm install
```

### 2. Ejecutar la Aplicación

Por defecto, la aplicación está configurada para conectarse a un **Relay Server de pruebas en la nube** (`wss://ghostlink-2pwd.onrender.com`). Para probarlo, simplemente abre **dos terminales** y ejecuta en ambas:
```bash
pnpm start
```

#### Opción Alternativa: Relay Local (Máxima Privacidad)
Si prefieres no usar el servidor en la nube y ejecutar tu propia infraestructura de enrutamiento:
1. Edita el archivo `src/renderer.js` y cambia la URL de conexión a `ws://localhost:8080`.
2. En una terminal nueva, arranca el servidor local:
   ```bash
   pnpm run relay
   ```
3. En otras dos terminales, arranca los clientes con `pnpm start`.

> [!WARNING]
> **Privacidad del Relay en la Nube:**
> 1. El relay actual alojado en Render es una **solución temporal de desarrollo**, no la arquitectura P2P final de privacidad del proyecto.
> 2. Aunque el contenido de los mensajes viaja 100% cifrado E2E, **el operador del relay puede observar metadatos** de conexión (como direcciones IP de los usuarios y tiempos de envío de paquetes).
> 3. Se recomienda a quien requiera **máxima privacidad** utilizar `pnpm relay` en su propia infraestructura mientras no exista el modo P2P/offline real.

### 3. ¿Cómo chatear?
1. Verás que se abren dos ventanas de GhostLink.
2. En la Ventana 1, pulsa "Copiar mi clave".
3. En la Ventana 2, pega esa clave en la casilla superior y pulsa "Conectar".
4. ¡Listo! Todo lo que escribas estará cifrado de extremo a extremo de forma militar.
*(Si solo quieres tomar notas cifradas para ti mismo, puedes pulsar el botón "📝 Notas Personales").*

---

## 📂 Estructura del Código

- `src/main.js`: Proceso principal de Electron (creación de ventanas).
- `src/renderer.js`: Proceso de renderizado (UI, cliente WebSocket y orquestación).
- `src/relay.js`: Servidor Node.js ligero para enrutamiento de mensajes (WebSocket).
- `src/crypto/`: Motor criptográfico central.
  - `helpers.js`: Funciones base (cifrado, firma, DH, hashing, encoding).
  - `x3dh-keystore.js`: Sistema de bundles X3DH (Identity Key + Signed PreKey + OPKs).
  - `sodium-init.js`: Singleton de inicialización de libsodium WASM.
- `tests/`: Pruebas automatizadas (crypto + X3DH).

---

## ✨ Características Futuras (Roadmap)

- 🔐 **v0.0.0.2 a v0.0.0.9:** Cimientos P2P (Double Ratchet, X3DH, IndexedDB, WebRTC, Relay Server).
- 👻 **Era Beta (v0.0.1.0+):** App Desktop con Electron, UI moderna, mensajería básica y multimedia.
- 📡 **Era RC (v0.1.0.0+):** Android APK, modo offline verdadero (Bluetooth, WiFi Direct), llamadas de voz, grupos.
- 🚀 **Release (v1.0.0.0):** Auditoría final y lanzamiento de producción.

## 📄 Licencia
GPL-3.0 — Software libre y de código abierto.
