/**
 * test/gdpr.test.js
 * GDPR pipeline tests: erasure cascade, consent gate, DSAR export, audit trail.
 */
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const assert = require('chai').assert;

// Models
const User = require('../app/models/User');
const UserConsent = require('../app/models/UserConsent');
const UserInterestProfile = require('../app/models/UserInterestProfile');
const AnalyticsEvent = require('../app/models/AnalyticsEvent');
const AuditLog = require('../app/models/AuditLog');
const Notification = require('../app/models/Notification');
const PushToken = require('../app/models/PushToken');
const Post = require('../app/models/Post');
const Comment = require('../app/models/Comment');

// Helpers / controllers
const { purgeUser } = require('../app/helpers');
const GdprController = require('../app/controllers/GdprController');
const InterestAnalyticsCtrl = require('../app/controllers/InterestAnalyticsController');

// Minimal response mock
function mockRes() {
  const r = { _json: null };
  r.json = (d) => (r._json = d);
  r.status = (code) => { r._code = code; return r; };
  return r;
}

// Minimal request builder
function mockReq(overrides) {
  return { authUser: {}, auth: {}, query: {}, params: {}, body: {}, get: () => undefined, ...overrides };
}

// ─────────────────────────────────────────────────────────────────────────────
describe('GDPR — purgeUser cascade', function () {
  this.timeout(30000);
  let mongod;
  let userId;

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri(), { useNewUrlParser: true, useUnifiedTopology: true });
  });

  after(async () => { await mongoose.disconnect(); await mongod.stop(); });

  beforeEach(async () => {
    // Create a user + related data
    userId = new mongoose.Types.ObjectId();
    await Promise.all([
      UserConsent.create({ userId, analytics_optin: true }),
      UserInterestProfile.create({ userId, topCategories: [], tagCounts: {}, lastComputedAt: new Date() }),
      AnalyticsEvent.create({ userId, eventType: 'post_view' }),
      PushToken.create({ userId, token: 'tok123', platform: 'android' }),
    ]);
  });

  afterEach(async () => {
    await Promise.all([
      UserConsent.deleteMany({}), UserInterestProfile.deleteMany({}),
      AnalyticsEvent.deleteMany({}), PushToken.deleteMany({}),
    ]);
  });

  it('deletes UserConsent on purge', async () => {
    await purgeUser(userId);
    const remaining = await UserConsent.countDocuments({ userId });
    assert.equal(remaining, 0, 'UserConsent should be deleted');
  });

  it('deletes UserInterestProfile on purge', async () => {
    await purgeUser(userId);
    const remaining = await UserInterestProfile.countDocuments({ userId });
    assert.equal(remaining, 0, 'UserInterestProfile should be deleted');
  });

  it('deletes PushToken on purge', async () => {
    await purgeUser(userId);
    const remaining = await PushToken.countDocuments({ userId });
    assert.equal(remaining, 0, 'PushTokens should be deleted');
  });

  it('deletes AnalyticsEvent records on purge', async () => {
    await purgeUser(userId);
    const remaining = await AnalyticsEvent.countDocuments({ userId });
    assert.equal(remaining, 0, 'AnalyticsEvent records should be deleted on erasure');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GDPR — consent gate for analytics', function () {
  this.timeout(30000);
  let mongod;

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri(), { useNewUrlParser: true, useUnifiedTopology: true });
  });

  after(async () => { await mongoose.disconnect(); await mongod.stop(); });

  beforeEach(async () => {
    await Promise.all([UserConsent.deleteMany({}), AnalyticsEvent.deleteMany({})]);
  });

  it('does NOT record event when user is not opted in', async () => {
    const userId = new mongoose.Types.ObjectId();
    // No consent record — defaults to not opted in

    const req = mockReq({ authUser: { _id: userId }, body: { eventType: 'post_view' } });
    const res = mockRes();
    await InterestAnalyticsCtrl.recordEvent(req, res);

    assert.deepEqual(res._json.data, { recorded: false, reason: 'not_consented' });
    const count = await AnalyticsEvent.countDocuments({ userId });
    assert.equal(count, 0, 'No event should be stored');
  });

  it('records event when user has opted in', async () => {
    const userId = new mongoose.Types.ObjectId();
    await UserConsent.create({ userId, analytics_optin: true });

    const req = mockReq({ authUser: { _id: userId }, body: { eventType: 'post_view', targetId: new mongoose.Types.ObjectId() } });
    const res = mockRes();
    await InterestAnalyticsCtrl.recordEvent(req, res);

    assert.deepEqual(res._json.data, { recorded: true });
    const count = await AnalyticsEvent.countDocuments({ userId });
    assert.equal(count, 1, 'One event should be stored');
  });

  it('stops recording after consent opt-out', async () => {
    const userId = new mongoose.Types.ObjectId();
    // Create consent opted-in
    const consent = await UserConsent.create({ userId, analytics_optin: true });

    // Record one event — should succeed
    const req1 = mockReq({ authUser: { _id: userId }, body: { eventType: 'post_view' } });
    await InterestAnalyticsCtrl.recordEvent(req1, mockRes());
    assert.equal(await AnalyticsEvent.countDocuments({ userId }), 1);

    // Opt out
    await UserConsent.findOneAndUpdate({ userId }, { $set: { analytics_optin: false } });

    // Try recording again — should be dropped
    const req2 = mockReq({ authUser: { _id: userId }, body: { eventType: 'post_like' } });
    const res2 = mockRes();
    await InterestAnalyticsCtrl.recordEvent(req2, res2);
    assert.equal(res2._json.data.recorded, false);
    assert.equal(await AnalyticsEvent.countDocuments({ userId }), 1, 'Count should still be 1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GDPR — consent update writes history', function () {
  this.timeout(30000);
  let mongod;

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri(), { useNewUrlParser: true, useUnifiedTopology: true });
  });

  after(async () => { await mongoose.disconnect(); await mongod.stop(); });

  beforeEach(async () => { await UserConsent.deleteMany({}); });

  it('creates consent record with self history on first user opt-in', async () => {
    const userId = new mongoose.Types.ObjectId();

    const req = mockReq({
      authUser: { _id: userId, role: 'USER' },
      body: {
        key: 'analytics_optin',
        value: true
      }
    });

    const res = mockRes();

    await GdprController.updateConsent(req, res);

    assert.isTrue(
      res._json.success,
      'Self opt-in should succeed'
    );

    const consent =
      await UserConsent.findOne({
        userId
      });

    assert.isNotNull(
      consent,
      'Consent record should exist'
    );

    assert.isTrue(
      consent.analytics_optin,
      'analytics flag should be true'
    );

    assert.isArray(
      consent.history,
      'history should be an array'
    );

    assert.lengthOf(
      consent.history,
      1,
      'first opt-in should create exactly one history entry'
    );

    assert.equal(
      consent.history[0].key,
      'analytics_optin'
    );

    assert.strictEqual(
      consent.history[0].oldValue,
      false
    );

    assert.strictEqual(
      consent.history[0].newValue,
      true
    );

    assert.equal(
      String(consent.history[0].changedBy),
      String(userId)
    );

    assert.equal(
      consent.history[0].source,
      'self'
    );
  });


  it('rejects ADMIN granting affirmative analytics consent for another user', async () => {
    const userId =
      new mongoose.Types.ObjectId();

    const adminId =
      new mongoose.Types.ObjectId();

    const req = mockReq({
      authUser: {
        _id: adminId,
        role: 'ADMIN'
      },

      body: {
        userId: String(userId),
        key: 'analytics_optin',
        value: true
      }
    });

    const res = mockRes();

    await GdprController.updateConsent(
      req,
      res
    );

    assert.equal(
      res._code,
      403,
      'ADMIN affirmative consent must be forbidden'
    );

    assert.isFalse(
      res._json.success,
      'Response should reject admin opt-in'
    );

    const consent =
      await UserConsent.findOne({
        userId
      });

    assert.isNull(
      consent,
      'Rejected admin opt-in must not create a consent record'
    );
  });


  it('rejects SUPER ADMIN granting affirmative analytics consent for another user', async () => {
    const userId =
      new mongoose.Types.ObjectId();

    const superAdminId =
      new mongoose.Types.ObjectId();

    const req = mockReq({
      authUser: {
        _id: superAdminId,
        role: 'SUPER ADMIN'
      },

      body: {
        userId: String(userId),
        key: 'analytics_optin',
        value: true
      }
    });

    const res = mockRes();

    await GdprController.updateConsent(
      req,
      res
    );

    assert.equal(
      res._code,
      403,
      'SUPER ADMIN affirmative consent must be forbidden'
    );

    assert.isFalse(
      res._json.success,
      'Response should reject super-admin opt-in'
    );

    const consent =
      await UserConsent.findOne({
        userId
      });

    assert.isNull(
      consent,
      'Rejected super-admin opt-in must not create a consent record'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GDPR — consent record has immutable createdAt', function () {
  this.timeout(30000);
  let mongod;

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri(), { useNewUrlParser: true, useUnifiedTopology: true });
  });

  after(async () => { await mongoose.disconnect(); await mongod.stop(); });
  beforeEach(async () => { await UserConsent.deleteMany({}); });

  it('consent record has a createdAt set on first upsert', async () => {
    const userId = new mongoose.Types.ObjectId();
    const before = new Date();
    await UserConsent.findOneAndUpdate(
      { userId },
      { $set: { analytics_optin: true, updatedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const record = await UserConsent.findOne({ userId });
    assert.isNotNull(record, 'Record should exist');
    assert.isNotNull(record.createdAt, 'createdAt should be set');
    assert.isAtMost(record.createdAt.getTime(), Date.now() + 1000);
    assert.isAtLeast(record.createdAt.getTime(), before.getTime() - 1000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GDPR — audit log browsing without userId filter', function () {
  this.timeout(30000);
  let mongod;

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri(), { useNewUrlParser: true, useUnifiedTopology: true });
  });

  after(async () => { await mongoose.disconnect(); await mongod.stop(); });

  it('auditLogs controller returns docs even when userId is not provided', async () => {
    const AuditLog = require('../app/models/AuditLog');
    await AuditLog.deleteMany({});
    await AuditLog.create({ action: 'EXPORT', actorRole: 'ADMIN', meta: { test: true } });

    const req = mockReq({ authUser: { role: 'ADMIN' }, query: {} });
    const res = mockRes();
    await GdprController.auditLogs(req, res);

    assert.isTrue(res._json.success, 'Should return success');
    assert.isArray(res._json.data.docs);
    assert.isAtLeast(res._json.data.docs.length, 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GDPR — recompute profiles only for consented users', function () {
  this.timeout(30000);
  let mongod;

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri(), { useNewUrlParser: true, useUnifiedTopology: true });
  });

  after(async () => { await mongoose.disconnect(); await mongod.stop(); });

  beforeEach(async () => {
    await Promise.all([
      UserConsent.deleteMany({}),
      AnalyticsEvent.deleteMany({}),
      UserInterestProfile.deleteMany({})
    ]);
  });

  it('recomputes profiles only for consented users', async () => {
    const userA = new mongoose.Types.ObjectId(); // opted in
    const userB = new mongoose.Types.ObjectId(); // not opted in

    await UserConsent.create({ userId: userA, analytics_optin: true });
    await UserConsent.create({ userId: userB, analytics_optin: false });

    await AnalyticsEvent.create([
      { userId: userA, eventType: 'post_like', category: 'tech' },
      { userId: userA, eventType: 'post_view', category: 'tech' },
      { userId: userB, eventType: 'post_like', category: 'sport' }, // should be ignored
    ]);

    const updated = await InterestAnalyticsCtrl.recomputeInterestProfiles();
    assert.equal(updated, 1, 'Only 1 user (opted-in) should have profile updated');

    const profileA = await UserInterestProfile.findOne({ userId: userA });
    assert.isNotNull(profileA, 'userA should have a profile');

    const profileB = await UserInterestProfile.findOne({ userId: userB });
    assert.isNull(profileB, 'userB should NOT have a profile (not consented)');
  });
});
