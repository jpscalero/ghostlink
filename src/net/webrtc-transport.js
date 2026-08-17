export class WebRTCTransport {
  constructor(signalingChannel) {
    this.signalingChannel = signalingChannel;
    
    // Bind signaling handler
    if (this.signalingChannel) {
      this.signalingChannel.onSignalingMessage = (msg) => this.handleSignalingMessage(msg);
      // Pass-through fallback chat messages to our onMessage
      this.signalingChannel.onChatMessage = (msg) => {
        if (this.onMessage) this.onMessage(msg);
      };
    }

    const iceServers = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" }
    ];

    // Mocks and environments without window.RTCPeerConnection will use global.RTCPeerConnection
    const RTCPC = typeof window !== 'undefined' && window.RTCPeerConnection ? window.RTCPeerConnection : global.RTCPeerConnection;
    
    this.peerConnection = new RTCPC({ iceServers });
    this.dataChannel = null;
    this.isInitiator = false;
    
    // Internal callbacks
    this.onMessageCallback = null;
    this.onStateChangeCallback = null;

    // Track internal state string
    this._state = "disconnected";
    this._updateState("connecting");

    // Si el relay se conecta o ya estaba conectado
    if (this.signalingChannel && this.signalingChannel.ws) {
      this.signalingChannel.onOpen = () => this._evaluateState();
      this.signalingChannel.onClose = () => this._evaluateState();
    }
  }

  onMessage(callback) {
    this.onMessageCallback = callback;
  }

  onStateChange(callback) {
    this.onStateChangeCallback = callback;
  }

  _updateState(newState) {
    if (this._state !== newState) {
      this._state = newState;
      if (this.onStateChangeCallback) {
        this.onStateChangeCallback(this._state);
      }
    }
  }

  _evaluateState() {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this._updateState("connected-p2p");
    } else if (this.signalingChannel && this.signalingChannel.ws && this.signalingChannel.ws.readyState === 1) {
      this._updateState("connected-relay");
    } else if (this.signalingChannel && this.signalingChannel.ws && this.signalingChannel.ws.readyState === 0) {
      this._updateState("connecting");
    } else {
      this._updateState("disconnected");
    }
  }

  _setupDataChannelEvents() {
    if (!this.dataChannel) return;
    
    this.dataChannel.onopen = () => {
      console.log("P2P DataChannel open!");
      this._evaluateState();
    };
    
    this.dataChannel.onclose = () => {
      console.log("P2P DataChannel closed");
      this._evaluateState();
    };
    
    this.dataChannel.onerror = (err) => {
      console.error("P2P DataChannel error:", err);
      this._evaluateState();
    };
    
    this.dataChannel.onmessage = (event) => {
      if (this.onMessageCallback) {
        this.onMessageCallback(event.data);
      }
    };
  }

  async _gatherIceCandidates() {
    return new Promise((resolve) => {
      if (this.peerConnection.iceGatheringState === 'complete') {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        console.warn("ICE gathering timeout. Sending current SDP.");
        cleanup();
        resolve();
      }, 5000);

      const onIceStateChange = () => {
        if (this.peerConnection.iceGatheringState === 'complete') {
          cleanup();
          resolve();
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this.peerConnection.removeEventListener('icegatheringstatechange', onIceStateChange);
      };

      this.peerConnection.addEventListener('icegatheringstatechange', onIceStateChange);
    });
  }

  async createOffer() {
    this.isInitiator = true;
    this.dataChannel = this.peerConnection.createDataChannel("ghostlink-data", { ordered: true });
    this._setupDataChannelEvents();

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    // Wait for ICE gathering to complete before sending (Vanilla ICE)
    await this._gatherIceCandidates();

    this.signalingChannel.send(JSON.stringify({
      type: "offer",
      sdp: this.peerConnection.localDescription
    }));
  }

  async handleSignalingMessage(msg) {
    if (msg.type === "offer") {
      await this.peerConnection.setRemoteDescription(msg.sdp);
      
      this.peerConnection.ondatachannel = (event) => {
        this.dataChannel = event.channel;
        this._setupDataChannelEvents();
      };

      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      await this._gatherIceCandidates();

      this.signalingChannel.send(JSON.stringify({
        type: "answer",
        sdp: this.peerConnection.localDescription
      }));
    } else if (msg.type === "answer") {
      await this.peerConnection.setRemoteDescription(msg.sdp);
    } else if (msg.type === "ice-candidate") {
      // If we are doing Trickle ICE in the future, handle it here
      // msg.candidate should exist
      if (msg.candidate) {
        await this.peerConnection.addIceCandidate(msg.candidate);
      }
    }
  }

  send(data) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(data);
    } else if (this.signalingChannel) {
      // Fallback
      this.signalingChannel.send(data);
    } else {
      console.warn("No route to send data");
    }
  }

  getState() {
    return this._state;
  }

  close() {
    if (this.dataChannel) {
      this.dataChannel.close();
    }
    if (this.peerConnection) {
      this.peerConnection.close();
    }
    if (this.signalingChannel && this.signalingChannel.ws) {
      this.signalingChannel.ws.close();
    }
    this._updateState("disconnected");
  }
}
