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
  addSystemMessage("¡Listo! Esperando conexión.");
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
  addSystemMessage("📝 Modo Notas Personales activado. Los mensajes se cifran con tu propia clave y se envían a ti mismo.");
});

// Botón Conectar (Intercambio de claves y conexión WS)
connectBtn.addEventListener('click', () => {
  const contactKey = contactPublicKeyInput.value.trim();
  if (contactKey.length !== 64) {
    alert("La clave pública del contacto debe tener 64 caracteres hex.");
    return;
  }

  try {
    // 1. Derivar el Secreto Compartido
    sharedSecret = window.ghostCrypto.deriveSharedSecret(myKeyPair.privateKey, contactKey);
    addSystemMessage("Secreto compartido derivado correctamente. Cifrado E2EE activado.");
    
    // 2. Conectar al WebSocket Relay
    connectWebSocket();
    
    // UI Update
    contactPublicKeyInput.disabled = true;
    connectBtn.disabled = true;
    personalChatBtn.disabled = true;
    connectBtn.innerText = "Conectado";
    messageInput.disabled = false;
    sendBtn.disabled = false;
    
  } catch (error) {
    addSystemMessage(`Error de conexión: ${error.message}`);
  }
});

// Enviar Mensaje
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !sharedSecret || !ws || ws.readyState !== WebSocket.OPEN) return;
  
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
    addSystemMessage("Error interno al cifrar mensaje.");
  }
}

function connectWebSocket() {
  ws = new WebSocket('ws://localhost:8080');
  
  ws.onopen = () => {
    connectionStatus.innerText = "🟢 Conectado (E2EE)";
    connectionStatus.classList.add('connected');
  };
  
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.c && data.n) {
        // Descifrar mensaje recibido
        const plaintext = window.ghostCrypto.decryptMessage(data.c, data.n, sharedSecret);
        addMessageToUI(plaintext, false);
      }
    } catch (error) {
      console.error("Error al descifrar paquete entrante:", error);
    }
  };
  
  ws.onclose = () => {
    connectionStatus.innerText = "🔴 Desconectado";
    connectionStatus.classList.remove('connected');
    addSystemMessage("Conexión perdida con el relay.");
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
