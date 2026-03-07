'use strict';

/**
 * Shared test fixtures for notification tests.
 *
 * Conventions:
 *   ALICE  — the "sender" / actor in most scenarios
 *   BOB    — the "recipient" / target in most scenarios
 *   CHANNEL — default channel owned by Alice
 *   POST   — a non-anonymous post by Alice in CHANNEL
 *   ANON_POST — an anonymous post by Alice in CHANNEL
 */

const mongoose = require('mongoose');

// ─────────────────────────────────────────────
// Stable ObjectIds (deterministic across tests)
// ─────────────────────────────────────────────
const IDS = {
  alice:   new mongoose.Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaa01'),
  bob:     new mongoose.Types.ObjectId('bbbbbbbbbbbbbbbbbbbbbb02'),
  carol:   new mongoose.Types.ObjectId('cccccccccccccccccccccc03'),
  channel: new mongoose.Types.ObjectId('dddddddddddddddddddddd04'),
  post:    new mongoose.Types.ObjectId('eeeeeeeeeeeeeeeeeeeeee05'),
  comment: new mongoose.Types.ObjectId('ffffffffffffffffffffff06'),
  system:  new mongoose.Types.ObjectId('0000000000000000000000ff'),
};

// ─────────────────────────────────────────────
// User documents
// ─────────────────────────────────────────────
const ALICE = {
  _id:       IDS.alice,
  firstName: 'Alice',
  lastName:  'Smith',
  email:     'alice@example.com',
  username:  'alice',
  privacy:   'public',
  friends:   [],
  followers: [String(IDS.bob)],
  following: [],
  avatar:    null,
};

const BOB = {
  _id:       IDS.bob,
  firstName: 'Bob',
  lastName:  'Jones',
  email:     'bob@example.com',
  username:  'bob',
  privacy:   'public',
  friends:   [],
  followers: [],
  following: [String(IDS.alice)],
  avatar:    null,
};

const CAROL = {
  _id:       IDS.carol,
  firstName: 'Carol',
  lastName:  'King',
  email:     'carol@example.com',
  username:  'carol',
  privacy:   'private',
  friends:   [],
  followers: [],
  following: [],
  avatar:    null,
};

const SYSTEM_USER = {
  _id:       IDS.system,
  firstName: 'Folcen',
  lastName:  '',
  email:     'system@folcen.app',
  username:  'system',
};

// ─────────────────────────────────────────────
// Channel document
// ─────────────────────────────────────────────
const CHANNEL = {
  _id:       IDS.channel,
  name:      'Tech News',
  user:      IDS.alice,
  followers: [String(IDS.bob)],
  type:      'public',
};

// ─────────────────────────────────────────────
// Post documents
// ─────────────────────────────────────────────
const POST = {
  _id:     IDS.post,
  user:    IDS.alice,
  channel: IDS.channel,
  text:    'Hello World — a regular post',
  anonyme: false,
  votes:   [],
};

const ANON_POST = {
  _id:     new mongoose.Types.ObjectId(),
  user:    IDS.alice,
  channel: IDS.channel,
  text:    'Anonymous post content',
  anonyme: true,
  votes:   [],
};

// ─────────────────────────────────────────────
// Comment document
// ─────────────────────────────────────────────
const COMMENT = {
  _id:    IDS.comment,
  user:   IDS.alice,
  post:   IDS.post,
  text:   'Nice post!',
  votes:  [],
  parent: null,
};

// ─────────────────────────────────────────────
// FCM token documents (used in token-cleanup tests)
// ─────────────────────────────────────────────
const BOB_FCM_TOKEN = {
  userId:   String(IDS.bob),
  token:    'valid-fcm-token-bob-device-1',
  platform: 'android',
  deviceId: 'device-bob-1',
};

const BOB_INVALID_FCM_TOKEN = {
  userId:   String(IDS.bob),
  token:    'invalid-stale-token-bob',
  platform: 'android',
  deviceId: 'device-bob-2',
};

// ─────────────────────────────────────────────
// Expected notification text constants
// ─────────────────────────────────────────────
const EXPECTED = {
  // N-01
  friendRequestSent:     { title: 'Alice Smith',              body: 'sent you a friendship request' },
  // N-02
  friendRequestAccepted: { title: 'Bob Jones',                body: 'accepted your friendship request' },
  // N-04
  followPublic:          { title: { en: 'Alice Smith' },      body: { en: 'started following you' } },
  // N-05
  followRequest:         { title: { en: 'Alice Smith' },      body: { en: 'sent you a follow request' } },
  // N-06
  followAccepted:        { title: { en: 'Bob Jones' },        body: { en: 'accepted your follow request' } },
  // N-08
  postPublished:         { title: 'Alice Smith',              body: 'shared a new post in Tech News' },
  // N-09 non-anon voter
  postVoted:             { title: 'Tech News',                body: 'Alice Smith has voted on your post' },
  // N-09 anon voter
  postVotedAnon:         { title: 'Tech News',                body: 'Anonym has voted on your post' },
  // N-10
  commentOnPost:         { type: 'post_commented',      title: 'New comment',        body: 'Alice Smith commented on your post' },
  // N-11
  replyToComment:        { type: 'reply_to_my_comment', title: 'New reply',          body: 'Alice Smith replied to your comment' },
  // N-12
  mentionInComment:      { type: 'mention_comment',     title: 'You were mentioned', body: 'Alice Smith mentioned you in a comment' },
  // N-13
  mentionInPost:         { type: 'mention_post',        title: 'You were mentioned', body: 'Alice mentioned you in a post' },
  // N-14
  commentVoted:          { title: 'Tech News',                body: 'Alice Smith has voted on your post' },
  // N-15
  newProduct:            { title: 'Alice Smith',              body: 'listed a new product: Vintage Lamp' },
  // N-16
  newService:            { title: 'Alice Smith',              body: 'offered a new service: Photography' },
  // N-17
  newJob:                { title: 'Alice Smith',              body: 'posted a new job: Senior Developer' },
  // N-18
  welcomePush:           { body: 'Welcome to Folcen 👋' },
  // N-19
  incomingCall:          { title: 'Incoming call',            body: 'Tap to answer' },
  // N-20
  accountDeletion:       { bodyPrefix: 'Your account has been marked for deletion' },
  // N-21 chat socket event name
  chatSocketEvent:       'new-message',
};

module.exports = {
  IDS,
  ALICE,
  BOB,
  CAROL,
  SYSTEM_USER,
  CHANNEL,
  POST,
  ANON_POST,
  COMMENT,
  BOB_FCM_TOKEN,
  BOB_INVALID_FCM_TOKEN,
  EXPECTED,
};
