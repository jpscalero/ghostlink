import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import WebSocket from 'ws';
import { RelayServer } from '../src/relay/server.js';

const PORT = 8082; // Usar puerto distinto para test
const WS_URL = `ws://localhost:${PORT}`;

// Utils
const connectWs = () => new Promise((resolve) => {
  const ws = new WebSocket(WS_URL);
  ws.on('open', () => resolve(ws));
});

const closeWs = (ws) => new Promise((resolve) => {
  if (ws.readyState === WebSocket.CLOSED) return resolve();
  ws.on('close', () => resolve());
  ws.close();
});

const sendJson = (ws, obj) => ws.send(JSON.stringify(obj));

const waitForMessage = (ws) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('Timeout waiting for message')), 2000);
  ws.once('message', (data) => {
    clearTimeout(timeout);
    resolve(JSON.parse(data.toString()));
  });
});

const sendAndWait = (ws, obj) => {
  const p = waitForMessage(ws);
  sendJson(ws, obj);
  return p;
};

describe('GhostLink v0.0.0.8 — Relay Server Tests', () => {
  let server;

  before(() => {
    server = new RelayServer({ 
      port: PORT,
      maxClientsPerIP: 100, // Aumentado para evitar bloqueos por cierres lentos
      rateLimitWindow: 1000,
      rateLimitMax: 30,
      storeAndForwardTTL: 50,
      maxStoredMessagesPerUser: 10
    });
    server.start();
  });

  after(() => {
    if (server) server.stop();
  });

  beforeEach(() => {
    // Limpiar estado interno
    server.clients.clear();
    server.ipConnectionCounts.clear();
    server.pubKeyToWs.clear();
    server.messageStore.storeMap.clear();
    server.rateLimiter.store.clear();
  });

  it('a) Lifecycle: El servidor arranca y escucha', async () => {
    const ws = await connectWs();
    assert.strictEqual(ws.readyState, WebSocket.OPEN);
    await closeWs(ws);
  });

  it('b) Registro: Cliente se registra correctamente', async () => {
    const ws = await connectWs();
    const res = await sendAndWait(ws, { type: 'register', publicKey: 'hex_alice' });
    assert.strictEqual(res.type, 'registered');
    assert.strictEqual(res.publicKey, 'hex_alice');
    await closeWs(ws);
  });

  it('b) Registro: Cliente no registrado recibe NOT_REGISTERED', async () => {
    const ws = await connectWs();
    const res = await sendAndWait(ws, { type: 'message', to: 'bob', payload: {} });
    assert.strictEqual(res.type, 'error');
    assert.strictEqual(res.code, 'NOT_REGISTERED');
    await closeWs(ws);
  });

  it('c) Mensajes directos: Alice -> Bob (online)', async () => {
    const wsAlice = await connectWs();
    const wsBob = await connectWs();
    
    await sendAndWait(wsAlice, { type: 'register', publicKey: 'alice' });
    await sendAndWait(wsBob, { type: 'register', publicKey: 'bob' });
    
    const ackPromise = waitForMessage(wsAlice);
    const msgPromise = waitForMessage(wsBob);
    
    sendJson(wsAlice, { type: 'message', to: 'bob', payload: { msg: 'hello' } });
    
    const ack = await ackPromise;
    assert.strictEqual(ack.type, 'ack');
    
    const msg = await msgPromise;
    assert.strictEqual(msg.type, 'message');
    assert.strictEqual(msg.from, 'alice');
    assert.strictEqual(msg.payload.msg, 'hello');
    
    await closeWs(wsAlice);
    await closeWs(wsBob);
  });

  it('c) Mensajes directos: Alice -> Charlie (offline) y Charlie recupera', async () => {
    const wsAlice = await connectWs();
    await sendAndWait(wsAlice, { type: 'register', publicKey: 'alice' });
    
    const storedRes = await sendAndWait(wsAlice, { type: 'message', to: 'charlie', payload: { secret: 123 } });
    assert.strictEqual(storedRes.type, 'stored-offline');
    assert.strictEqual(storedRes.to, 'charlie');
    
    await closeWs(wsAlice);
    
    // Charlie connects
    const wsCharlie = await connectWs();
    
    const regPromise = waitForMessage(wsCharlie); // for registered
    const msgPromise = new Promise((resolve, reject) => {
      // Catch second message
      let count = 0;
      wsCharlie.on('message', data => {
        count++;
        if (count === 2) resolve(JSON.parse(data.toString()));
      });
      setTimeout(() => reject(new Error('Timeout')), 2000);
    });

    sendJson(wsCharlie, { type: 'register', publicKey: 'charlie' });
    
    const regRes = await regPromise;
    assert.strictEqual(regRes.type, 'registered');
    
    const msgRes = await msgPromise;
    assert.strictEqual(msgRes.type, 'stored');
    assert.strictEqual(msgRes.messages.length, 1);
    assert.strictEqual(msgRes.messages[0].from, 'alice');
    assert.strictEqual(msgRes.messages[0].payload.secret, 123);
    
    await closeWs(wsCharlie);
  });

  it('d) Señalización WebRTC: Signal a offline se descarta', async () => {
    const wsAlice = await connectWs();
    await sendAndWait(wsAlice, { type: 'register', publicKey: 'alice' });
    
    // Send signal to offline dave (no response expected from server on drop)
    sendJson(wsAlice, { type: 'signal', to: 'dave', signal: { type: 'offer' } });
    
    await new Promise(r => setTimeout(r, 50));
    
    // Server does not respond with stored, and doesn't store
    assert.strictEqual(server.messageStore.getTotalCount(), 0);
    
    await closeWs(wsAlice);
  });

  it('e) Peer Discovery', async () => {
    const wsAlice = await connectWs();
    await sendAndWait(wsAlice, { type: 'register', publicKey: 'alice_disco' });
    
    const wsBob = await connectWs();
    await sendAndWait(wsBob, { type: 'register', publicKey: 'bob_disco' });
    
    const res = await sendAndWait(wsAlice, { type: 'discover' });
    
    assert.strictEqual(res.type, 'peers');
    assert.ok(res.peers.includes('bob_disco'));
    assert.ok(!res.peers.includes('alice_disco')); // No debe incluirse a si mismo
    
    await closeWs(wsAlice);
    await closeWs(wsBob);
  });

  it('f) Rate Limiting', async () => {
    const ws = await connectWs();
    await sendAndWait(ws, { type: 'register', publicKey: 'spammer' });

    let rateLimited = false;
    let messagesReceived = 0;
    
    // Escuchar mensajes asíncronamente
    const p = new Promise((resolve) => {
      ws.on('message', (data) => {
        const res = JSON.parse(data.toString());
        messagesReceived++;
        if (res.type === 'error' && res.code === 'RATE_LIMIT') {
          rateLimited = true;
        }
        if (messagesReceived === 31) resolve();
      });
    });

    for (let i = 0; i < 31; i++) {
      sendJson(ws, { type: 'message', to: 'nobody', payload: {} });
    }
    
    // Esperar los 31 mensajes o timeout
    const timeoutP = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000));
    await Promise.race([p, timeoutP]);
    
    assert.ok(rateLimited, 'Debería recibir RATE_LIMIT');
    await closeWs(ws);
  });

  it('g) Límite por IP: Máximo de conexiones', async () => {
    const prevMax = server.maxClientsPerIP;
    server.maxClientsPerIP = 3; // Forzamos 3
    
    const ws1 = await connectWs();
    const ws2 = await connectWs();
    const ws3 = await connectWs();
    
    const ws4 = new WebSocket(WS_URL);
    let closedWith1008 = false;
    await new Promise((resolve) => {
      ws4.on('close', (code) => {
        if (code === 1008) closedWith1008 = true;
        resolve();
      });
      ws4.on('error', () => resolve());
    });
    
    assert.ok(closedWith1008, 'Cuarta conexión rechazada con 1008');
    
    await closeWs(ws1);
    await closeWs(ws2);
    await closeWs(ws3);
    
    server.maxClientsPerIP = prevMax;
  });

  it('h) Validación: JSON inválido, MISSING_TYPE', async () => {
    const ws = await connectWs();
    
    const p1 = waitForMessage(ws);
    ws.send('invalid json');
    let res = await p1;
    assert.strictEqual(res.type, 'error');
    assert.strictEqual(res.code, 'INVALID_JSON');
    
    const p2 = waitForMessage(ws);
    ws.send(JSON.stringify({ hello: 'world' })); // Sin campo type
    res = await p2;
    assert.strictEqual(res.type, 'error');
    assert.strictEqual(res.code, 'MISSING_TYPE');
    
    await closeWs(ws);
  });

  it('i) Heartbeat', async () => {
    const ws = await connectWs();
    const res = await sendAndWait(ws, { type: 'ping' });
    assert.strictEqual(res.type, 'pong');
    await closeWs(ws);
  });

  it('j) Store-and-forward TTL', async () => {
    const success = server.messageStore.store('testUser', { msg: 'hello' });
    assert.ok(success);
    assert.strictEqual(server.messageStore.getTotalCount(), 1);
    
    // Esperar más de 50ms
    await new Promise(r => setTimeout(r, 60));
    
    // Limpiar
    server.messageStore.cleanup(50);
    assert.strictEqual(server.messageStore.getTotalCount(), 0);
  });

  it('k) Stats', async () => {
    const ws = await connectWs();
    await sendAndWait(ws, { type: 'register', publicKey: 'stats_user' });
    
    server.messageStore.store('offline_user', { msg: 'hi' });
    
    const stats = server.getStats();
    assert.strictEqual(stats.onlineClients, 1);
    assert.strictEqual(stats.storedMessages, 1);
    assert.ok(stats.uptime > 0);
    
    await closeWs(ws);
  });
});
