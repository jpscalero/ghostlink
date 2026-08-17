export class SignalingAdapter {
  constructor(wsUrl) {
    // Si estamos en un entorno Node sin WebSocket, esperamos que haya un polyfill/mock global
    this.ws = new WebSocket(wsUrl);
    
    this.onSignalingMessage = null;
    this.onChatMessage = null;
    
    this.ws.onopen = () => {
      if (this.onOpen) this.onOpen();
    };
    
    this.ws.onclose = () => {
      if (this.onClose) this.onClose();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        
        // Determinar si es de señalización WebRTC
        if (msg.type === 'offer' || msg.type === 'answer' || msg.type === 'ice-candidate') {
          if (this.onSignalingMessage) {
            this.onSignalingMessage(msg);
          }
        } else {
          // Si es cualquier otro formato (ej. "c", "n" de chat cifrado), se manda al handler de chat
          if (this.onChatMessage) {
            this.onChatMessage(event.data);
          }
        }
      } catch (e) {
        // En caso de que el mensaje no sea JSON (fallback directo)
        if (this.onChatMessage) {
          this.onChatMessage(event.data);
        }
      }
    };
  }

  send(data) {
    if (this.ws.readyState === 1) { // 1 = OPEN
      this.ws.send(data);
    } else {
      console.warn("SignalingAdapter: No se pudo enviar mensaje por relay, estado no OPEN (" + this.ws.readyState + ")");
    }
  }
}
