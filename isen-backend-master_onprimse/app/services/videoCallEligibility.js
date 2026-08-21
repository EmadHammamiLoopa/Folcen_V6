'use strict';

const User = require('../models/User');
const Message = require('../models/Message');

function hasFriend(user, otherId) {
  return (user?.friends || []).map(String).includes(String(otherId));
}

async function getVideoCallEligibility(callerId, calleeId) {
  const caller = String(callerId || '');
  const callee = String(calleeId || '');

  if (!caller || !callee || caller === callee) {
    return { allowed: false, code: 'invalid_call_target' };
  }

  const [callerDoc, calleeDoc] = await Promise.all([
    User.findById(caller).select('friends').lean(),
    User.findById(callee).select('friends').lean(),
  ]);

  if (!callerDoc || !calleeDoc) {
    return { allowed: false, code: 'user_not_found' };
  }

  const isFriend = hasFriend(callerDoc, callee) || hasFriend(calleeDoc, caller);
  let persistentVideoPermission = null;

  if (!isFriend) {
    persistentVideoPermission = await Message.findOne({
      type: 'video-call-request',
      status: 'accepted',
      from: caller,
      to: callee,
    }).sort({ updatedAt: -1 }).select('_id').lean();
  }

  if (!isFriend && !persistentVideoPermission) {
    return {
      allowed: false,
      code: 'video_permission_required',
      isFriend: false,
      persistentVideoPermission: null,
    };
  }

  return {
    allowed: true,
    isFriend,
    persistentVideoPermission,
  };
}

module.exports = { getVideoCallEligibility };
