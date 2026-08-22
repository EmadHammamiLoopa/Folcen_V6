import { SocketService } from './socket.service';

class FakeClientSocket {
  id = 'socket-1';
  connected = false;
  auth: any = {};
  emitted: Array<{ event: string; args: any[] }> = [];
  connectCalls = 0;
  disconnectCalls = 0;
  removeAllCalls = 0;
  private listenersByEvent = new Map<string, Function[]>();

  on(event: string, handler: Function) {
    const listeners = this.listenersByEvent.get(event) || [];
    listeners.push(handler);
    this.listenersByEvent.set(event, listeners);
    return this;
  }

  once(event: string, handler: Function) {
    const wrapped = (...args: any[]) => {
      this.off(event, wrapped);
      return handler(...args);
    };
    return this.on(event, wrapped);
  }

  off(event: string, handler?: Function) {
    if (!handler) this.listenersByEvent.delete(event);
    else this.listenersByEvent.set(
      event,
      (this.listenersByEvent.get(event) || []).filter(value => value !== handler)
    );
    return this;
  }

  removeAllListeners() {
    this.removeAllCalls += 1;
    this.listenersByEvent.clear();
    return this;
  }

  emit(event: string, ...args: any[]) {
    this.emitted.push({ event, args });
    return true;
  }

  connect() {
    this.connectCalls += 1;
    return this;
  }

  disconnect() {
    this.disconnectCalls += 1;
    this.connected = false;
    return this;
  }

  trigger(event: string, ...args: any[]) {
    [...(this.listenersByEvent.get(event) || [])].forEach(handler => handler(...args));
  }

  listenerCount(event: string) {
    return (this.listenersByEvent.get(event) || []).length;
  }
}

describe('SocketService ownership and lifecycle characterization', () => {
  let ioSpy: jasmine.Spy;

  function tokenFor(userId: string, marker = 'token') {
    const header = btoa(JSON.stringify({ alg: 'none' })).replace(/=/g, '');
    const payload = btoa(JSON.stringify({ id: userId, marker })).replace(/=/g, '');
    return `${header}.${payload}.signature`;
  }

  async function initialize(socket = new FakeClientSocket()) {
    ioSpy.and.returnValue(socket as any);
    const pending = SocketService.initializeSocket();
    socket.connected = true;
    socket.trigger('connect');
    await pending;
    return socket;
  }

  beforeEach(async () => {
    await SocketService.logout().catch(() => undefined);
    SocketService.setTokenCache(null);
    localStorage.clear();
    ioSpy = spyOn<any>(SocketService as any, 'socketFactory');
  });

  afterEach(async () => {
    await SocketService.logout().catch(() => undefined);
    SocketService.setTokenCache(null);
    localStorage.clear();
  });

  it('derives and binds the authentication owner from the token', () => {
    localStorage.setItem('token', tokenFor('owner-1'));
    SocketService.bindToAuthUser();
    expect(SocketService.getOwnerId()).toBe('owner-1');
  });

  it('does not create a socket when no authentication token exists', async () => {
    await SocketService.initializeSocket();
    expect(ioSpy).not.toHaveBeenCalled();
    expect(await SocketService.getSocket()).toBeNull();
  });

  it('creates exactly one socket for repeated initialization by one authenticated user', async () => {
    localStorage.setItem('token', tokenFor('owner-1'));
    const socket = await initialize();
    await SocketService.initializeSocket();
    await SocketService.initializeSocket();
    expect(ioSpy).toHaveBeenCalledTimes(1);
    expect(await SocketService.getSocket()).toBe(socket as any);
  });

  it('deduplicates initialization while the first connection is still pending', async () => {
    localStorage.setItem('token', tokenFor('owner-1'));
    const socket = new FakeClientSocket();
    ioSpy.and.returnValue(socket as any);
    const first = SocketService.initializeSocket();
    const second = SocketService.initializeSocket();
    socket.connected = true;
    socket.trigger('connect');
    await Promise.all([first, second]);
    expect(ioSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps authentication state through a temporary transport disconnect', async () => {
    const token = tokenFor('owner-1');
    localStorage.setItem('token', token);
    const socket = await initialize();
    socket.connected = false;
    socket.trigger('disconnect', 'transport close');
    expect(localStorage.getItem('token')).toBe(token);
    expect(SocketService.getOwnerId()).toBe('owner-1');
  });

  it('resume-style initialization reuses an already connected socket', async () => {
    localStorage.setItem('token', tokenFor('owner-1'));
    const socket = await initialize();
    await SocketService.initializeSocket();
    expect(await SocketService.getSocket()).toBe(socket as any);
    expect(ioSpy).toHaveBeenCalledTimes(1);
  });

  it('bindToAuthUser emits connect-user only for the token owner', async () => {
    localStorage.setItem('token', tokenFor('owner-1'));
    const socket = await initialize();
    SocketService.bindToAuthUser();
    expect(socket.emitted.some(value =>
      value.event === 'connect-user' && value.args[0] === 'owner-1'
    )).toBeTrue();
  });

  it('token rotation for the same account updates the next handshake without changing owner', async () => {
    localStorage.setItem('token', tokenFor('owner-1', 'old'));
    const socket = await initialize();
    socket.connected = false;
    const rotated = tokenFor('owner-1', 'rotated');
    localStorage.setItem('token', rotated);
    await SocketService.refreshAuth();
    expect(SocketService.getOwnerId()).toBe('owner-1');
    expect(socket.auth).toEqual({ token: rotated });
    expect(socket.connectCalls).toBe(1);
  });

  it('account change disconnects the old owner socket and binds a new socket', async () => {
    localStorage.setItem('token', tokenFor('owner-1'));
    const oldSocket = await initialize();
    const newSocket = new FakeClientSocket();
    newSocket.id = 'socket-2';
    ioSpy.and.returnValue(newSocket as any);
    localStorage.setItem('token', tokenFor('owner-2'));
    const refresh = SocketService.refreshAuth();
    newSocket.connected = true;
    newSocket.trigger('connect');
    await refresh;
    expect(oldSocket.disconnectCalls).toBeGreaterThan(0);
    expect(oldSocket.removeAllCalls).toBeGreaterThan(0);
    expect(SocketService.getOwnerId()).toBe('owner-2');
    expect(await SocketService.getSocket()).toBe(newSocket as any);
  });

  it('delivers one socket event to multiple observable subscribers', async () => {
    localStorage.setItem('token', tokenFor('owner-1'));
    const socket = await initialize();
    const first: any[] = [];
    const second: any[] = [];
    const firstSubscription = SocketService.newMessage$.subscribe(value => first.push(value));
    const secondSubscription = SocketService.newMessage$.subscribe(value => second.push(value));
    socket.trigger('new-message', { id: 'message-1' });
    expect(first).toEqual([{ id: 'message-1' }]);
    expect(second).toEqual([{ id: 'message-1' }]);
    firstSubscription.unsubscribe();
    secondSubscription.unsubscribe();
  });

  it('characterizes component off(event) as removing every shared handler for that event', () => {
    const socket = new FakeClientSocket();
    socket.on('shared-event', () => undefined);
    socket.on('shared-event', () => undefined);
    expect(socket.listenerCount('shared-event')).toBe(2);
    socket.off('shared-event');
    expect(socket.listenerCount('shared-event')).toBe(0);
  });

  it('characterizes a shared disconnect as affecting every consumer of the singleton', async () => {
    localStorage.setItem('token', tokenFor('owner-1'));
    await initialize();
    const consumerA: any = await SocketService.getSocket();
    const consumerB: any = await SocketService.getSocket();
    consumerA.disconnect();
    expect(consumerA).toBe(consumerB);
    expect(consumerB.connected).toBeFalse();
  });

  it('force-logout dispatches the authoritative application event without independently clearing socket auth', async () => {
    const token = tokenFor('owner-1');
    localStorage.setItem('token', token);
    const socket = await initialize();
    const received: any[] = [];
    const handler = (event: any) => received.push(event.detail);
    window.addEventListener('force-logout', handler);
    socket.trigger('force-logout', { reason: 'revoked' });
    await Promise.resolve();
    expect(received).toEqual([{ reason: 'revoked' }]);
    expect(localStorage.getItem('token')).toBe(token);
    expect(SocketService.getOwnerId()).toBe('owner-1');
    window.removeEventListener('force-logout', handler);
  });

  it('logout removes listeners, disconnects, and releases ownership', async () => {
    localStorage.setItem('token', tokenFor('owner-1'));
    const socket = await initialize();
    await SocketService.logout();
    expect(socket.removeAllCalls).toBeGreaterThan(0);
    expect(socket.disconnectCalls).toBeGreaterThan(0);
    expect(SocketService.getOwnerId()).toBeNull();
    expect(await SocketService.getSocket()).toBeNull();
  });
});
