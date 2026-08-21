'use strict';

/**
 * Small Socket.IO test double that preserves every listener registered for an
 * event. A single-value `handlers[event]` fake masks duplicate production
 * listeners, so tests must be able to dispatch all listeners in order.
 */
class FakeSocket {
  constructor({ id = 'socket-test', userId = null, handshake = {} } = {}) {
    this.id = id;
    this.userId = userId;
    this.handshake = handshake;
    this.connected = true;
    this.disconnected = false;
    this.emitted = [];
    this._listeners = new Map();

    // Backward-compatible dispatch surface for older characterization tests.
    this.handlers = new Proxy({}, {
      get: (_target, event) => (...args) => this.trigger(String(event), ...args),
    });
  }

  on(event, handler) {
    const handlers = this._listeners.get(event) || [];
    handlers.push(handler);
    this._listeners.set(event, handlers);
    return this;
  }

  once(event, handler) {
    const wrapped = (...args) => {
      this.off(event, wrapped);
      return handler(...args);
    };
    wrapped.listener = handler;
    return this.on(event, wrapped);
  }

  off(event, handler) {
    if (!this._listeners.has(event)) return this;
    if (!handler) {
      this._listeners.delete(event);
      return this;
    }
    const remaining = this._listeners.get(event).filter(
      candidate => candidate !== handler && candidate.listener !== handler
    );
    if (remaining.length) this._listeners.set(event, remaining);
    else this._listeners.delete(event);
    return this;
  }

  removeAllListeners(event) {
    if (typeof event === 'undefined') this._listeners.clear();
    else this._listeners.delete(event);
    return this;
  }

  listeners(event) {
    return [...(this._listeners.get(event) || [])];
  }

  listenerCount(event) {
    return this.listeners(event).length;
  }

  emit(event, ...args) {
    this.emitted.push({ event, args });
    return true;
  }

  async trigger(event, ...args) {
    const results = this.listeners(event).map(handler => handler(...args));
    return Promise.all(results.map(result => Promise.resolve(result)));
  }

  disconnect() {
    this.connected = false;
    this.disconnected = true;
    return this;
  }
}

module.exports = FakeSocket;
