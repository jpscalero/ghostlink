import assert from 'assert';
import { SignalingAdapter } from '../src/net/signaling-adapter.js';
import { WebRTCTransport } from '../src/net/webrtc-transport.js';

// --- MOCKS ---

class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0; // CONNECTING
    this.sentData = [];
    setTimeout(() => {
      this.readyState = 1; // OPEN
      if (this.onopen) this.onopen();
    }, 10);
  }
  send(data) {
    this.sentData.push(data);
  }
  close() {
    this.readyState = 3; // CLOSED
    if (this.onclose) this.onclose();
  }
}

class MockDataChannel {
  constructor(label, options) {
    this.label = label;
    this.options = options;
    this.readyState = 'connecting';
    this.sentData = [];
    setTimeout(() => {
      this.readyState = 'open';
      if (this.onopen) this.onopen();
    }, 10);
  }
  send(data) {
    this.sentData.push(data);
  }
  close() {
    this.readyState = 'closed';
    if (this.onclose) this.onclose();
  }
}

class MockRTCPeerConnection {
  constructor(config) {
    this.config = config;
    this.localDescription = null;
    this.remoteDescription = null;
    this.iceGatheringState = 'new';
    this.dataChannel = null;
    this.iceCandidates = [];
  }

  createDataChannel(label, options) {
    this.dataChannel = new MockDataChannel(label, options);
    return this.dataChannel;
  }

  async createOffer() {
    return { type: 'offer', sdp: 'mock-offer-sdp' };
  }

  async createAnswer() {
    return { type: 'answer', sdp: 'mock-answer-sdp' };
  }

  async setLocalDescription(desc) {
    this.localDescription = desc;
    // Simulate ICE gathering instantly
    setTimeout(() => {
      this.iceGatheringState = 'complete';
      if (this.listeners && this.listeners['icegatheringstatechange']) {
        this.listeners['icegatheringstatechange'].forEach(cb => cb());
      }
    }, 10);
  }

  async setRemoteDescription(desc) {
    this.remoteDescription = desc;
  }

  async addIceCandidate(candidate) {
    this.iceCandidates.push(candidate);
  }

  addEventListener(event, callback) {
    if (!this.listeners) this.listeners = {};
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  removeEventListener(event, callback) {
    if (!this.listeners || !this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  close() {
    if (this.dataChannel) this.dataChannel.close();
  }
}

// Inyectar Mocks globales
global.WebSocket = MockWebSocket;
global.RTCPeerConnection = MockRTCPeerConnection;

// --- TESTS ---

async function runTests() {
  let passed = 0;
  let total = 0;

  function runTest(name, testFn) {
    total++;
    try {
      testFn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (e) {
      console.error(`❌ [FAIL] ${name}`);
      console.error(e);
    }
  }

  async function runAsyncTest(name, testFn) {
    total++;
    try {
      await testFn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (e) {
      console.error(`❌ [FAIL] ${name}`);
      console.error(e);
    }
  }

  console.log("--- Testing Signaling Adapter ---");

  await runAsyncTest("SignalingAdapter routing", async () => {
    const adapter = new SignalingAdapter("ws://localhost:8080");
    
    // Esperar conexión
    await new Promise(r => setTimeout(r, 20));

    let sigCount = 0;
    let chatCount = 0;

    adapter.onSignalingMessage = (msg) => { sigCount++; };
    adapter.onChatMessage = (msg) => { chatCount++; };

    // Simular un mensaje WebRTC
    adapter.ws.onmessage({ data: JSON.stringify({ type: 'offer', sdp: 'xyz' }) });
    adapter.ws.onmessage({ data: JSON.stringify({ type: 'ice-candidate' }) });

    // Simular un mensaje de chat normal JSON
    adapter.ws.onmessage({ data: JSON.stringify({ type: 'c', payload: '123' }) });
    
    // Simular un texto sin formato
    adapter.ws.onmessage({ data: "plaintext-chat" });

    assert.strictEqual(sigCount, 2, "Debería haber rutado 2 mensajes a signaling");
    assert.strictEqual(chatCount, 2, "Debería haber rutado 2 mensajes a chat");
  });

  console.log("--- Testing WebRTC Transport ---");

  await runAsyncTest("WebRTCTransport createOffer", async () => {
    const adapter = new SignalingAdapter("ws://localhost:8080");
    const transport = new WebRTCTransport(adapter);
    
    await new Promise(r => setTimeout(r, 20)); // wait for adapter open

    assert.strictEqual(transport.getState(), "connected-relay");
    
    await transport.createOffer();
    
    // Luego de createOffer y gather ICE, debería haber enviado un mensaje por el adaptador
    const sentData = adapter.ws.sentData;
    assert.strictEqual(sentData.length, 1);
    
    const parsed = JSON.parse(sentData[0]);
    assert.strictEqual(parsed.type, "offer");
    assert.strictEqual(parsed.sdp.sdp, "mock-offer-sdp");
  });

  await runAsyncTest("WebRTCTransport handleSignalingMessage (offer)", async () => {
    const adapter = new SignalingAdapter("ws://localhost:8080");
    const transport = new WebRTCTransport(adapter);
    await new Promise(r => setTimeout(r, 20));

    await transport.handleSignalingMessage({
      type: "offer",
      sdp: { type: "offer", sdp: "remote-offer" }
    });

    const sentData = adapter.ws.sentData;
    assert.strictEqual(sentData.length, 1);
    const parsed = JSON.parse(sentData[0]);
    
    assert.strictEqual(parsed.type, "answer");
    assert.strictEqual(parsed.sdp.sdp, "mock-answer-sdp");
    assert.strictEqual(transport.peerConnection.remoteDescription.sdp, "remote-offer");
  });

  await runAsyncTest("WebRTCTransport fallback vs p2p routing", async () => {
    const adapter = new SignalingAdapter("ws://localhost:8080");
    const transport = new WebRTCTransport(adapter);
    await new Promise(r => setTimeout(r, 20));

    // Aún no hay DataChannel
    transport.send("fallback-msg");
    assert.strictEqual(adapter.ws.sentData[0], "fallback-msg");

    // Simular que el DataChannel se abre
    transport.dataChannel = new MockDataChannel("test");
    await new Promise(r => setTimeout(r, 20)); // esperar a que sea 'open'
    
    // Forzamos evaluación de estado
    transport._evaluateState();
    assert.strictEqual(transport.getState(), "connected-p2p");

    transport.send("p2p-msg");
    assert.strictEqual(transport.dataChannel.sentData[0], "p2p-msg");
  });

  console.log(`\nResultados: ${passed}/${total} pruebas pasaron.`);
  if (passed !== total) {
    process.exit(1);
  }
}

runTests();
