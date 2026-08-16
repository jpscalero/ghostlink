// Referencias al DOM
const myPublicKeyInput = document.getElementById('myPublicKey');
const copyMyKeyBtn = document.getElementById('copyMyKeyBtn');
const contactPublicKeyInput = document.getElementById('contactPublicKey');
const connectBtn = document.getElementById('connectBtn');
const connectionStatus = document.getElementById('connectionStatus');
const personalChatBtn = document.getElementById('personalChatBtn');
const messagesContainer = document.getElementById('messagesContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');

let myKeyPair = null;
let sharedSecret = null;
let ws = null;

// Inicialización
async function initializeApp() {
  addSystemMessage("Cargando motor criptográfico libsodium...");
  await window.ghostCrypto.init();
  
  addSystemMessage("Generando claves X25519 (Diffie-Hellman)...");
  myKeyPair = window.ghostCrypto.generateDHKeyPair();
  
  myPublicKeyInput.value = myKeyPair.publicKey;
  addSystemMessage("¡Listo! Tu clave pública está generada. Compártela con tu contacto.");
}

// Botón Copiar
copyMyKeyBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(myPublicKeyInput.value);
  const originalText = copyMyKeyBtn.innerText;
  copyMyKeyBtn.innerText = "¡Copiado!";
  setTimeout(() => { copyMyKeyBtn.innerText = originalText; }, 2000);
});

// Botón Chat Personal (Notas)
personalChatBtn.addEventListener('click', () => {
  contactPublicKeyInput.value = myPublicKeyInput.value;
  connectBtn.click();
  addSystemMessage("📝 Modo Notas Personales activado.");
});

// Botón Conectar (Intercambio de claves y conexión WS)
connectBtn.addEventListener('click', () => {
  const contactKey = contactPublicKeyInput.value.trim();
  if (contactKey.length !== 64) {
    addSystemMessage("⚠️ La clave pública del contacto debe tener 64 caracteres hex. Tiene " + contactKey.length + ".");
    return;
  }

  try {
    // 1. Derivar el Secreto Compartido
    sharedSecret = window.ghostCrypto.deriveSharedSecret(myKeyPair.privateKey, contactKey);
    addSystemMessage("🔑 Secreto compartido derivado. Hash: " + sharedSecret.substring(0, 8) + "...");
    
    // 2. Conectar al WebSocket Relay
    contactPublicKeyInput.disabled = true;
    connectBtn.disabled = true;
    personalChatBtn.disabled = true;
    connectBtn.innerText = "Conectando...";
    addSystemMessage("📡 Conectando al relay (puede tardar si el servidor está arrancando)...");
    connectWebSocket();
    
  } catch (error) {
    addSystemMessage(`❌ Error al derivar secreto: ${error.message}`);
  }
});

// Enviar Mensaje
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;
  
  if (!sharedSecret) {
    addSystemMessage("⚠️ No hay secreto compartido. Pega la clave de tu contacto y conecta primero.");
    return;
  }
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    addSystemMessage("⚠️ WebSocket no está conectado (estado: " + (ws ? ws.readyState : "null") + "). Espera...");
    return;
  }
  
  try {
    // Cifrar el mensaje
    const encrypted = window.ghostCrypto.encryptMessage(text, sharedSecret);
    
    // Payload JSON
    const payload = JSON.stringify({
      c: encrypted.ciphertext,
      n: encrypted.nonce
    });
    
    // Enviar por relay
    ws.send(payload);
    
    // Mostrar en UI
    addMessageToUI(text, true);
    messageInput.value = '';
    
  } catch (error) {
    console.error("Error al cifrar:", error);
    addSystemMessage("❌ Error interno al cifrar: " + error.message);
  }
}

function connectWebSocket() {
  const url = 'wss://ghostlink-2pwd.onrender.com';
  
  try {
    ws = new WebSocket(url);
  } catch (err) {
    addSystemMessage("❌ No se pudo crear el WebSocket: " + err.message);
    return;
  }
  
  ws.binaryType = 'text';
  
  ws.onopen = () => {
    connectionStatus.innerText = "🟢 Conectado (E2EE)";
    connectionStatus.classList.add('connected');
    connectBtn.innerText = "Conectado";
    messageInput.disabled = false;
    sendBtn.disabled = false;
    messageInput.focus();
    addSystemMessage("✅ Conexión establecida con el relay. Ya puedes enviar mensajes.");
  };
  
  ws.onmessage = async (event) => {
    try {
      // Manejar tanto string como Blob
      let dataText;
      if (typeof event.data === 'string') {
        dataText = event.data;
      } else if (event.data instanceof Blob) {
        dataText = await event.data.text();
      } else if (event.data instanceof ArrayBuffer) {
        dataText = new TextDecoder().decode(event.data);
      } else {
        // Buffer u otro tipo
        dataText = event.data.toString();
      }
      
      const data = JSON.parse(dataText);
      if (data.c && data.n) {
        // Descifrar mensaje recibido
        const plaintext = window.ghostCrypto.decryptMessage(data.c, data.n, sharedSecret);
        addMessageToUI(plaintext, false);
      }
    } catch (error) {
      console.error("Error al descifrar paquete entrante:", error);
      addSystemMessage("⚠️ Se recibió un paquete pero falló el descifrado: " + error.message);
    }
  };
  
  ws.onerror = (error) => {
    console.error("WebSocket error:", error);
    addSystemMessage("❌ Error en la conexión WebSocket.");
  };
  
  ws.onclose = (event) => {
    connectionStatus.innerText = "🔴 Desconectado";
    connectionStatus.classList.remove('connected');
    connectBtn.innerText = "Desconectado";
    messageInput.disabled = true;
    sendBtn.disabled = true;
    addSystemMessage("🔴 Conexión perdida (código: " + event.code + ", razón: " + (event.reason || "ninguna") + "). Reintentando en 3s...");
    
    // Reconexión automática
    setTimeout(() => {
      if (sharedSecret) {
        addSystemMessage("📡 Reintentando conexión...");
        connectWebSocket();
      }
    }, 3000);
  };
}

// Utilidades UI
function addSystemMessage(text) {
  const div = document.createElement('div');
  div.className = 'system-message';
  div.innerText = text;
  messagesContainer.appendChild(div);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function addMessageToUI(text, isSent) {
  const div = document.createElement('div');
  div.className = `message ${isSent ? 'sent' : 'received'}`;
  div.innerText = text;
  messagesContainer.appendChild(div);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Arrancar
initializeApp();
