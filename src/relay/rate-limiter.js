export class RateLimiter {
  constructor(windowMs = 1000, maxRequests = 30) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.store = new Map();
  }

  _cleanup(key, now) {
    if (!this.store.has(key)) return;
    const timestamps = this.store.get(key);
    const validTimestamps = timestamps.filter(ts => now - ts < this.windowMs);
    if (validTimestamps.length === 0) {
      this.store.delete(key);
    } else {
      this.store.set(key, validTimestamps);
    }
  }

  isAllowed(key) {
    const now = Date.now();
    this._cleanup(key, now);
    const timestamps = this.store.get(key) || [];
    return timestamps.length < this.maxRequests;
  }

  consume(key) {
    const now = Date.now();
    this._cleanup(key, now);
    const timestamps = this.store.get(key) || [];
    if (timestamps.length >= this.maxRequests) {
      return false; // Not allowed
    }
    timestamps.push(now);
    this.store.set(key, timestamps);
    return true; // Allowed
  }

  reset(key) {
    this.store.delete(key);
  }
}
