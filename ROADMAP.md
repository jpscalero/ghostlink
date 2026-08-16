# 🗺️ GhostLink — Roadmap Granular v0.0.0.1 → v1.0.0.0

## Versionado

```
v[MAJOR].[MINOR].[PATCH].[BUILD]

Cada PATCH tiene sub-versiones BUILD del .0 al .9
Ejemplo: v0.0.1.0 → v0.0.1.1 → ... → v0.0.1.9 → v0.0.2.0
```

**Repo**: `github.com/jpscalero/ghostlink`  
**Distribución**: GitHub Releases → `.exe` · `.AppImage` · `.dmg` · `.apk`

---

# 🔬 ERA ALPHA — Cimientos (v0.0.0.1 → v0.0.0.9)

> Sin UI gráfica. Pura ingeniería criptográfica en Node.js.

| Versión | Nombre | Qué se implementa |
|:---|:---|:---|
| **v0.0.0.1** | Libsodium Init | Carga WASM de libsodium.js, helpers básicos, `package.json` |
| **v0.0.0.2** | Keypairs | Ed25519 (firma) + X25519 (DH) + PreKeys (100 one-time) |
| **v0.0.0.3** | Identidad | GhostLink ID `GL-XXXX-XXXX-XXXX-XXXX`, recovery phrase 24 palabras BIP39, cifrado passphrase Argon2id |
| **v0.0.0.4** | X3DH | Handshake: invitación → respuesta → Triple DH → Master Secret via HKDF |
| **v0.0.0.5** | Double Ratchet | Symmetric ratchet (KDF chain) + DH ratchet (re-keying) + XChaCha20-Poly1305 + mensajes desordenados |
| **v0.0.0.6** | IndexedDB Cifrada | DB wrapper, schemas (identities, contacts, sessions, messages, settings), cifrado transparente |
| **v0.0.0.7** | WebRTC P2P | RTCPeerConnection + DataChannel + ICE + SDP + protocolo binario |
| **v0.0.0.8** | Relay Server | Node.js WebSocket server: peer discovery, ICE relay, store-and-forward, rate limiting, Docker |
| **v0.0.0.9** | Primer Chat CLI | App controller + CLI interface + integración total + cola offline + tests E2E |

---

# 🚀 ERA BETA — App Desktop (v0.0.1.0 → v0.0.9.9)

> Electron + UI profesional. Cada milestone (.X.0) tiene 9 sub-pasos (.X.1-.X.9).

---

## v0.0.1.x — Electron Base

| Versión | Qué se añade |
|:---|:---|
| **v0.0.1.0** | Proyecto Electron: `main.js`, `preload.js`, `BrowserWindow`, carga `index.html` vacío |
| **v0.0.1.1** | IPC bridge seguro: `contextBridge.exposeInMainWorld()`, canales cifrados main↔renderer |
| **v0.0.1.2** | Splash screen con logo GhostLink mientras carga libsodium WASM |
| **v0.0.1.3** | System tray icon con menú (Abrir, Estado, Salir) |
| **v0.0.1.4** | Menú nativo de la app (File, Edit, View, Help) con atajos de teclado |
| **v0.0.1.5** | Gestión de ventana: recordar posición/tamaño, minimizar a tray |
| **v0.0.1.6** | Configuración de electron-builder para build multiplataforma |
| **v0.0.1.7** | Build `.exe` (Windows NSIS installer) funcional |
| **v0.0.1.8** | Build `.AppImage` (Linux) + `.deb` funcional |
| **v0.0.1.9** | Build `.dmg` (macOS) + primer GitHub Release manual de prueba |

---

## v0.0.2.x — Onboarding UI

| Versión | Qué se añade |
|:---|:---|
| **v0.0.2.0** | Layout base HTML: estructura SPA con `<div id="app">`, router básico |
| **v0.0.2.1** | Pantalla de bienvenida: logo animado + nombre + botones "Crear" / "Restaurar" |
| **v0.0.2.2** | Pantalla crear passphrase: input seguro, indicador de fortaleza (débil/media/fuerte) |
| **v0.0.2.3** | Pantalla recovery phrase: grid de 24 palabras, botón copiar, aviso de seguridad |
| **v0.0.2.4** | Pantalla confirmar phrase: seleccionar palabras en orden correcto para verificar |
| **v0.0.2.5** | Pantalla restaurar cuenta: input de 24 palabras → regenerar identidad |
| **v0.0.2.6** | Lock screen: pedir passphrase al abrir app, intentos limitados |
| **v0.0.2.7** | Animaciones de transición entre pantallas (slide, fade) |
| **v0.0.2.8** | Persistencia: guardar estado de onboarding, no repetir si ya se completó |
| **v0.0.2.9** | Manejo de errores: passphrase incorrecta, phrase inválida, feedback visual |

---

## v0.0.3.x — Design System + Temas

| Versión | Qué se añade |
|:---|:---|
| **v0.0.3.0** | CSS custom properties: tokens de colores base (neutros, primario, error, success) |
| **v0.0.3.1** | Tokens de spacing (4px grid), border-radius, shadows, z-index scale |
| **v0.0.3.2** | Tipografía: cargar Inter (Google Fonts), escala tipográfica (h1-h6, body, caption) |
| **v0.0.3.3** | Componentes base: botones (primary, secondary, ghost, danger) con hover/active states |
| **v0.0.3.4** | Componentes base: inputs (text, password, textarea) con focus, error, disabled states |
| **v0.0.3.5** | Componentes base: cards, badges, tooltips, dividers, loaders |
| **v0.0.3.6** | Tema oscuro completo: backgrounds, surfaces, text colors, borders |
| **v0.0.3.7** | Tema claro completo: variante clara con todos los tokens redefinidos |
| **v0.0.3.8** | Toggle de tema: botón con icono sol/luna, animación suave, persistencia en settings |
| **v0.0.3.9** | Iconos SVG inline: set propio (send, attach, mic, call, settings, lock, etc.) sin dependencias |

---

## v0.0.4.x — Lista de Chats + Chat View

| Versión | Qué se añade |
|:---|:---|
| **v0.0.4.0** | Layout principal: sidebar izquierda (chat list) + main derecha (chat view) |
| **v0.0.4.1** | Componente Identicon: avatar generado desde hash de public key (canvas) |
| **v0.0.4.2** | Chat list item: identicon + nombre + preview último msg + timestamp relativo |
| **v0.0.4.3** | Chat list: lista scrolleable, badge de no leídos, ordenar por reciente |
| **v0.0.4.4** | Chat view: header con nombre + status + área de mensajes vacía |
| **v0.0.4.5** | Message bubble: burbujas enviado (derecha, color) / recibido (izquierda, neutro) |
| **v0.0.4.6** | Timestamps discretos bajo burbujas + agrupación por día |
| **v0.0.4.7** | Status indicators: ● enviando → ✓ enviado → ✓✓ entregado → ✓✓ leído (azul) |
| **v0.0.4.8** | Message input: textarea auto-resize + botón enviar + Ctrl+Enter |
| **v0.0.4.9** | Typing indicator ("escribiendo..." con 3 dots animados) + auto-scroll + botón "↓ nuevos" |

---

## v0.0.5.x — Contactos + QR + Invitaciones

| Versión | Qué se añade |
|:---|:---|
| **v0.0.5.0** | Botón "+" para agregar contacto → abre modal con opciones |
| **v0.0.5.1** | Generador QR code: canvas-based, renderiza invitación como QR |
| **v0.0.5.2** | Mostrar invitación como link copiable + QR side-by-side |
| **v0.0.5.3** | QR scanner: acceso a webcam via Electron, decodificar QR en tiempo real |
| **v0.0.5.4** | Input para pegar link de invitación manualmente |
| **v0.0.5.5** | Handshake visual: spinner → "Conectando..." → "¡Conectado!" con checkmark animado |
| **v0.0.5.6** | Fingerprint verification: hash visual de ambas public keys para verificación manual |
| **v0.0.5.7** | Lista de contactos: vista con búsqueda, filtro online/offline, ordenar |
| **v0.0.5.8** | Perfil de contacto: GL-ID, nickname, fecha conexión, fingerprint, opciones |
| **v0.0.5.9** | Bloquear / Eliminar contacto: confirmación, borrado de session keys, actualizar UI |

---

## v0.0.6.x — Imágenes + Archivos

| Versión | Qué se añade |
|:---|:---|
| **v0.0.6.0** | Botón adjuntar (📎) en input → file picker nativo |
| **v0.0.6.1** | Selección de imagen: preview antes de enviar, botón confirmar/cancelar |
| **v0.0.6.2** | EXIF stripping: eliminar metadata de fotos automáticamente antes de enviar |
| **v0.0.6.3** | Cifrado E2E de archivos: mismo pipeline que mensajes de texto |
| **v0.0.6.4** | Thumbnail generation: crear preview pequeño localmente para la burbuja |
| **v0.0.6.5** | Image bubble: thumbnail en chat, click → lightbox fullscreen con zoom |
| **v0.0.6.6** | Envío de archivos genéricos: cualquier tipo, icono + nombre + tamaño en burbuja |
| **v0.0.6.7** | Fragmentación: chunks de 256KB para archivos grandes, reassembly en destino |
| **v0.0.6.8** | Barra de progreso: visual de upload/download con porcentaje |
| **v0.0.6.9** | Drag & drop: arrastrar archivos/imágenes directamente al chat + límite configurable (100MB) |

---

## v0.0.7.x — Audio + Emojis + Reacciones

| Versión | Qué se añade |
|:---|:---|
| **v0.0.7.0** | Botón micrófono (🎙) en input: hold-to-record |
| **v0.0.7.1** | Grabación de audio: visualización de waveform en tiempo real |
| **v0.0.7.2** | Cifrado y envío de nota de voz E2E |
| **v0.0.7.3** | Audio player en burbuja: play/pause, barra de progreso, duración, velocidad 1x/1.5x/2x |
| **v0.0.7.4** | Emoji picker: grid categorizado (caras, manos, animales, comida, etc.) |
| **v0.0.7.5** | Emoji picker: búsqueda por nombre, sección de recientes, skin tones |
| **v0.0.7.6** | Reacciones: long-press/right-click en mensaje → quick emoji bar |
| **v0.0.7.7** | Reacciones visibles: badges con emoji + count bajo la burbuja |
| **v0.0.7.8** | Acciones de mensaje: copiar texto, responder (reply con preview), reenviar |
| **v0.0.7.9** | Eliminar mensaje: "eliminar para mí" + confirmación |

---

## v0.0.8.x — Notificaciones + Settings

| Versión | Qué se añade |
|:---|:---|
| **v0.0.8.0** | Notificaciones nativas del sistema: Electron Notification API |
| **v0.0.8.1** | Sonidos: tono mensaje entrante, enviado, conexión/desconexión |
| **v0.0.8.2** | Badge en system tray: número de mensajes no leídos |
| **v0.0.8.3** | Panel Settings: layout con sidebar de secciones |
| **v0.0.8.4** | Settings → Cuenta: mostrar GL-ID, recovery phrase (tras passphrase), cambiar passphrase |
| **v0.0.8.5** | Settings → Privacidad: toggle receipts de lectura, toggle typing indicator |
| **v0.0.8.6** | Settings → Apariencia: tema, tamaño de fuente (slider), densidad de mensajes |
| **v0.0.8.7** | Settings → Red: URL del relay server, STUN servers, toggle P2P directo |
| **v0.0.8.8** | Settings → Datos: exportar backup cifrado, importar backup, ver tamaño de DB |
| **v0.0.8.9** | Settings → Peligro: wipe completo de todos los datos con triple confirmación |

---

## v0.0.9.x — Cola Offline + Reconexión

| Versión | Qué se añade |
|:---|:---|
| **v0.0.9.0** | Detección de estado de red: `navigator.onLine` + heartbeat al relay |
| **v0.0.9.1** | Barra visual "Sin conexión" (roja) / "Reconectando..." (amarilla) en header |
| **v0.0.9.2** | Cola offline persistente: mensajes no enviados se guardan cifrados en IndexedDB |
| **v0.0.9.3** | Indicador en burbuja: icono reloj (⏳) para mensajes en cola |
| **v0.0.9.4** | Auto-flush: envío automático de cola al recuperar conexión |
| **v0.0.9.5** | Retry con exponential backoff + jitter para reconexión al relay |
| **v0.0.9.6** | Priorización de cola: texto primero, multimedia después |
| **v0.0.9.7** | Store-and-forward mejorado: relay guarda blobs si peer offline, TTL configurable |
| **v0.0.9.8** | Compresión: comprimir payloads con pako/gzip antes de cifrar |
| **v0.0.9.9** | Verificación de entrega: ACK del peer, limpiar cola confirmada, reconciliación |

---

# 🏗️ ERA RC — Producción (v0.1.0.0 → v0.9.0.9)

> Multiplataforma real, offline Bluetooth/WiFi, features avanzadas.

---

## v0.1.0.x — Capacitor Android APK

| Versión | Qué se añade |
|:---|:---|
| **v0.1.0.0** | Proyecto Capacitor: `capacitor.config.ts`, sync con el codebase web existente |
| **v0.1.0.1** | Adaptación táctil: touch events, eliminar hover-only states, tap targets 48px |
| **v0.1.0.2** | Status bar nativo: color adaptado al tema, safe area insets |
| **v0.1.0.3** | Teclado nativo: resize de vista al abrir teclado, scroll al input activo |
| **v0.1.0.4** | Notificaciones locales: plugin Capacitor, canal de notificaciones Android |
| **v0.1.0.5** | Foreground service: mantener conexión WebSocket en background |
| **v0.1.0.6** | Deep links: `ghostlink://invite/...` para abrir invitaciones |
| **v0.1.0.7** | Biometría: desbloqueo con huella/cara (plugin @capacitor-community/biometric-auth) |
| **v0.1.0.8** | Build APK debug: compilar y testear en emulador/dispositivo real |
| **v0.1.0.9** | Build APK release firmado: keystore, ProGuard, subir a GitHub Releases |

---

## v0.2.0.x — Bluetooth BLE Offline

| Versión | Qué se añade |
|:---|:---|
| **v0.2.0.0** | Capa abstracta BLE: interfaz común para Electron y Capacitor |
| **v0.2.0.1** | Electron BLE: integrar noble (scan) + bleno (advertise) via Node.js |
| **v0.2.0.2** | Capacitor BLE: integrar @capacitor-community/bluetooth-le |
| **v0.2.0.3** | BLE Peripheral mode: advertise como servicio GhostLink (UUID custom) |
| **v0.2.0.4** | BLE Central mode: scan, descubrir peers GhostLink cercanos |
| **v0.2.0.5** | Protocolo BLE: fragmentación para MTU limitado (20-512 bytes), reassembly |
| **v0.2.0.6** | Handshake X3DH sobre BLE: establecer sesión cifrada via Bluetooth |
| **v0.2.0.7** | Envío de mensajes cifrados (Double Ratchet) sobre BLE |
| **v0.2.0.8** | UI: radar de peers cercanos con distancia estimada, botón conectar |
| **v0.2.0.9** | Auto-switch: si internet cae, cambiar a BLE automáticamente |

---

## v0.3.0.x — WiFi Direct + LAN Discovery

| Versión | Qué se añade |
|:---|:---|
| **v0.3.0.0** | mDNS/Bonjour discovery: descubrir peers en red local (Electron: mdns module) |
| **v0.3.0.1** | TCP socket directo: P2P sobre LAN sin pasar por relay ni internet |
| **v0.3.0.2** | Capacitor Nearby: integrar Google Nearby Connections (Android) |
| **v0.3.0.3** | Capacitor Multipeer: integrar Apple Multipeer Connectivity (iOS futuro) |
| **v0.3.0.4** | WiFi Direct Android: plugin nativo custom via WifiP2pManager |
| **v0.3.0.5** | Protocolo unificado LAN: mismo formato de mensaje que WebRTC/BLE |
| **v0.3.0.6** | Auto-detección de transporte: prioridad Internet → WiFi LAN → BLE → Cola |
| **v0.3.0.7** | Mesh relay: dispositivo intermedio puede relayear mensajes entre dos peers |
| **v0.3.0.8** | Indicador visual: icono en header mostrando via qué transporte se conecta |
| **v0.3.0.9** | Tests de campo: verificar BLE + WiFi en escenario real sin internet |

---

## v0.4.0.x — Grupos E2EE

| Versión | Qué se añade |
|:---|:---|
| **v0.4.0.0** | Crear grupo: nombre + descripción + seleccionar miembros |
| **v0.4.0.1** | Protocolo Sender Keys: cada miembro genera su clave de envío grupal |
| **v0.4.0.2** | Distribución de Sender Keys via Double Ratchet individual existente |
| **v0.4.0.3** | Cifrado de mensaje grupal: emisor cifra con su Sender Key, cada receptor descifra |
| **v0.4.0.4** | Key rotation: rotar Sender Key automáticamente cuando alguien sale |
| **v0.4.0.5** | Roles: Admin / Miembro, permisos de agregar/eliminar |
| **v0.4.0.6** | Gestionar miembros: agregar nuevos, eliminar, promover a admin |
| **v0.4.0.7** | Mensajes de sistema en grupo: "X entró", "Y salió", "Z cambió nombre" |
| **v0.4.0.8** | Reply en grupo: responder a mensaje específico con preview |
| **v0.4.0.9** | Menciones: @usuario con autocompletado, notificación especial al mencionado |

---

## v0.5.0.x — Llamadas de Voz E2EE

| Versión | Qué se añade |
|:---|:---|
| **v0.5.0.0** | WebRTC audio: establecer peer connection para voz |
| **v0.5.0.1** | Codec Opus: configurar para alta calidad y bajo bandwidth |
| **v0.5.0.2** | E2EE layer: cifrado adicional sobre SRTP nativo de WebRTC |
| **v0.5.0.3** | UI de llamada: pantalla completa con avatar, nombre, timer |
| **v0.5.0.4** | Controles: mute mic, toggle speaker, colgar |
| **v0.5.0.5** | Ringtone: sonido de llamada entrante + vibración (móvil) |
| **v0.5.0.6** | Notificación de llamada: push/banner para llamada entrante |
| **v0.5.0.7** | Verificación de seguridad: emoji pair (como Signal) para confirmar E2EE |
| **v0.5.0.8** | Llamada grupal: hasta 8 participantes con mixing de audio |
| **v0.5.0.9** | Calidad adaptativa: ajustar bitrate según bandwidth disponible |

---

## v0.6.0.x — Mensajes Efímeros + Vault

| Versión | Qué se añade |
|:---|:---|
| **v0.6.0.0** | Timer por chat: selector (5s, 30s, 5m, 1h, 24h, 7d, custom) |
| **v0.6.0.1** | Auto-destrucción: mensaje desaparece de ambos lados tras timer |
| **v0.6.0.2** | Countdown visual: icono/barra de tiempo restante en burbuja efímera |
| **v0.6.0.3** | Vault mode: crear passphrase secundaria para ocultar chats seleccionados |
| **v0.6.0.4** | Vault UI: los chats ocultos no aparecen sin la 2da passphrase |
| **v0.6.0.5** | Panic button: botón rojo → borrar TODOS los datos instantáneamente |
| **v0.6.0.6** | Screenshot block: impedir capturas de pantalla (Android: FLAG_SECURE) |
| **v0.6.0.7** | Screen recording detection: detectar grabación → notificar al remitente |
| **v0.6.0.8** | Incognito keyboard: sugerir teclado sin historial en Android |
| **v0.6.0.9** | EXIF strip configurable: on/off en settings, aplicar a todas las imágenes |

---

## v0.7.0.x — Multi-Dispositivo Sync

| Versión | Qué se añade |
|:---|:---|
| **v0.7.0.0** | Protocolo de vinculación: generar QR en device principal |
| **v0.7.0.1** | Escanear QR desde device secundario → handshake entre devices |
| **v0.7.0.2** | Keypair por dispositivo: cada device genera su propia identidad derivada |
| **v0.7.0.3** | Sync de contactos: replicar lista cifrada entre dispositivos |
| **v0.7.0.4** | Sync de mensajes: nuevos mensajes se replican a todos los devices |
| **v0.7.0.5** | Sync de estado de lectura: marcas de leído sincronizadas |
| **v0.7.0.6** | Sync de settings: configuración compartida entre devices |
| **v0.7.0.7** | Sesiones independientes: cada device tiene su propio ratchet con cada contacto |
| **v0.7.0.8** | Gestión de devices: ver lista, nombre, última actividad, desvincular |
| **v0.7.0.9** | Límite de 5 dispositivos simultáneos + notificación si se excede |

---

## v0.8.0.x — CI/CD + Auto-Update

| Versión | Qué se añade |
|:---|:---|
| **v0.8.0.0** | GitHub Actions workflow base: trigger on tag `v*` |
| **v0.8.0.1** | Job: build Windows `.exe` NSIS installer |
| **v0.8.0.2** | Job: build Linux `.AppImage` + `.deb` |
| **v0.8.0.3** | Job: build macOS `.dmg` (si runner disponible) |
| **v0.8.0.4** | Job: build Android APK firmado |
| **v0.8.0.5** | Upload automático de todos los artifacts a GitHub Releases |
| **v0.8.0.6** | electron-updater: check for updates al iniciar app |
| **v0.8.0.7** | Notificación in-app: "Nueva versión v0.X.X disponible" con botón actualizar |
| **v0.8.0.8** | Download + install en background, reiniciar para aplicar |
| **v0.8.0.9** | CHANGELOG.md auto-generado + vista de changelog in-app + checksums SHA-256 |

---

## v0.9.0.x — Internacionalización + Accesibilidad

| Versión | Qué se añade |
|:---|:---|
| **v0.9.0.0** | Sistema i18n: JSON de traducciones, función `t('key')`, switch en runtime |
| **v0.9.0.1** | Español: traducción base completa (idioma por defecto) |
| **v0.9.0.2** | English: traducción completa |
| **v0.9.0.3** | Português: traducción completa |
| **v0.9.0.4** | Français: traducción completa |
| **v0.9.0.5** | Deutsch: traducción completa |
| **v0.9.0.6** | WCAG 2.1 AA: contraste mínimo 4.5:1, focus visible en todo elemento interactivo |
| **v0.9.0.7** | Screen reader: ARIA labels, roles, live regions para mensajes nuevos |
| **v0.9.0.8** | Keyboard navigation: Tab, Enter, Escape, flechas en toda la UI |
| **v0.9.0.9** | Font scaling: respetar tamaño del sistema, probar con 200% sin romper layout |

---

# 🏆 v1.0.0.0 — RELEASE FINAL 🎉

> **Todo lo anterior perfeccionado, más:**

| Paso | Qué se hace |
|:---|:---|
| Auditoría crypto | Revisión completa de todo el código criptográfico |
| Performance audit | Profiling de render, memoria, startup time |
| Bundle optimization | Minificación, tree-shaking, lazy loading |
| Documentación | README, Wiki, FAQ, Contributing guide, API docs |
| Tutorial interactivo | Onboarding guiado para nuevos usuarios |
| Refactoring final | Código limpio, patrones consistentes, comentarios |
| Licencia GPLv3 | Open source |
| Landing page | GitHub Pages con screenshots y video |
| Video demo | Grabación de uso real completo |
| **RELEASE** | **Tag v1.0.0.0, GitHub Release con todos los binarios** |

---

## 📈 Resumen de Versiones Totales

| Era | Rango | Versiones | Contenido |
|:---|:---|:---:|:---|
| Alpha | v0.0.0.1 → v0.0.0.9 | **9** | Crypto + Storage + Transport + Relay + CLI Chat |
| Beta | v0.0.1.0 → v0.0.9.9 | **90** | Electron + UI + Contactos + Media + Offline Queue |
| RC | v0.1.0.0 → v0.9.0.9 | **90** | Android + BLE + WiFi + Grupos + Voz + Vault + Sync + CI/CD + i18n |
| Release | v1.0.0.0 | **1** | Auditoría + Polish + Documentación + Launch |
| | | **190** | **Total de versiones** |

---

## Open Questions

> [!IMPORTANT]
> **¿Aprobamos este plan y empezamos con v0.0.0.1 (Libsodium Init)?**

> [!IMPORTANT]
> **¿El nombre del repo será `ghostlink`?** → `github.com/jpscalero/ghostlink`
