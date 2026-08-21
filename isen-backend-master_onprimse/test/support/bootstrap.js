'use strict';

// Keep the in-memory database deterministic on modern Linux distributions.
// MongoDB 8 no longer depends on the libcrypto 1.1 runtime missing from the
// test host, and TCP-only startup avoids stale Unix socket collisions.
process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '8.0.4';
process.env.MONGOMS_DISTRO = process.env.MONGOMS_DISTRO || 'ubuntu-22.04';

const { MongoMemoryServer } = require('mongodb-memory-server');
const createMongoMemoryServer = MongoMemoryServer.create.bind(MongoMemoryServer);

MongoMemoryServer.create = function createWithStableDefaults(options = {}) {
  const instance = options.instance || {};
  const args = Array.isArray(instance.args) ? [...instance.args] : [];
  if (!args.includes('--nounixsocket')) args.push('--nounixsocket');

  return createMongoMemoryServer({
    ...options,
    instance: {
      ...instance,
      storageEngine: instance.storageEngine || 'wiredTiger',
      args,
    },
  });
};

exports.mochaHooks = {
  afterEach() {
    const socketManager = require('../../app/utils/socketManager');
    const callSessions = require('../../app/utils/callSessionStore');
    const helpers = require('../../app/helpers');

    socketManager.connectedUsers.clear();
    socketManager.socketUserMap.clear();
    callSessions.resetForTests();
    helpers.initSocket(null);
  },
};
