/*********************************************************************
 * routes/push.js
 * -------------------------------------------------------------------
 * REST endpoints for FCM push-token registration / unregistration.
 *
 *   POST /api/v1/push/register    (auth required)
 *   POST /api/v1/push/unregister  (auth required)
 *********************************************************************/

const router    = require('express').Router();
const PushToken = require('../app/models/PushToken');
const { requireSignin, withAuthUser } = require('../app/middlewares/auth');

const auth = [requireSignin, withAuthUser];

// ── POST /api/v1/push/register ────────────────────────────────────
router.post('/register', auth, async (req, res) => {
  try {
    const userId   = String(req.authUser._id);
    const { token, platform = 'android', deviceId = null } = req.body;

    if (!token || typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ success: false, message: 'token is required' });
    }

    // Upsert: if this token already exists update its owner + metadata,
    // otherwise create a new document.
    await PushToken.findOneAndUpdate(
      { token: token.trim() },
      {
        userId,
        platform,
        deviceId,
        lastSeenAt: new Date(),
      },
      { upsert: true, setDefaultsOnInsert: true, new: true }
    );

    return res.json({ success: true, message: 'Push token registered' });
  } catch (err) {
    console.error('[push/register]', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── POST /api/v1/push/unregister ─────────────────────────────────
router.post('/unregister', auth, async (req, res) => {
  try {
    const userId = String(req.authUser._id);
    const { token } = req.body;

    if (!token || typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ success: false, message: 'token is required' });
    }

    // Only delete if the token belongs to the requesting user
    await PushToken.deleteOne({ token: token.trim(), userId });

    return res.json({ success: true, message: 'Push token unregistered' });
  } catch (err) {
    console.error('[push/unregister]', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
