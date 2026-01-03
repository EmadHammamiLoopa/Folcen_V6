const Peer = require('../models/Peer');

class PeerStore {
  /**
   * Save a peer-id for a user.
   * – If the row does not exist yet → insert { userId, peerId }.
   * – If the same peer-id is already stored → only refresh lastUpdated.
   * – If a different peer-id is supplied (new install) → overwrite it.
   */
  async set(userId, peerId) {
    try {
      await Peer.updateOne(
        { userId },                                       // find by userId
        {
          $set:       { peerId,          lastUpdated: new Date() }, // update/replace
          $setOnInsert: { createdAt: new Date() }                  // first insert only
        },
        { upsert: true }
      );
    } catch (err) {
      console.error('❌ Failed to set peerId in DB:', err);
    }
  }

  async get(userId) {
    try {
      return await Peer.findOne(
        { userId },
        { _id: 0, peerId: 1, lastUpdated: 1 }            // return only what we need
      );
    } catch (err) {
      console.error('❌ Failed to fetch peerId from DB:', err);
      return null;
    }
  }

  async delete(userId) {
    try {
      await Peer.deleteOne({ userId });
      console.log(`❌ DB: Deleted peerId for userId ${userId}`);
    } catch (err) {
      console.error('❌ Failed to delete peerId from DB:', err);
    }
  }

  /**
   * Remove rows that have not been refreshed for > 2 minutes.
   * Call this periodically if you want to purge really stale entries.
   */
  async cleanupExpiredPeers() {
    const expirationTime = new Date(Date.now() - 2 * 60 * 1000);
    try {
      const result = await Peer.deleteMany({ lastUpdated: { $lt: expirationTime } });
      if (result.deletedCount > 0) {
        console.log(`🧹 Cleaned ${result.deletedCount} expired peers`);
      }
    } catch (err) {
      console.error('❌ Failed to clean expired peers from DB:', err);
    }
  }
}

module.exports = new PeerStore();
