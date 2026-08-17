export class MessageStore {
  constructor(maxStoredMessagesPerUser = 1000) {
    this.storeMap = new Map();
    this.maxStoredMessagesPerUser = maxStoredMessagesPerUser;
  }

  store(recipientPublicKey, message) {
    if (!this.storeMap.has(recipientPublicKey)) {
      this.storeMap.set(recipientPublicKey, []);
    }
    const msgs = this.storeMap.get(recipientPublicKey);
    if (msgs.length >= this.maxStoredMessagesPerUser) {
      return false;
    }
    msgs.push({
      ...message,
      _storedAt: Date.now()
    });
    return true;
  }

  retrieve(recipientPublicKey) {
    if (!this.storeMap.has(recipientPublicKey)) return [];
    const msgs = this.storeMap.get(recipientPublicKey);
    this.storeMap.delete(recipientPublicKey);
    return msgs.map(m => {
      const { _storedAt, ...rest } = m;
      return rest;
    });
  }

  cleanup(ttlMs) {
    const now = Date.now();
    let deletedCount = 0;
    
    for (const [pubKey, msgs] of this.storeMap.entries()) {
      const validMsgs = [];
      for (const m of msgs) {
        if (now - m._storedAt > ttlMs) {
          deletedCount++;
        } else {
          validMsgs.push(m);
        }
      }
      
      if (validMsgs.length === 0) {
        this.storeMap.delete(pubKey);
      } else {
        this.storeMap.set(pubKey, validMsgs);
      }
    }
    
    return deletedCount;
  }

  getCount(recipientPublicKey) {
    return this.storeMap.has(recipientPublicKey) ? this.storeMap.get(recipientPublicKey).length : 0;
  }

  getTotalCount() {
    let total = 0;
    for (const msgs of this.storeMap.values()) {
      total += msgs.length;
    }
    return total;
  }
}
