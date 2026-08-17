import { WebSocketServer } from 'ws';
import { RateLimiter } from './rate-limiter.js';
import { MessageStore } from './store.js';

export class RelayServer {
  constructor(options = {}) {
    this.port = options.port || process.env.PORT || 8080;
    this.maxClientsPerIP = options.maxClientsPerIP || 5;
    this.rateLimitWindow = options.rateLimitWindow || 1000;
    this.rateLimitMax = options.rateLimitMax || 30;
    this.storeAndForwardTTL = options.storeAndForwardTTL || (7 * 24 * 60 * 60 * 1000);
    this.maxStoredMessagesPerUser = options.maxStoredMessagesPerUser || 1000;
    this.maxPayloadSize = options.maxPayloadSize || (64 * 1024);

    this.wss = null;
    this.clients = new Map(); // ws -> { publicKey, ip }
    this.ipConnectionCounts = new Map(); // ip -> count
    this.pubKeyToWs = new Map(); // publicKey -> ws

    this.rateLimiter = new RateLimiter(this.rateLimitWindow, this.rateLimitMax);
    this.messageStore = new MessageStore(this.maxStoredMessagesPerUser);
    
    this.cleanupInterval = null;
    this.startTime = null;
  }

  start() {
    this.wss = new WebSocketServer({ port: this.port });
    this.startTime = Date.now();

    this.wss.on('connection', (ws, req) => {
      // 1. IP connection limit
      const ip = req.socket.remoteAddress || 'unknown';
      const currentConns = this.ipConnectionCounts.get(ip) || 0;
      
      if (currentConns >= this.maxClientsPerIP) {
        ws.close(1008, 'Policy Violation: Too many connections from this IP');
        return;
      }
      
      this.ipConnectionCounts.set(ip, currentConns + 1);
      this.clients.set(ws, { ip, publicKey: null });

      ws.on('message', (message, isBinary) => {
        // Payload size limit
        if (message.length > this.maxPayloadSize) {
          ws.close(1009, 'Message Too Big');
          return;
        }

        let data;
        try {
          const text = isBinary ? message.toString() : message;
          data = JSON.parse(text);
        } catch (e) {
          ws.send(JSON.stringify({ type: 'error', code: 'INVALID_JSON' }));
          return;
        }

        if (!data || !data.type) {
          ws.send(JSON.stringify({ type: 'error', code: 'MISSING_TYPE' }));
          return;
        }

        // Rate limit applies to all except "ping" and "register"
        if (data.type !== 'ping' && data.type !== 'register') {
          if (!this.rateLimiter.consume(ip)) {
            ws.send(JSON.stringify({ type: 'error', code: 'RATE_LIMIT', message: 'Too many messages' }));
            return;
          }
        }

        this.handleMessage(ws, data);
      });

      ws.on('close', () => {
        const clientInfo = this.clients.get(ws);
        if (clientInfo) {
          const { ip, publicKey } = clientInfo;
          // Decrement IP count
          const count = this.ipConnectionCounts.get(ip);
          if (count > 1) {
            this.ipConnectionCounts.set(ip, count - 1);
          } else {
            this.ipConnectionCounts.delete(ip);
          }
          
          if (publicKey) {
            this.pubKeyToWs.delete(publicKey);
          }
          this.clients.delete(ws);
        }
      });
    });

    // Cleanup interval (every hour)
    this.cleanupInterval = setInterval(() => {
      this.messageStore.cleanup(this.storeAndForwardTTL);
    }, 60 * 60 * 1000);

    console.log(`[RelayServer] 🟢 Servidor WebSocket profesional en puerto ${this.port}`);
  }

  handleMessage(ws, data) {
    const clientInfo = this.clients.get(ws);
    const { publicKey } = clientInfo;

    switch (data.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;

      case 'register':
        if (!data.publicKey || typeof data.publicKey !== 'string') {
          ws.send(JSON.stringify({ type: 'error', code: 'INVALID_PUBLIC_KEY' }));
          return;
        }
        
        clientInfo.publicKey = data.publicKey;
        this.pubKeyToWs.set(data.publicKey, ws);
        
        ws.send(JSON.stringify({ type: 'registered', publicKey: data.publicKey }));
        
        // Deliver stored messages
        const stored = this.messageStore.retrieve(data.publicKey);
        if (stored && stored.length > 0) {
          ws.send(JSON.stringify({ type: 'stored', messages: stored }));
        }
        break;

      case 'discover':
        if (!publicKey) {
          ws.send(JSON.stringify({ type: 'error', code: 'NOT_REGISTERED' }));
          return;
        }
        const peers = Array.from(this.pubKeyToWs.keys()).filter(pk => pk !== publicKey);
        ws.send(JSON.stringify({ type: 'peers', peers }));
        break;

      case 'message':
      case 'signal':
        if (!publicKey) {
          ws.send(JSON.stringify({ type: 'error', code: 'NOT_REGISTERED' }));
          return;
        }
        if (!data.to) {
          ws.send(JSON.stringify({ type: 'error', code: 'MISSING_RECIPIENT' }));
          return;
        }

        const targetWs = this.pubKeyToWs.get(data.to);
        
        if (targetWs && targetWs.readyState === 1) { // OPEN
          // Deliver directly
          const forwardData = { ...data, from: publicKey };
          targetWs.send(JSON.stringify(forwardData));
          
          if (data.type === 'message') {
            ws.send(JSON.stringify({ type: 'ack', id: data.id || 'unknown' }));
          }
        } else {
          // Offline
          if (data.type === 'message') {
            const success = this.messageStore.store(data.to, { ...data, from: publicKey });
            if (success) {
              ws.send(JSON.stringify({ type: 'stored-offline', to: data.to }));
            } else {
              ws.send(JSON.stringify({ type: 'error', code: 'STORE_FULL' }));
            }
          }
          // Si es 'signal', se descarta por requerimiento
        }
        break;

      default:
        ws.send(JSON.stringify({ type: 'error', code: 'UNKNOWN_TYPE' }));
        break;
    }
  }

  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.wss) {
      for (const ws of this.clients.keys()) {
        ws.close();
      }
      this.wss.close();
    }
  }

  getStats() {
    return {
      onlineClients: this.pubKeyToWs.size,
      storedMessages: this.messageStore.getTotalCount(),
      uptime: this.startTime ? Date.now() - this.startTime : 0
    };
  }
}
