import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import WebSocket from 'ws';
import { RelayServer } from '../src/relay/server.js';
import { generateSigningKeyPair, sign } from '../src/crypto/helpers.js';
import { getSodium } from '../src/crypto/sodium-init.js';

const PORT = 8082; // Usar puerto distinto para test
const WS_URL = `ws://localhost:${PORT}`;

const toHex = (buf) => Buffer.from(buf).toString('hex');
const fromHex = (hex) => Buffer.from(hex, 'hex');

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

async function registerClient(ws, keyPair) {
  const pkHex = toHex(keyPair.publicKey);
  const chal = await sendAndWait(ws, { type: 'register', publicKey: pkHex });
  assert.strictEqual(chal.type, 'challenge');
  const signature = sign(fromHex(chal.nonce), keyPair.privateKey);
  const res = await sendAndWait(ws, { type: 'register-proof', signature: toHex(signature) });
  assert.strictEqual(res.type, 'registered');
  assert.strictEqual(res.publicKey, pkHex);
}

describe('GhostLink v0.0.0.8 — Relay Server Tests', () => {
  let server;
  let keyPairs = {};

  before(async () => {
    await getSodium();
    keyPairs.alice = generateSigningKeyPair();
    keyPairs.bob = generateSigningKeyPair();
    keyPairs.charlie = generateSigningKeyPair();
    keyPairs.dave = generateSigningKeyPair();
    keyPairs.stats = generateSigningKeyPair();

    server = new RelayServer({ 
      port: PORT,
      maxClientsPerIP: 100,
      rateLimitWindow: 1000,
      rateLimitMax: 30,
      storeAndForwardTTL: 50,
      maxStoredMessagesPerUser: 10,
      challengeTimeout: 200 // timeout corto para tests
    });
    await server.start();
  });

  after(() => {
    if (server) server.stop();
  });

  beforeEach(() => {
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

  it('b) Registro: Challenge-Response exitoso', async () => {
    const ws = await connectWs();
    await registerClient(ws, keyPairs.alice);
    await closeWs(ws);
  });

  it('b) Registro: Firma inválida rechaza y cierra', async () => {
    const ws = await connectWs();
    const pkHex = toHex(keyPairs.alice.publicKey);
    const chal = await sendAndWait(ws, { type: 'register', publicKey: pkHex });
    assert.strictEqual(chal.type, 'challenge');
    
    // Firmar con llave equivocada (Bob)
    const signature = sign(fromHex(chal.nonce), keyPairs.bob.privateKey);
    
    const pRes = waitForMessage(ws);
    const pClose = new Promise(resolve => ws.on('close', code => resolve(code)));
    
    sendJson(ws, { type: 'register-proof', signature: toHex(signature) });
    
    const res = await pRes;
    assert.strictEqual(res.type, 'error');
    assert.strictEqual(res.code, 'INVALID_PROOF');
    
    const code = await pClose;
    assert.strictEqual(code, 1008);
  });

  it('b) Registro: Timeout cierra conexión', async () => {
    const ws = await connectWs();
    const pkHex = toHex(keyPairs.alice.publicKey);
    const chal = await sendAndWait(ws, { type: 'register', publicKey: pkHex });
    assert.strictEqual(chal.type, 'challenge');
    
    const code = await new Promise(resolve => ws.on('close', code => resolve(code)));
    assert.strictEqual(code, 1008);
  });

  it('b) Registro: Cliente no registrado recibe NOT_REGISTERED', async () => {
    const ws = await connectWs();
    const res = await sendAndWait(ws, { type: 'message', to: toHex(keyPairs.bob.publicKey), payload: {} });
    assert.strictEqual(res.type, 'error');
    assert.strictEqual(res.code, 'NOT_REGISTERED');
    await closeWs(ws);
  });

  it('c) Mensajes directos: Alice -> Bob (online)', async () => {
    const wsAlice = await connectWs();
    const wsBob = await connectWs();
    
    await registerClient(wsAlice, keyPairs.alice);
    await registerClient(wsBob, keyPairs.bob);
    
    const ackPromise = waitForMessage(wsAlice);
    const msgPromise = waitForMessage(wsBob);
    
    sendJson(wsAlice, { type: 'message', to: toHex(keyPairs.bob.publicKey), payload: { msg: 'hello' } });
    
    const ack = await ackPromise;
    assert.strictEqual(ack.type, 'ack');
    
    const msg = await msgPromise;
    assert.strictEqual(msg.type, 'message');
    assert.strictEqual(msg.from, toHex(keyPairs.alice.publicKey));
    assert.strictEqual(msg.payload.msg, 'hello');
    
    await closeWs(wsAlice);
    await closeWs(wsBob);
  });

  it('c) Mensajes directos: Alice -> Charlie (offline) y Charlie recupera', async () => {
    const wsAlice = await connectWs();
    await registerClient(wsAlice, keyPairs.alice);
    
    const storedRes = await sendAndWait(wsAlice, { type: 'message', to: toHex(keyPairs.charlie.publicKey), payload: { secret: 123 } });
    assert.strictEqual(storedRes.type, 'stored-offline');
    assert.strictEqual(storedRes.to, toHex(keyPairs.charlie.publicKey));
    
    await closeWs(wsAlice);
    
    // Charlie connects
    const wsCharlie = await connectWs();
    
    const pkHex = toHex(keyPairs.charlie.publicKey);
    const chal = await sendAndWait(wsCharlie, { type: 'register', publicKey: pkHex });
    
    const msgPromise = new Promise((resolve, reject) => {
      let count = 0;
      wsCharlie.on('message', data => {
        count++;
        if (count === 2) resolve(JSON.parse(data.toString()));
      });
      setTimeout(() => reject(new Error('Timeout')), 2000);
    });

    const signature = sign(fromHex(chal.nonce), keyPairs.charlie.privateKey);
    sendJson(wsCharlie, { type: 'register-proof', signature: toHex(signature) });
    
    const msgRes = await msgPromise; // The second message should be "stored"
    assert.strictEqual(msgRes.type, 'stored');
    assert.strictEqual(msgRes.messages.length, 1);
    assert.strictEqual(msgRes.messages[0].from, toHex(keyPairs.alice.publicKey));
    assert.strictEqual(msgRes.messages[0].payload.secret, 123);
    
    await closeWs(wsCharlie);
  });

  it('d) Señalización WebRTC: Signal a offline se descarta', async () => {
    const wsAlice = await connectWs();
    await registerClient(wsAlice, keyPairs.alice);
    
    sendJson(wsAlice, { type: 'signal', to: toHex(keyPairs.dave.publicKey), signal: { type: 'offer' } });
    await new Promise(r => setTimeout(r, 50));
    
    assert.strictEqual(server.messageStore.getTotalCount(), 0);
    await closeWs(wsAlice);
  });

  it('e) Peer Discovery: Consulta explícita de presencia', async () => {
    const wsAlice = await connectWs();
    await registerClient(wsAlice, keyPairs.alice);
    
    const wsBob = await connectWs();
    await registerClient(wsBob, keyPairs.bob);
    
    // Charlie is offline
    
    const res = await sendAndWait(wsAlice, { 
      type: 'discover', 
      check: [toHex(keyPairs.bob.publicKey), toHex(keyPairs.charlie.publicKey)] 
    });
    
    assert.strictEqual(res.type, 'presence');
    assert.strictEqual(res.online.length, 1);
    assert.strictEqual(res.online[0], toHex(keyPairs.bob.publicKey));
    
    await closeWs(wsAlice);
    await closeWs(wsBob);
  });

  it('f) Rate Limiting', async () => {
    const ws = await connectWs();
    await registerClient(ws, keyPairs.alice);

    let rateLimited = false;
    let messagesReceived = 0;
    
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
      sendJson(ws, { type: 'message', to: toHex(keyPairs.bob.publicKey), payload: {} });
    }
    
    const timeoutP = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000));
    await Promise.race([p, timeoutP]);
    
    assert.ok(rateLimited, 'Debería recibir RATE_LIMIT');
    await closeWs(ws);
  });

  it('g) Límite por IP: Máximo de conexiones', async () => {
    const prevMax = server.maxClientsPerIP;
    server.maxClientsPerIP = 3; 
    
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
    ws.send(JSON.stringify({ hello: 'world' })); 
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
    
    await new Promise(r => setTimeout(r, 60));
    server.messageStore.cleanup(50);
    assert.strictEqual(server.messageStore.getTotalCount(), 0);
  });

  it('k) Stats', async () => {
    const ws = await connectWs();
    await registerClient(ws, keyPairs.stats);
    
    server.messageStore.store('offline_user', { msg: 'hi' });
    
    const stats = server.getStats();
    assert.strictEqual(stats.onlineClients, 1);
    assert.strictEqual(stats.storedMessages, 1);
    assert.ok(stats.uptime > 0);
    
    await closeWs(ws);
  });
});
