# 🔒 GhostLink

**Ultra-private encrypted messenger with offline capability.**

GhostLink es una aplicación de mensajería cifrada de extremo a extremo que funciona sin necesidad de número de teléfono, email, ni ningún dato personal. Diseñada para funcionar incluso sin conexión a internet usando Bluetooth y redes locales.

---

## 🚀 Estado Actual: v0.0.0.2 (Electron MVP)

En esta versión (**v0.0.0.2**), hemos dado el gran salto: pasamos de ser un motor criptográfico ciego en consola, a tener una **interfaz gráfica nativa de escritorio** 100% funcional.

### 🌟 Novedades principales
- **App de Escritorio Nativa:** Integración con `Electron` para una experiencia de usuario moderna, oscura y minimalista.
- **Relay Server Local:** Mini-servidor de WebSockets integrado para enrutamiento de paquetes en tiempo real.
- **Chat E2EE Funcional:** Generación de claves `X25519` automáticas, derivación de secreto compartido mediante Diffie-Hellman, y cifrado con `XChaCha20-Poly1305` directamente en el cliente.
- **Modo Notas Personales:** Chat privado contigo mismo para guardar notas cifradas de forma local.

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

Para poder probar el chat, necesitas arrancar primero el servidor de enrutamiento (Relay) y luego los clientes (App).

**Paso A: Arrancar el Servidor Relay**
Abre una terminal nueva y ejecuta:
```bash
pnpm run relay
```
*(Debe aparecer el mensaje "Servidor Relay escuchando en puerto 8080")*

**Paso B: Arrancar los Clientes**
Abre **dos terminales nuevas** (una para cada cliente simulado) y en cada una ejecuta:
```bash
pnpm start
```

### 3. ¿Cómo chatear?
1. Verás que se abren dos ventanas de GhostLink.
2. En la Ventana 1, pulsa "Copiar mi clave".
3. En la Ventana 2, pega esa clave en la casilla superior y pulsa "Conectar".
4. ¡Listo! Todo lo que escribas estará cifrado de extremo a extremo de forma militar.
*(Si solo quieres tomar notas cifradas para ti mismo, puedes pulsar el botón "📝 Notas Personales").*

---

## ✨ Características Futuras (Roadmap)

- 🔐 **v0.0.0.2 a v0.0.0.9:** Cimientos P2P (Double Ratchet, X3DH, IndexedDB, WebRTC, Relay Server).
- 👻 **Era Beta (v0.0.1.0+):** App Desktop con Electron, UI moderna, mensajería básica y multimedia.
- 📡 **Era RC (v0.1.0.0+):** Android APK, modo offline verdadero (Bluetooth, WiFi Direct), llamadas de voz, grupos.
- 🚀 **Release (v1.0.0.0):** Auditoría final y lanzamiento de producción.

## 📄 Licencia
GPL-3.0 — Software libre y de código abierto.
