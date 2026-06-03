const { expect } = require('chai');
const helpers = require('../app/helpers');
const socketManager = require('../app/utils/socketManager');

describe('realtime delivery helpers', () => {
  afterEach(() => {
    socketManager.connectedUsers.clear();
    socketManager.socketUserMap.clear();
    helpers.initSocket(null);
  });

  it('returns true when an event is emitted to an online user socket', async () => {
    const emitted = [];
    const io = {
      to(socketId) {
        return {
          emit(event, payload) {
            emitted.push({ socketId, event, payload });
          }
        };
      }
    };

    helpers.initSocket(io);
    socketManager.userConnected('user-1', 'socket-1');

    const delivered = await helpers.emitToUser('user-1', 'new-message', { text: 'hello' });

    expect(delivered).to.equal(true);
    expect(emitted).to.have.length(1);
    expect(emitted[0]).to.include({ socketId: 'socket-1', event: 'new-message' });
  });

  it('returns false when a user has no connected sockets', async () => {
    const io = {
      to() {
        throw new Error('should not emit to any socket');
      }
    };

    helpers.initSocket(io);

    const delivered = await helpers.emitToUser('offline-user', 'new-message', { text: 'hello' });

    expect(delivered).to.equal(false);
  });
});
