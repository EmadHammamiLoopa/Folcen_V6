import { SocketService } from './socket.service';

describe('SocketService (static helpers)', () => {
  beforeEach(() => {
    // clear localStorage and reset internal state
    localStorage.clear();
    // ensure private static fields are reset by logout
    return SocketService.logout().catch(() => {});
  });

  it('extracts user id from a JWT payload', () => {
    // Create a fake JWT with payload { id: 'abc123' }
    const header = btoa(JSON.stringify({ alg: 'none' })).replace(/=/g, '');
    const payload = btoa(JSON.stringify({ id: 'abc123' })).replace(/=/g, '');
    const token = `${header}.${payload}.`; // signature optional for tests
    localStorage.setItem('token', token);

    const owner = SocketService.getOwnerId();
    expect(owner).toBe('abc123');
  });

  it('queues emits when socket is not initialized', async () => {
    // Ensure no socket instance present
    await SocketService.logout();
    // Call emit (should queue instead of throw)
    expect(() => SocketService.emit('test-event', { a: 1 })).not.toThrow();
  });

});
