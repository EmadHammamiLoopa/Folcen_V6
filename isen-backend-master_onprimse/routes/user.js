const express = require('express');
const User = require('../app/models/User');  // ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Import User model
const Request = require('../app/models/Request');  // ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Import Request model
const Report = require('../app/models/Report');  // ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Import Report model
const Post = require('../app/models/Post');  // ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Import Post model
const fs = require('fs');  
const fsp = fs.promises;
const path = require('path');
const { Parser } = require('json2csv');  // ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Import json2csv to handle CSV conversion
const Comment = require("../app/models/Comment");
const Channel = require("../app/models//Channel");
const Product = require("../app/models//Product");
const Job = require("../app/models//Job");
const Service = require("../app/models//Service");
const Subscription = require('../app/models/Subscription'); // Adjust the path to your Subscription model
const LegalAcceptance = require('../app/models/LegalAcceptance');
const Message = require('../app/models/Message');
const Follow = require('../app/models/Follow');
const UserActivityDaily = require('../app/models/UserActivityDaily');
const AuthEvent = require('../app/models/AuthEvent');
const CallEvent = require('../app/models/CallEvent');
const Activity = require('../app/models/Activity');
const AuditLog = require('../app/models/AuditLog');
const MessageEvent = require('../app/models/MessageEvent');
const peerStore = require('.././app/utils/peerStorage');
const { notifyPeerNeeded, emitToUser } = require('../app/helpers');
const callSessions = require('../app/utils/callSessionStore');
const { sendVideoCallLifecyclePush } = require('../app/services/videoCallPushService');

const Response = require('../app/controllers/Response');

async function armPeerWakeTimeout(callerId, calleeId, meta = {}) {
  const from = String(callerId || '');
  const to = String(calleeId || '');
  const callId = String(meta.callId || '');

  if (!from || !to || !callId) return;

  const now = Date.now();
  const retentionDays = Number(process.env.CALL_EVENT_RETENTION_DAYS || 90);

  await CallEvent.updateOne(
    { callId },
    {
      $setOnInsert: {
        callId,
        initiatedBy: from,
        participants: [from, to],
        lifecycle: [
          {
            event: 'requested',
            at: new Date(now)
          }
        ],
        createdAt: new Date(now),
        expiresAt: new Date(
          now + retentionDays * 24 * 60 * 60 * 1000
        )
      }
    },
    { upsert: true }
  );

  callSessions.clearRingTimer(from, to);

  const remaining =
    Number(meta.expiresAt || 0) - Date.now();

  const delayMs =
    Number.isFinite(remaining) && remaining > 0
      ? remaining
      : callSessions.RING_TIMEOUT_MS;

  const timer = setTimeout(async () => {
    try {
      const activeCallId =
        callSessions.getActiveCallId(from, to);

      const state =
        callSessions.callStates.get(callId);

      console.log('[peer-wake][timeout] fired', {
        callId,
        activeCallId,
        state: state?.state || null
      });

      if (
        String(activeCallId || '') !== callId ||
        state?.state !== 'ringing'
      ) {
        return;
      }

      const at = Date.now();

      const lifecycleResult =
        await CallEvent.updateOne(
          {
            callId,
            'lifecycle.event': {
              $ne: 'timeout'
            }
          },
          {
            $push: {
              lifecycle: {
                event: 'timeout',
                at: new Date(at)
              }
            }
          }
        );

      const changed =
        Number(
          lifecycleResult?.modifiedCount ??
          lifecycleResult?.nModified ??
          0
        );

      if (changed !== 1) {
        console.log(
          '[peer-wake][timeout] already recorded',
          { callId }
        );
        return;
      }

      const updatedUser =
        await User.findByIdAndUpdate(
          to,
          {
            $inc: {
              missedCallBudget: 1
            }
          },
          {
            new: true
          }
        )
          .select('missedCallBudget')
          .lean();

      const payload = {
        from,
        to,
        callerId: from,
        calleeId: to,
        callId,
        callerName: meta.callerName || '',
        reason: 'timeout',
        status: 'timeout',
        at
      };

      console.log(
        '[peer-wake][timeout] MISSED RECORDED',
        {
          callId,
          to,
          missedCallBudget:
            updatedUser?.missedCallBudget
        }
      );

      emitToUser(to, 'budget-update', {
        missedCallBudget:
          updatedUser?.missedCallBudget
      });

      emitToUser(
        to,
        'video-call-missed-timeout',
        payload
      );

      emitToUser(
        to,
        'missed-call',
        payload
      );

      emitToUser(
        to,
        'video-call-timeout',
        {
          ...payload,
          notify: true
        }
      );

      emitToUser(
        from,
        'video-call-timeout',
        {
          ...payload,
          notify: false
        }
      );

      emitToUser(
        to,
        'video-canceled',
        {
          ...payload,
          notify: true
        }
      );

      emitToUser(
        from,
        'video-canceled',
        {
          ...payload,
          notify: false
        }
      );

      sendVideoCallLifecyclePush(
        to,
        'video_call_timeout',
        {
          callId,
          callerId: from,
          calleeId: to,
          callerName:
            meta.callerName || '',
          reason: 'timeout',
          timestamp: at,
          expiresAt:
            meta.expiresAt || at
        }
      ).catch(err =>
        console.warn(
          '[peer-wake][timeout] FCM failed',
          err?.message || err
        )
      );

      callSessions.setCallState(
        callId,
        'timeout',
        {
          from,
          to,
          reason: 'timeout'
        }
      );

      callSessions.clearRingTimer(
        from,
        to
      );

      callSessions.clearActivePair(
        from,
        to
      );

    } catch (err) {
      console.error(
        '[peer-wake][timeout] failed',
        err
      );
    }
  }, delayMs);

  callSessions.ringTimers.set(
    callSessions.keyOf(from, to),
    timer
  );

  console.log(
    '[peer-wake] authoritative timeout armed',
    {
      callId,
      delayMs
    }
  );
}

const {
  allUsers,
  updateUser,
  deleteUser,
  showUser,
  updateAvatar,
  getUsers,
  follow,
  getUserProfile,
  getFriends,
  removeFriendship,
  blockUser,
  unblockUser,
  updateEmail,
  updatePassword,
  storeUser,
  updateUserDash,
  showUserDash,
  showUserEditDash,
  toggleUserStatus,
  clearUserReports,
  reportUser,
  banUser,
  unbanUser,
  verifyUser,
  changeRole,
  updateRandomVisibility,
  updateNonFriendVideoRequests,
  deleteAccount,
  updateAgeVisibility,
  updatePrivacy,
  profileVisited,
  updateMainAvatar,
  uploadChatMedia,
  removeAvatar,
  getMyAnnouncements,
  markAnnouncementSeen,
  resetBudget,
  restoreUser,
  restoreAccount
} = require('../app/controllers/UserController');
const { getUsersAnalytics, getRetentionStats } = require('../app/controllers/AnalyticsController');
const { requireSignin, isAuth, withAuthUser, isAdmin, isSuperAdmin } = require('../app/middlewares/auth');
const form = require('../app/middlewares/form');
const { userById, isNotBlocked } = require('../app/middlewares/user');
const { userUpdateValidator, updateEmailValidator, updatePasswordValidator, userStoreValidator, userDashUpdateValidator } = require('../app/middlewares/validators/userValidator');
const { requireLatestTermsPrivacy } = require('../app/middlewares/legal');
const router = express.Router();
const multer = require('multer');
const Peer = require('../app/models/Peer');   // ÃƒÂ¢Ã¢â‚¬Â Ã‚Â add this
const { upload, chatUpload } = require('../middlewares/upload');
const { enqueueImageProcessing } = require('../app/utils/queue');


// Register routes
console.log('DEBUG: updateEmail type:', typeof updateEmail);
console.log('DEBUG: updateEmailValidator type:', typeof updateEmailValidator);
console.log('DEBUG: withAuthUser type:', typeof withAuthUser);

router.put('/email', [requireSignin, updateEmailValidator, withAuthUser], updateEmail);
router.put('/password', [requireSignin, updatePasswordValidator, withAuthUser], updatePassword);
router.put('/randomVisibility', [requireSignin], updateRandomVisibility);
router.put('/nonFriendVideoRequests', [requireSignin, withAuthUser], updateNonFriendVideoRequests);
router.put('/ageVisibility', [requireSignin, withAuthUser], updateAgeVisibility);
router.put('/privacy', [requireSignin, withAuthUser], updatePrivacy);
router.get('/friends', [requireSignin, withAuthUser], getFriends);
router.get('/profile-visited', [requireSignin, withAuthUser], profileVisited);
router.post('/profile-visited', [requireSignin, withAuthUser], profileVisited);

// Announcements
router.get('/announcements', [requireSignin, withAuthUser], getMyAnnouncements);
router.post('/announcements/:id/seen', [requireSignin, withAuthUser], markAnnouncementSeen);

// Budget
router.post('/reset-budget', [requireSignin, withAuthUser], resetBudget);

router.get('/all', [requireSignin, isAdmin], allUsers);
router.get('/analytics', [requireSignin, isAdmin], getUsersAnalytics);
router.get('/retention', [requireSignin, isAdmin], getRetentionStats);
router.post('/', [form, requireSignin, isSuperAdmin, userStoreValidator], storeUser);

// Add PeerJS routes

/**
 * ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Store Peer ID when a user connects
 */router.post('/:userId/peer', [requireSignin, withAuthUser], async (req, res) => {
  const { userId } = req.params;
  const { peerId }  = req.body;

  if (!peerId) {
    return res.status(400).json({ success:false, message:'peerId is required' });
  }

  try {
    await peerStore.set(userId, peerId);                // <-- upsert + ttl refresh
    console.log(`ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦  stored peerId for ${userId}: ${peerId}`);

    return res.json({
      success : true,
      message : 'Peer ID stored',
      userId,
      peerId
    });
  } catch (err) {
    console.error('ÃƒÂ¢Ã‚ÂÃ…â€™  peerStore.set failed:', err);
    return res.status(500).json({ success:false, message:'DB error', error:err.message });
  }
});


/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ GET   /:userId/peer ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
 * The caller hits this to find out whether the callee is online.
 *  ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“ If a fresh record exists      ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ return {peerId, expires}
 *  ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“ If missing/expired            ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ nudge callee + return {peerId:null}
 */
router.get('/:userId/peer', [requireSignin, withAuthUser], async (req, res, next) => {
  try {
    const { userId } = req.params;
    const callerId = String(req.auth?._id || req.authUser?._id || '');
    if (!callerId || !userId || callerId === String(userId)) {
      return res.status(403).json({ success: false, code: 'invalid_call_target', message: 'Invalid call target' });
    }

    const [callerDoc, calleeDoc] = await Promise.all([
      User.findById(callerId).select('friends').lean(),
      User.findById(userId).select('friends allowVideoRequestsFromNonFriends').lean()
    ]);
    if (!callerDoc || !calleeDoc) {
      return res.status(404).json({ success: false, code: 'user_not_found', message: 'User not found' });
    }

    const callerHasCallee = (callerDoc.friends || []).map(String).includes(String(userId));
    const calleeHasCaller = (calleeDoc.friends || []).map(String).includes(callerId);
    const isFriend = callerHasCallee || calleeHasCaller;
    let persistentVideoPermission = null;

    if (!isFriend) {
      persistentVideoPermission = await Message.findOne({
        type: 'video-call-request',
        status: 'accepted',
        from: callerId,
        to: userId
      }).sort({ updatedAt: -1 }).select('_id').lean();
    }

    if (!isFriend && !persistentVideoPermission) {
      return res.status(403).json({
        success: false,
        code: 'video_permission_required',
        message: 'Video calls require friendship or accepted video-call permission'
      });
    }

    const record = await peerStore.get(userId); // { peerId, lastUpdated } | null
    const caller = req.authUser || {};
    const callerName = [caller.firstName, caller.lastName].filter(Boolean).join(' ').trim();
    const callInvite = {
      callId: req.query?.callId || `call-${callerId}-${userId}-${Date.now()}`,
      callType: req.query?.callType || 'video',
      videoRequestId: persistentVideoPermission?._id
        ? String(persistentVideoPermission._id)
        : req.query?.videoRequestId,
      callerName,
      callerAvatar: caller.mainAvatar || caller.avatar || '',
      expiresAt: Date.now() + callSessions.RING_TIMEOUT_MS
    };

    let didWake = false;
    const registerRingingSession = (source) => {
      callSessions.startRingingCall(callerId, userId, callInvite.callId, {
        expiresAt: callInvite.expiresAt,
        callType: callInvite.callType,
        videoRequestId: callInvite.videoRequestId,
        source
      });
    };

    if (req.query?.wake === '1' || req.query?.wake === 'true') {
      registerRingingSession('peer-wake');

      await armPeerWakeTimeout(
        callerId,
        userId,
        callInvite
      );

      notifyPeerNeeded(
        userId,
        req.auth?._id || req.authUser?._id,
        callInvite
      );

      didWake = true;
    }

    if (!record) {
      if (!didWake) {
        registerRingingSession('peer-missing');

        await armPeerWakeTimeout(
          callerId,
          userId,
          callInvite
        );

        notifyPeerNeeded(
          userId,
          req.auth?._id || req.authUser?._id,
          callInvite
        );
      }
      return res.json({ success: true, peerId: null });
    }

    return res.json({
      success: true,
      peerId: record.peerId
    });

  } catch (err) {
    next(err); // pass to global error handler
  }
});


/**
 * ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Delete Peer ID
 */
router.delete('/:userId/peer', [requireSignin, withAuthUser], async (req, res) => {
    const userId = req.params.userId;

    try {
        const peer = await peerStore.get(userId);

        if (!peer) {
            return res.status(404).json({
                success: false,
                message: "Peer ID not found.",
                userId
            });
        }

        await peerStore.delete(userId);
        console.log(`ÃƒÂ¢Ã‚ÂÃ…â€™ Removed peerId for userId: ${userId}`);
        return res.json({
            success: true,
            message: "Peer ID removed successfully.",
            userId
        });

    } catch (err) {
        console.error("ÃƒÂ¢Ã‚ÂÃ…â€™ Error deleting peerId:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to delete peer ID.",
            error: err.message
        });
    }
});

router.patch('/:userId/peer/heartbeat', [requireSignin, withAuthUser], async (req, res) => {
  const { userId } = req.params;

  try {
    await Peer.updateOne(
      { userId },
      { $set: { lastUpdated: new Date() } }
    );

    return res.json({ success: true });
  } catch (err) {
    console.error('ÃƒÂ¢Ã‚ÂÃ…â€™ heartbeat error:', err);
    return res.status(500).json({ success: false, message: 'DB error' });
  }
});

router.post('/:userId/upload', [requireSignin, withAuthUser, chatUpload.single('upload')], (req, res, next) => {
  console.log('ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Reached /:userId/upload route');
  console.log('Request params userId:', req.params.userId);
  console.log('Authenticated user from middleware:', req.auth);
  console.log('Uploaded file info:', req.file);
  console.log('Saved Chat Path:', req.savedChatPath);

  // You can keep your original controller logic here
  uploadChatMedia(req, res, next);

  // Fire-and-forget: enqueue background job to process the uploaded file
  try {
    if (req.savedChatPath) {
      const srcPath = path.join(__dirname, '..', req.savedChatPath);
      const destPath = path.join(__dirname, '..', 'public', req.savedChatPath.replace('/',''));
      enqueueImageProcessing({ srcPath, destPath }).then(job => {
        console.log('Enqueued image job', job.id);
      }).catch(err => console.error('Failed to enqueue image job', err));
    }
  } catch (e) {
    console.error('Queueing error:', e);
  }
});

router.get('/dash/:userId', [requireSignin, isAdmin], showUserDash);
router.get('/dash/edit/:userId', [requireSignin, isAdmin], showUserEditDash);
router.put('/dash/:userId', [form, requireSignin, isSuperAdmin, userDashUpdateValidator], updateUserDash);

router.post('/follow/:userId', [requireSignin, isNotBlocked, withAuthUser], follow);
router.put('/profile/main-avatar/:userId', [requireSignin, withAuthUser], updateMainAvatar);
router.post('/friends/remove/:userId', [requireSignin, withAuthUser, async (req, res, next) => {
  try {
    console.log('friends/remove loader running');
    const u = await User.findById(req.params.userId);
    if (!u) return Response.sendError(res, 404, 'User not found');
    req.user = u;
    console.log('friends/remove loader set req.user:', !!req.user);
    return next();
  } catch (err) {
    console.error('friends/remove helper error', err);
    return Response.sendError(res, 500, 'Server error');
  }
}], removeFriendship);

router.put('/:userId/avatar', [requireSignin, withAuthUser, upload.single('avatar')], updateAvatar);
router.put('/:userId', [requireSignin, withAuthUser, userUpdateValidator], updateUser);

router.get('/users', [requireSignin, withAuthUser], getUsers);
// Profile uses a distinct route-param name so the global
// router.param('userId', userById) loader does not perform an unnecessary
// full User.findById() before authentication/profile loading.
// getUserProfile already normalizes the ID, including legacy Base64 IDs.
router.get('/profile/:profileUserId', [
  requireSignin,
  (req, res, next) => {
    req.params.userId = req.params.profileUserId;
    next();
  },
  withAuthUser
], getUserProfile);

router.put('/', [requireSignin, withAuthUser, userUpdateValidator], updateUser);

router.post('/status/:userId', [requireSignin, isAdmin], toggleUserStatus);
router.put('/toggle-status/:userId', [requireSignin, isAdmin], toggleUserStatus);
router.post('/verify/:userId', [requireSignin, isAdmin], verifyUser);
router.post('/role/:userId', [requireSignin, isSuperAdmin], changeRole);
router.delete('/remove-avatar/:userId/:avatarUrl', [requireSignin, withAuthUser], removeAvatar);
router.put('/update-main-avatar/:userId', [requireSignin, withAuthUser], updateMainAvatar);

router.delete('/user/:id/avatar', [requireSignin, withAuthUser], removeAvatar);
router.put('/user/:id/main-avatar', [requireSignin, withAuthUser], updateMainAvatar);

router.post('/:userId/block', [requireSignin, withAuthUser], blockUser);
router.post('/:userId/unblock', [requireSignin], unblockUser);

router.delete('/', [requireSignin, withAuthUser], deleteAccount);
// Self-delete alias for dashboard / compatibility
router.post('/me/delete', [requireSignin, withAuthUser], deleteAccount);
// Self-restore alias ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â must NOT use withAuthUser, which blocks isDeleted users
router.post('/me/restore', [requireSignin], restoreAccount);
router.delete('/:userId', [requireSignin, isAdmin], deleteUser);
router.delete('/delete/:userId', [requireSignin, isAdmin], deleteUser);

router.post('/:userId/clearReports', [requireSignin, isAdmin], clearUserReports);
router.post('/:userId/restore', [requireSignin, isAdmin], restoreUser);
router.get('/:userId', [requireSignin, isAuth], showUser);

// Analytics Aliases (Dashboard compatibility)
const AdminController = require('../app/controllers/AdminController');
router.get('/analytics', [requireSignin, isAdmin], AdminController.getAnalytics);
router.get('/retention', [requireSignin, isAdmin], AdminController.getRetention); // Fixed: use getRetention instead of getAnalytics alias

router.post('/:userId/report', [requireSignin], reportUser);
router.post('/:userId/ban', [requireSignin, isAdmin], banUser);
router.post('/:userId/unban', [requireSignin, isAdmin], unbanUser);

router.get('/extract/:userId', [requireSignin, withAuthUser, requireLatestTermsPrivacy, isAdmin], async (req, res) => {
    try {
        const userId = req.params.userId;
        const mongoose = require('mongoose');
        console.log(`ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ‚Â Extracting data for user: ${userId}`);

        // ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Helper to clean and decode data
        const deepClean = (obj) => {
            if (obj === null || obj === undefined) return obj;
            
            if (Array.isArray(obj)) {
                return obj.map(item => deepClean(item));
            }
            
            if (Buffer.isBuffer(obj)) {
                const utf8 = obj.toString('utf8');
                if (/^[\x20-\x7E\s]*$/.test(utf8)) return utf8;
                return obj.toString('hex');
            }
            
            if (typeof obj === 'object') {
                if (obj instanceof mongoose.Types.ObjectId) return obj.toString();
                if (obj instanceof Date) return obj.toISOString();

                const cleaned = {};
                for (const key in obj) {
                    if (['hashed_password', 'salt', 'twoFAToken', '__v'].includes(key)) continue;
                    
                    let val = obj[key];
                    
                    // Decode base64 fields (interests, languages)
                    if ((key === 'interests' || key === 'languages')) {
                        const decode = (raw) => {
                            if (!raw) return raw;
                            if (Array.isArray(raw) && raw.length === 1 && typeof raw[0] === 'string') {
                                raw = raw[0];
                            }
                            if (typeof raw !== 'string') return raw;
                            const candidate = raw.trim();
                            const looksBase64 = /^[A-Za-z0-9+/=]+$/.test(candidate) && candidate.length > 4;
                            if (looksBase64) {
                                try {
                                    const decoded = Buffer.from(candidate, 'base64').toString('utf-8');
                                    if (decoded && /[A-Za-z]/.test(decoded)) {
                                        return decoded.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
                                    }
                                } catch (e) {}
                            }
                            return raw;
                        };
                        val = decode(val);
                    }
                    
                    cleaned[key] = deepClean(val);
                }
                return cleaned;
            }
            return obj;
        };

        // ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Fetch user details
        const userRaw = await User.findById(userId).lean();
        if (!userRaw) {
            console.log(`ÃƒÂ¢Ã‚ÂÃ…â€™ User ${userId} not found.`);
            return res.status(404).json({ error: 'User not found' });
        }
        const user = deepClean(userRaw);
        console.log(`ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ User found: ${user.firstName} ${user.lastName} (${user.email})`);

        // ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Fetch related data
        const [
            requests, reports, posts, products, jobs, services, 
            channels, comments, sentMessages, receivedMessages, 
            legalAcceptances, follows, subscription,
            activities, authEvents, callEvents,
            feedActivities, auditLogs, messageEvents
        ] = await Promise.all([
            Request.find({ user: userId }).lean(),
            Report.find({ user: userId }).lean(),
            Post.find({ user: userId }).lean(),
            Product.find({ user: userId }).lean(),
            Job.find({ user: userId }).lean(),
            Service.find({ user: userId }).lean(),
            Channel.find({ owner: userId }).lean(),
            Comment.find({ user: userId }).lean(),
            Message.find({ from: userId }).lean(),
            Message.find({ to: userId }).lean(),
            LegalAcceptance.find({ userId: userId }).lean(),
            Follow.find({ $or: [{ follower: userId }, { followed: userId }] }).lean(),
            userRaw.subscription && userRaw.subscription._id ? Subscription.findById(userRaw.subscription._id).lean() : Promise.resolve(null),
            UserActivityDaily.find({ userId: userId }).lean(),
            AuthEvent.find({ userId: userId }).lean(),
            CallEvent.find({ $or: [{ caller: userId }, { callee: userId }] }).lean(),
            Activity.find({ actor: userId }).lean(),
            AuditLog.find({ $or: [{ actorId: userId }, { targetUserId: userId }] }).lean(),
            MessageEvent.find({ $or: [{ from: userId }, { to: userId }] }).lean()
        ]);

        const allData = {
            user,
            requests: deepClean(requests),
            reports: deepClean(reports),
            posts: deepClean(posts),
            products: deepClean(products),
            jobs: deepClean(jobs),
            services: deepClean(services),
            channels: deepClean(channels),
            comments: deepClean(comments),
            messages: {
                sent: deepClean(sentMessages),
                received: deepClean(receivedMessages),
                events: deepClean(messageEvents)
            },
            legal_acceptances: deepClean(legalAcceptances),
            follows: deepClean(follows),
            subscription: deepClean(subscription),
            activity_logs: {
                daily: deepClean(activities),
                auth: deepClean(authEvents),
                calls: deepClean(callEvents),
                feed: deepClean(feedActivities),
                audit: deepClean(auditLogs)
            }
        };

        console.log(`ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã…Â  Data Counts - Requests: ${requests.length}, Reports: ${reports.length}, Posts: ${posts.length}, Products: ${products.length}, Jobs: ${jobs.length}, Services: ${services.length}, Channels: ${channels.length}, Comments: ${comments.length}, Messages: ${sentMessages.length + receivedMessages.length}`);

        // ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Flatten user data into CSV-friendly format (Summary)
        const flatData = {
            user_id: user._id,
            first_name: user.firstName,
            last_name: user.lastName,
            email: user.email,
            phone: user.phone || 'N/A',
            role: user.role,
            gender: user.gender,
            birth_date: user.birthDate || 'N/A',
            country: user.country,
            city: user.city,
            education: user.education || 'N/A',
            profession: user.profession || 'N/A',
            interests: Array.isArray(user.interests) ? user.interests.join(', ') : (user.interests || 'N/A'),
            languages: Array.isArray(user.languages) ? user.languages.join(', ') : (user.languages || 'N/A'),
            banned: user.banned ? 'Yes' : 'No',
            banned_reason: user.bannedReason || 'Not Banned',
            friends_count: user.friends ? user.friends.length : 0,
            reports_count: reports.length,
            requests_count: requests.length,
            posts_count: posts.length,
            products_count: products.length,
            jobs_count: jobs.length,
            services_count: services.length,
            channels_count: channels.length,
            comments_count: comments.length,
            messages_count: sentMessages.length + receivedMessages.length,
            legal_acceptances_count: legalAcceptances.length,
            subscription_active: subscription ? 'Yes' : 'No',
            activity_days_count: activities.length,
            auth_events_count: authEvents.length,
            call_events_count: callEvents.length,
            feed_activities_count: feedActivities.length,
            audit_logs_count: auditLogs.length
        };

        // ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Ensure logs directory exists
        const logsDir = path.join(__dirname, '../logs');
        try { await fsp.mkdir(logsDir, { recursive: true }); } catch (e) {}

        // ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Log extraction for GDPR compliance
        const adminId = req.auth ? req.auth._id : (req.user ? req.user.id : 'unknown');
        const logMessage = `${new Date().toISOString()} - Admin ${adminId} extracted data for user ${userId}\n`;
        try {
            await fsp.appendFile(path.join(logsDir, 'extraction.log'), logMessage);
            console.log(`ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã‚Â GDPR Log Updated: ${logMessage.trim()}`);
        } catch (e) {
            console.error('Failed to append GDPR log:', e);
        }

        const requestedFormat = (req.query.format || '').toLowerCase();
        if (requestedFormat === 'json') {
            console.log('ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Returning JSON extract for user', userId);
            return res.status(200).json({
                success: true,
                ...allData,
                summary: flatData
            });
        }

        // ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Convert summary to CSV (default)
        const fields = Object.keys(flatData);
        const parser = new Parser({ fields });
        const csv = parser.parse([flatData]);

        console.log("ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ CSV Generated Successfully!");

        res.status(200)
            .header('Content-Type', 'text/csv')
            .header('Content-Disposition', `attachment; filename="user_${userId}.csv"`)
            .send(csv);

    } catch (error) {
        console.error('ÃƒÂ¢Ã‚ÂÃ…â€™ Error extracting user data:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
router.param('userId', userById);

module.exports = router;
