import { WebSocketServer } from 'ws';

const port = process.env.PORT || 8080;
const wss = new WebSocketServer({ port });

console.log(`[Relay] 🟢 Servidor WebSocket iniciado en el puerto ${port}`);

// Mapa de clientes conectados (ID único interno -> WebSocket)
const clients = new Map();
let clientIdCounter = 1;

wss.on('connection', (ws) => {
  const clientId = clientIdCounter++;
  clients.set(clientId, ws);
  
  console.log(`[Relay] 🔌 Cliente conectado (ID: ${clientId}). Total: ${clients.size}`);

  ws.on('message', (message) => {
    // Convertir de Buffer a string si es necesario
    const data = message.toString();
    console.log(`[Relay] 📩 Recibido paquete cifrado de ${clientId} (${data.length} bytes)`);
    
    // Broadcast a TODOS los demás clientes
    let forwardedCount = 0;
    for (const [id, client] of clients.entries()) {
      if (id !== clientId && client.readyState === 1) { // 1 = OPEN
        client.send(data);
        forwardedCount++;
      }
    }
    console.log(`[Relay] 🚀 Reenviado a ${forwardedCount} cliente(s)`);
  });

  ws.on('close', () => {
    clients.delete(clientId);
    console.log(`[Relay] ❌ Cliente desconectado (ID: ${clientId}). Total: ${clients.size}`);
  });

  ws.on('error', (error) => {
    console.error(`[Relay] ⚠️ Error en cliente ${clientId}:`, error);
  });
});

wss.on('error', (error) => {
  console.error('[Relay] 🔴 Error crítico del servidor:', error);
});
