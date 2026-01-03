// Example Jest test (Node) showing how to assert video-canceled flows with a mocked Socket.IO server
// This is a lightweight example. Adapt to your backend test setup (mocha/jest) and socket helper utils.

const io = require('socket.io-client');
const { createServer } = require('http');
const socketio = require('socket.io');

let server, ioServer;
const port = 5001;

beforeAll((done) => {
  server = createServer();
  ioServer = socketio(server, { cors: { origin: '*' } });

  // Minimal handlers wired to replicate the server logic under test.
  ioServer.on('connection', (socket) => {
    // attach fake userId (normally done during auth)
    socket.userId = socket.handshake.query.userId;

    socket.on('cancel-video', (payload) => {
      const callerId = socket.userId;
      const calleeId = typeof payload === 'string' ? payload : payload?.to;
      const now = Date.now();
      const canonical = { from: callerId, to: calleeId, reason: 'cancel', at: now };
      ioServer.to(calleeId).emit('video-canceled', { ...canonical, notify: true });
      ioServer.to(callerId).emit('video-canceled', { ...canonical, notify: false });
    });

    // helper to map userId -> socket id room
    socket.join(socket.userId);
  });

  server.listen(port, done);
});

afterAll((done) => {
  ioServer.close();
  server.close(done);
});

test('caller cancel emits video-canceled to both parties with correct notify flags', (done) => {
  const clientA = io.connect(`http://localhost:${port}`, { query: { userId: 'A' } });
  const clientB = io.connect(`http://localhost:${port}`, { query: { userId: 'B' } });

  let seenA = false, seenB = false;

  clientB.on('video-canceled', (payload) => {
    expect(payload.from).toBe('A');
    expect(payload.to).toBe('B');
    expect(payload.notify).toBe(true);
    seenB = true;
    if (seenA) finish();
  });

  clientA.on('video-canceled', (payload) => {
    expect(payload.from).toBe('A');
    expect(payload.to).toBe('B');
    expect(payload.notify).toBe(false);
    seenA = true;
    if (seenB) finish();
  });

  function finish() {
    clientA.disconnect();
    clientB.disconnect();
    done();
  }

  clientA.on('connect', () => {
    clientB.on('connect', () => {
      // A cancels call to B
      clientA.emit('cancel-video', { to: 'B' });
    });
  });
});
