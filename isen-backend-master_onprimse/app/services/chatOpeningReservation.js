'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');
const ChatOpeningLease = require('../models/ChatOpeningLease');

const STANDARD_RECIPIENT_LIMIT = 3;
const BUDGET_WINDOW_MS = 24 * 60 * 60 * 1000;
const RESERVED_RECOVERY_MS = 10 * 60 * 1000;

let indexReadyPromise = null;

function objectId(value) {
  return value instanceof mongoose.Types.ObjectId
    ? value
    : new mongoose.Types.ObjectId(String(value));
}

function uniqueObjectIds(values = []) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (!value || !mongoose.Types.ObjectId.isValid(value)) continue;
    const id = objectId(value);
    const key = String(id);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(id);
  }
  return result;
}

function newToken() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
}

async function ensureIndexes() {
  if (!indexReadyPromise) {
    indexReadyPromise = ChatOpeningLease.collection
      .createIndex(
        { sender: 1 },
        { unique: true, name: 'sender_1' }
      )
      .catch(err => {
        indexReadyPromise = null;
        throw err;
      });
  }
  return indexReadyPromise;
}

async function ensureState(sender) {
  await ensureIndexes();
  try {
    await ChatOpeningLease.updateOne(
      { sender },
      { $setOnInsert: { sender, leases: [] } },
      { upsert: true }
    );
  } catch (err) {
    // Two first requests for the same sender can race on the initial upsert.
    // The unique sender index is authoritative; after the winner commits,
    // the loser can continue against that same document.
    if (err?.code !== 11000) throw err;
  }
}

async function pruneExpired(sender, now = new Date()) {
  const budgetCutoff = new Date(now.getTime() - BUDGET_WINDOW_MS);
  const reservationCutoff = new Date(now.getTime() - RESERVED_RECOVERY_MS);

  await ChatOpeningLease.updateOne(
    { sender },
    {
      $pull: {
        leases: {
          $or: [
            {
              state: 'reserved',
              reservedAt: { $lt: reservationCutoff },
            },
            {
              state: 'opened',
              openedAt: { $lt: budgetCutoff },
            },
          ],
        },
      },
    }
  );
}

function activeLeaseRecipients(leases, friendIds, now = new Date()) {
  const budgetCutoff = now.getTime() - BUDGET_WINDOW_MS;
  const reservationCutoff = now.getTime() - RESERVED_RECOVERY_MS;
  const friends = new Set((friendIds || []).map(String));
  const result = [];

  for (const lease of leases || []) {
    const state = String(lease.state || 'reserved');
    const at = new Date(
      state === 'opened'
        ? (lease.openedAt || lease.reservedAt || 0)
        : (lease.reservedAt || 0)
    ).getTime();

    if (state === 'reserved' && at < reservationCutoff) continue;
    if (state === 'opened' && at < budgetCutoff) continue;
    if (friends.has(String(lease.receiver))) continue;
    result.push(String(lease.receiver));
  }

  return result;
}

function budgetStatus({ state, recentRecipientIds, friendIds, receiverId, premium, now }) {
  if (premium) {
    return {
      samePair: (state?.leases || []).some(lease => {
        const leaseState = String(lease.state || 'reserved');
        if (leaseState === 'reserved') {
          const at = new Date(lease.reservedAt || 0).getTime();
          if (at < now.getTime() - RESERVED_RECOVERY_MS) return false;
        }
        return String(lease.receiver) === String(receiverId);
      }),
      uniqueCount: 0,
      budgetRemaining: Infinity,
    };
  }

  const recipients = new Set(
    uniqueObjectIds(recentRecipientIds).map(String)
  );
  for (const id of activeLeaseRecipients(state?.leases, friendIds, now)) {
    recipients.add(id);
  }

  return {
    samePair: (state?.leases || []).some(lease => {
      const leaseState = String(lease.state || 'reserved');
      if (leaseState === 'reserved') {
        const at = new Date(lease.reservedAt || 0).getTime();
        if (at < now.getTime() - RESERVED_RECOVERY_MS) return false;
      }
      return String(lease.receiver) === String(receiverId);
    }),
    uniqueCount: recipients.size,
    budgetRemaining: Math.max(0, STANDARD_RECIPIENT_LIMIT - recipients.size),
  };
}

async function peekOpeningAvailability({
  senderId,
  receiverId,
  recentRecipientIds = [],
  friendIds = [],
  premium = false,
}) {
  const sender = objectId(senderId);
  const now = new Date();
  const state = await ChatOpeningLease.findOne({ sender }).lean();
  const status = budgetStatus({
    state,
    recentRecipientIds,
    friendIds,
    receiverId,
    premium,
    now,
  });

  if (status.samePair) {
    return { allowed: false, reason: 'awaiting_reply', budgetRemaining: status.budgetRemaining };
  }
  if (!premium && status.uniqueCount >= STANDARD_RECIPIENT_LIMIT) {
    return { allowed: false, reason: 'budget_exhausted', budgetRemaining: 0 };
  }

  return {
    allowed: true,
    reason: null,
    budgetRemaining: premium ? Infinity : status.budgetRemaining,
  };
}

async function acquireOpeningReservation({
  senderId,
  receiverId,
  recentRecipientIds = [],
  friendIds = [],
  premium = false,
}) {
  const sender = objectId(senderId);
  const receiver = objectId(receiverId);
  const now = new Date();
  const token = newToken();
  const recent = uniqueObjectIds(recentRecipientIds);
  const friends = uniqueObjectIds(friendIds);

  await ensureState(sender);
  await pruneExpired(sender, now);

  const filter = {
    sender,
    'leases.receiver': { $ne: receiver },
  };

  if (!premium) {
    const budgetCutoff = new Date(now.getTime() - BUDGET_WINDOW_MS);
    const reservationCutoff = new Date(now.getTime() - RESERVED_RECOVERY_MS);
    const activeLeaseReceivers = {
      $map: {
        input: {
          $filter: {
            input: { $ifNull: ['$leases', []] },
            as: 'lease',
            cond: {
              $and: [
                {
                  $cond: [
                    { $eq: ['$$lease.state', 'opened'] },
                    { $gte: [{ $ifNull: ['$$lease.openedAt', '$$lease.reservedAt'] }, budgetCutoff] },
                    { $gte: ['$$lease.reservedAt', reservationCutoff] },
                  ],
                },
                friends.length
                  ? { $not: [{ $in: ['$$lease.receiver', friends] }] }
                  : { $literal: true },
              ],
            },
          },
        },
        as: 'lease',
        in: '$$lease.receiver',
      },
    };

    filter.$expr = {
      $lt: [
        {
          $size: {
            $setUnion: [recent, activeLeaseReceivers],
          },
        },
        STANDARD_RECIPIENT_LIMIT,
      ],
    };
  }

  const state = await ChatOpeningLease.findOneAndUpdate(
    filter,
    {
      $push: {
        leases: {
          receiver,
          token,
          state: 'reserved',
          reservedAt: now,
          openedAt: null,
        },
      },
    },
    { new: true }
  );

  if (!state) {
    const current = await ChatOpeningLease.findOne({ sender }).lean();
    const status = budgetStatus({
      state: current,
      recentRecipientIds: recent,
      friendIds: friends,
      receiverId: receiver,
      premium,
      now,
    });

    if (status.samePair) {
      return {
        allowed: false,
        reason: 'awaiting_reply',
        budgetRemaining: status.budgetRemaining,
      };
    }

    return {
      allowed: false,
      reason: premium ? 'awaiting_reply' : 'budget_exhausted',
      budgetRemaining: premium ? Infinity : 0,
    };
  }

  const status = budgetStatus({
    state: state.toObject ? state.toObject() : state,
    recentRecipientIds: recent,
    friendIds: friends,
    receiverId: receiver,
    premium,
    now,
  });

  return {
    allowed: true,
    reason: null,
    reservationToken: token,
    budgetRemaining: premium
      ? Infinity
      : Math.min(
          STANDARD_RECIPIENT_LIMIT,
          status.budgetRemaining + 1
        ),
  };
}

async function finalizeOpeningReservation({ senderId, receiverId, token, openedAt = new Date() }) {
  if (!token) return;
  const sender = objectId(senderId);
  const receiver = objectId(receiverId);

  await ChatOpeningLease.updateOne(
    { sender },
    {
      $set: {
        'leases.$[lease].state': 'opened',
        'leases.$[lease].openedAt': openedAt,
      },
    },
    {
      arrayFilters: [
        {
          'lease.receiver': receiver,
          'lease.token': String(token),
          'lease.state': 'reserved',
        },
      ],
    }
  );
}

async function releaseOpeningReservation({ senderId, receiverId, token }) {
  if (!token) return;
  const sender = objectId(senderId);
  const receiver = objectId(receiverId);

  await ChatOpeningLease.updateOne(
    { sender },
    {
      $pull: {
        leases: {
          receiver,
          token: String(token),
          state: 'reserved',
        },
      },
    }
  );
}

async function releaseOpeningPair(senderId, receiverId) {
  const sender = objectId(senderId);
  const receiver = objectId(receiverId);
  await ChatOpeningLease.updateOne(
    { sender },
    { $pull: { leases: { receiver } } }
  );
}

module.exports = {
  STANDARD_RECIPIENT_LIMIT,
  BUDGET_WINDOW_MS,
  RESERVED_RECOVERY_MS,
  acquireOpeningReservation,
  peekOpeningAvailability,
  finalizeOpeningReservation,
  releaseOpeningReservation,
  releaseOpeningPair,
};
