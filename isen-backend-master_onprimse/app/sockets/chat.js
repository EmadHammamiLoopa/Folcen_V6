const Message = require("../models/Message");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const mongoose = require("mongoose");
const User = require("../models/User");
const Follow = require("../models/Follow");
const { sendPushToUser } = require("../services/fcmPushService");

// ✅ Import from socketManager
const { connectedUsers } = require("../utils/socketManager");
const { recordMessageEvent } = require('../utils/eventLogger');

const VIDEO_REQUEST_RETRY_COOLDOWN_MS = Number(
  process.env.VIDEO_REQUEST_RETRY_COOLDOWN_MS || 5 * 60 * 1000
);

module.exports = (io, socket) => {
  /* ───────────── helpers ───────────── */

  const logConnectedUsers = () => {
    console.log(`Currently ${connectedUsers.size} users connected`);
  };

  function getUserSockets(userId) {
    const bucket = connectedUsers.get(userId);
    if (!bucket) return [];
    return Array.from(bucket);
  }

  function emitToUser(userId, event, payload) {
    const sids = getUserSockets(userId);
    if (!sids.length) return false;
    for (const sid of sids) io.to(sid).emit(event, payload);
    return true;
  }


  /* ───────── disconnect / connect-user ───────── */

  socket.on("disconnect", async function () {
    console.log(`❌ Disconnected: User ${socket.userId || "Unknown"}, Socket ID: ${socket.id}`);
  
    if (socket.userId && connectedUsers.has(socket.userId)) {
      const bucket = connectedUsers.get(socket.userId);
  
      // Remove this socket from the user's set
      bucket.delete(socket.id);
  
      // If no sockets left, clean bucket & mark offline
      if (bucket.size === 0) {
        connectedUsers.delete(socket.userId);
        try {
          await User.findByIdAndUpdate(socket.userId, {
            lastSeen: new Date(), // ✅ only update lastSeen
          });
          console.log(`💤 Marked user ${socket.userId} as offline`);
          io.emit("user-status-changed", { userId: socket.userId, online: false });
        } catch (err) {
          console.error("❌ Failed to update DB offline status:", err);
        }
      }
    }
  
    logConnectedUsers();
  });
  

  socket.on("disconnect-user", function () {
    if (socket.userId && connectedUsers.has(socket.userId)) {
      connectedUsers.delete(socket.userId);
    }
    socket.disconnect();
    logConnectedUsers();
  });
  
// Video call request
socket.on("video-call-request", async (data, ack) => {
  try {
    const callerId = socket.userId; // use server-authoritative ID
    const receiverId = String(data?.to || '');
    if (!callerId) {
      if (ack) ack({ success: false, error: 'not_authenticated', retryable: false });
      return;
    }
    if (!mongoose.Types.ObjectId.isValid(receiverId) || String(callerId) === receiverId) {
      if (ack) ack({ success: false, error: 'invalid_recipient', retryable: false });
      return;
    }

    const [caller, receiver] = await Promise.all([
      User.findById(callerId).select('friends firstName lastName').lean(),
      User.findById(receiverId).select('friends firstName lastName allowVideoRequestsFromNonFriends').lean()
    ]);
    if (!caller || !receiver) {
      if (ack) ack({ success: false, error: 'recipient_not_found', retryable: false });
      return;
    }

    const isFriend =
      (caller?.friends || []).some(id => String(id) === receiverId) ||
      (receiver?.friends || []).some(id => String(id) === String(callerId));

    if (isFriend) {
      if (ack) ack({ success: false, error: 'already_friends', retryable: false });
      return;
    }

    const receiverAllowsVideoRequests = !(
      receiver.allowVideoRequestsFromNonFriends === false ||
      receiver.allowVideoRequestsFromNonFriends === 'false' ||
      receiver.allowVideoRequestsFromNonFriends === 0 ||
      receiver.allowVideoRequestsFromNonFriends === '0'
    );
    if (!receiverAllowsVideoRequests) {
      if (ack) ack({ success: false, error: 'video_requests_disabled', retryable: false });
      return;
    }

    // Accepted requests are persistent directional permission records.
    const acceptedPermission = await Message.findOne({
      from: callerId,
      to: receiverId,
      type: 'video-call-request',
      status: 'accepted'
    }).sort({ updatedAt: -1 }).select('_id').lean();
    if (acceptedPermission) {
      if (ack) ack({
        success: false,
        error: 'already_allowed',
        retryable: false,
        messageId: String(acceptedPermission._id)
      });
      return;
    }

    // There can be only one pending video permission request between a pair,
    // regardless of which side sent it. Never cancel-and-recreate it.
    const pending = await Message.findOne({
      from: { $in: [callerId, receiverId] },
      to: { $in: [callerId, receiverId] },
      type: 'video-call-request',
      status: 'pending'
    }).sort({ createdAt: -1 }).select('_id from to status').lean();
    if (pending) {
      if (ack) ack({
        success: false,
        error: 'request_pending',
        retryable: false,
        messageId: String(pending._id),
        from: String(pending.from),
        to: String(pending.to),
        status: 'pending'
      });
      return;
    }

    // A rejection/revocation does not permanently block future requests, but
    // adds a short sender→recipient cooldown to prevent immediate notification spam.
    const lastDenied = await Message.findOne({
      from: callerId,
      to: receiverId,
      type: 'video-call-request',
      status: { $in: ['rejected', 'revoked'] }
    }).sort({ updatedAt: -1 }).select('updatedAt createdAt').lean();
    if (lastDenied) {
      const deniedAt = new Date(lastDenied.updatedAt || lastDenied.createdAt || 0).getTime();
      const elapsed = Date.now() - deniedAt;
      if (deniedAt > 0 && elapsed < VIDEO_REQUEST_RETRY_COOLDOWN_MS) {
        if (ack) ack({
          success: false,
          error: 'request_cooldown',
          retryable: false,
          retryAfterMs: VIDEO_REQUEST_RETRY_COOLDOWN_MS - elapsed
        });
        return;
      }
    }

    const callerName = [caller?.firstName, caller?.lastName].filter(Boolean).join(" ") || "Someone";
    const payload = {
      text: `${callerName} would like permission to video call you.`,
      from: new mongoose.Types.ObjectId(callerId),
      to: new mongoose.Types.ObjectId(receiverId),
      type: "video-call-request",
      status: "pending",
      state: "sent",
      createdAt: new Date()
    };

    const message = new Message(payload);
    const saved = await message.save();

    await Promise.all([
      User.findByIdAndUpdate(callerId, { $push: { messages: saved._id } }),
      User.findByIdAndUpdate(receiverId, { $push: { messages: saved._id } }),
    ]);

    const safeCallPayload = {
      _id: String(saved._id),
      text: saved.text,
      from: String(saved.from),
      to: String(saved.to),
      type: saved.type,
      status: saved.status,
      state: saved.state,
      createdAt: saved.createdAt
    };

    emitToUser(receiverId, "new-message", safeCallPayload);
    emitToUser(callerId, "message-sent", { ...safeCallPayload, tempId: data.messageId });

    sendPushToUser(receiverId, {
      title: "Video call request",
      body: `${callerName} sent you a video call request`,
      data: {
        // Do not spread safeCallPayload here. FCM reserves keys such as
        // "from", so permission pushes must contain only app-owned keys.
        type: "video-call-request",
        category: "message",
        event: "video-call-request",
        status: "pending",
        fromUserId: String(callerId),
        callerId: String(callerId),
        messageId: String(saved._id),
        link: `/messages/chat/${String(callerId)}`
      },
      android: {
        priority: "high",
        notification: {
          channelId: "default",
          sound: "default",
          defaultSound: true
        }
      },
      apns: {
        headers: { "apns-priority": "10" },
        payload: { aps: { sound: "default" } }
      }
    }).then(result => {
      console.log(`[chat] video request push to ${receiverId}:`, result);
    }).catch(err => console.warn("[chat] video request push failed:", err.message));

    if (ack) ack({ success: true, messageId: saved._id });
  } catch (err) {
    console.error("❌ Error in video-call-request:", err);
    if (ack) ack({ success: false, error: err.message, retryable: false });
  }
});

// Authoritative persisted state for chat header. This keeps permission UI
// correct even when the original request card is outside the loaded page.
socket.on("video-call-permission-state", async (data, ack) => {
  try {
    const authUser = socket.userId;
    const peerId = String(data?.peerId || '');
    if (!authUser) {
      if (ack) ack({ success: false, error: 'not_authenticated' });
      return;
    }
    if (!mongoose.Types.ObjectId.isValid(peerId) || String(authUser) === peerId) {
      if (ack) ack({ success: false, error: 'invalid_recipient' });
      return;
    }

    const [outgoing, incomingAccepted] = await Promise.all([
      Message.findOne({
        from: authUser,
        to: peerId,
        type: 'video-call-request',
        status: { $in: ['pending', 'accepted'] }
      }).sort({ updatedAt: -1 }).select('_id status from to').lean(),
      Message.findOne({
        from: peerId,
        to: authUser,
        type: 'video-call-request',
        status: 'accepted'
      }).sort({ updatedAt: -1 }).select('_id status from to').lean()
    ]);

    if (ack) ack({
      success: true,
      outgoing: outgoing ? {
        messageId: String(outgoing._id),
        status: String(outgoing.status),
        from: String(outgoing.from),
        to: String(outgoing.to)
      } : null,
      incomingAccepted: incomingAccepted ? {
        messageId: String(incomingAccepted._id),
        status: 'accepted',
        from: String(incomingAccepted.from),
        to: String(incomingAccepted.to)
      } : null
    });
  } catch (err) {
    console.error("❌ Error loading video-call-permission-state:", err);
    if (ack) ack({ success: false, error: err.message });
  }
});



// Video call accepted
socket.on("video-call-accepted", async (data, ack) => {
  try {
    const authUser = socket.userId;
    if (!authUser) {
      if (ack) ack({ success: false, error: 'not_authenticated' });
      return;
    }
    if (!mongoose.Types.ObjectId.isValid(data?.messageId)) {
      if (ack) ack({ success: false, error: 'invalid_request' });
      return;
    }

    // Only the recipient of a pending request may grant access.
    const msg = await Message.findOneAndUpdate(
      {
        _id: data.messageId,
        type: 'video-call-request',
        status: 'pending',
        to: authUser
      },
      { $set: { status: 'accepted' } },
      { new: true }
    );

    if (!msg) {
      if (ack) ack({ success: false, error: 'request_not_actionable' });
      return;
    }

    const eventPayload = {
      messageId: String(msg._id),
      status: 'accepted',
      from: String(msg.from),
      to: String(msg.to)
    };
    emitToUser(String(msg.from), "video-call-accepted", eventPayload);
    emitToUser(String(msg.to), "video-call-accepted", eventPayload);

    User.findById(authUser).select("firstName lastName").lean().then(accepter => {
      const accepterName = [accepter?.firstName, accepter?.lastName].filter(Boolean).join(" ") || "The recipient";
      return sendPushToUser(String(msg.from), {
        title: "Video request accepted",
        body: `${accepterName} accepted your video call request`,
        data: {
          type: "video-call-accepted",
          category: "message",
          fromUserId: String(msg.to),
          messageId: String(msg._id),
          link: `/messages/chat/${String(msg.to)}`
        },
        android: {
          priority: "high",
          notification: {
            channelId: "default",
            sound: "default",
            defaultSound: true
          }
        },
        apns: {
          headers: { "apns-priority": "10" },
          payload: { aps: { sound: "default" } }
        }
      });
    }).catch(err => console.warn("[chat] accepted video request push failed:", err.message));

    if (ack) ack({ success: true, ...eventPayload });
  } catch (err) {
    console.error("❌ Error in video-call-accepted:", err);
    if (ack) ack({ success: false, error: err.message });
  }
});

// Backwards-compatible event from the existing video screen. Accepted video
// requests are now persistent permissions, so starting a call must NOT consume
// the permission or change the chat message status.
socket.on("video-call-used", async (data) => {
  try {
    const authUser = socket.userId;
    if (!authUser || !mongoose.Types.ObjectId.isValid(data?.messageId)) return;
    await Message.exists({
      _id: data.messageId,
      type: 'video-call-request',
      status: 'accepted',
      from: authUser
    });
  } catch (err) {
    console.error("Error validating persistent video permission:", err);
  }
});

// Video request cancelled / rejected / permission revoked
socket.on("video-call-cancelled", async (data, ack) => {
  try {
    const authUser = socket.userId;
    if (!authUser) {
      if (ack) ack({ success: false, error: 'not_authenticated' });
      return;
    }
    if (!mongoose.Types.ObjectId.isValid(data?.messageId)) {
      if (ack) ack({ success: false, error: 'invalid_request' });
      return;
    }

    const requestedStatus = ['cancelled', 'rejected', 'expired', 'revoked'].includes(String(data?.status))
      ? String(data.status)
      : (String(data?.reason) === 'rejected'
          ? 'rejected'
          : String(data?.reason) === 'revoked'
            ? 'revoked'
            : String(data?.reason) === 'timeout'
              ? 'expired'
              : 'cancelled');

    const existing = await Message.findOne({
      _id: data.messageId,
      type: 'video-call-request'
    });
    if (!existing) {
      if (ack) ack({ success: false, error: 'request_not_found' });
      return;
    }

    const actor = String(authUser);
    const sender = String(existing.from);
    const recipient = String(existing.to);
    const currentStatus = String(existing.status || 'pending');

    let allowed = false;
    if (requestedStatus === 'cancelled') {
      allowed = currentStatus === 'pending' && actor === sender;
    } else if (requestedStatus === 'rejected') {
      allowed = currentStatus === 'pending' && actor === recipient;
    } else if (requestedStatus === 'revoked') {
      allowed = currentStatus === 'accepted' && actor === recipient;
    } else if (requestedStatus === 'expired') {
      allowed = currentStatus === 'pending' && (actor === sender || actor === recipient);
    }

    if (!allowed) {
      if (ack) ack({ success: false, error: 'request_not_actionable' });
      return;
    }

    existing.status = requestedStatus;
    const msg = await existing.save();
    const reason = requestedStatus === 'rejected'
      ? 'rejected'
      : requestedStatus === 'revoked'
        ? 'revoked'
        : requestedStatus === 'expired'
          ? 'timeout'
          : 'cancel';

    const eventPayload = {
      messageId: String(msg._id),
      status: requestedStatus,
      reason,
      from: sender,
      to: recipient
    };
    emitToUser(sender, "video-call-cancelled", eventPayload);
    emitToUser(recipient, "video-call-cancelled", eventPayload);

    // Socket.IO keeps the UI live. FCM independently provides the
    // user-visible notification when foreground/background/killed.
    if (['cancelled', 'rejected', 'revoked'].includes(requestedStatus)) {
      const pushTarget =
        requestedStatus === 'cancelled'
          ? recipient
          : sender;

      const peerId =
        requestedStatus === 'cancelled'
          ? sender
          : recipient;

      const notificationType =
        requestedStatus === 'cancelled'
          ? 'video-call-cancelled'
          : `video-call-${requestedStatus}`;

      const title =
        requestedStatus === 'cancelled'
          ? 'Video request cancelled'
          : requestedStatus === 'rejected'
            ? 'Video request rejected'
            : 'Video access revoked';

      const body =
        requestedStatus === 'cancelled'
          ? 'A pending video call request was cancelled.'
          : requestedStatus === 'rejected'
            ? 'Your video call request was rejected.'
            : 'Your video call access was revoked.';

      sendPushToUser(pushTarget, {
        title,
        body,
        data: {
          type: notificationType,
          event: notificationType,
          category: 'message',
          status: requestedStatus,
          fromUserId: String(peerId),
          messageId: String(msg._id),
          link: `/messages/chat/${String(peerId)}`
        },
        android: {
          priority: 'high'
        },
        apns: {
          headers: {
            'apns-priority': '10'
          },
          payload: {
            aps: {
              sound: 'default'
            }
          }
        }
      }).then(result => {
        console.log(
          `[chat] ${notificationType} push to ${pushTarget}:`,
          result
        );
      }).catch(err => {
        console.warn(
          `[chat] ${notificationType} push failed:`,
          err.message
        );
      });
    }

    if (ack) ack({ success: true, ...eventPayload });
  } catch (err) {
    console.error("❌ Error in video-call-cancelled:", err);
    if (ack) ack({ success: false, error: err.message });
  }
});


// Leaving a chat must not mutate video-request state. Pending requests and
// accepted permissions are persisted in Message and survive close/reopen/login.
socket.on("leave-chat", ({ withUser } = {}) => {
  if (!socket.userId || !withUser) return;
});

socket.on("mark-thread-read", async ({ peerId } = {}) => {
  try {
    const readerId = socket.userId;
    if (!readerId || !mongoose.Types.ObjectId.isValid(peerId)) return;

    const readAt = new Date();
    const result = await Message.updateMany(
      { from: peerId, to: readerId, state: { $ne: "seen" } },
      {
        $set: { state: "seen" },
        $addToSet: { readBy: { user: new mongoose.Types.ObjectId(readerId), at: readAt } }
      }
    );

    if ((result.modifiedCount || result.nModified || 0) > 0) {
      emitToUser(String(peerId), "message-read", {
        readerId: String(readerId),
        peerId: String(peerId),
        readAt: readAt.toISOString()
      });
    }
  } catch (e) {
    console.error("mark-thread-read failed", e);
  }
});


// connect-user
socket.on("connect-user", async (user_id) => {
  // Do NOT allow client-supplied user_id to override authenticated identity.
  const authUser = socket.userId;
  if (!authUser) {
    console.warn('connect-user attempted on unauthenticated socket');
    return;
  }
  if (String(authUser) !== String(user_id)) {
    console.warn('connect-user mismatch: client attempted to set user_id different from authenticated token');
    return;
  }

  const userId = authUser;
  console.log(`✅ Authenticated socket confirmed for user: ${userId}, Socket ID: ${socket.id}`);

  if (!connectedUsers.has(userId)) connectedUsers.set(userId, new Set());
  connectedUsers.get(userId).add(socket.id);
  logConnectedUsers();

  try {
    await User.findByIdAndUpdate(userId, { lastSeen: new Date() });
    io.emit('user-status-changed', { userId, online: true });
  } catch (err) {
    console.error('❌ Failed to update DB online status:', err);
  }
});


  /* ─────────────── send-message ─────────────── */

  socket.on("send-message", async (msg, image, ind) => {
    const tempId = msg?.id;

    try {
      // Enforce sender identity from authenticated socket only (privacy-first).
      const senderId = socket.userId;
      if (!senderId) {
        console.warn('send-message rejected: socket not authenticated');
        try { socket.emit('send-message-error', { tempId, reason: 'not_authenticated' }); } catch (_) {}
        return;
      }

      // Normalize fields and ignore client-supplied `from` to prevent spoofing
      msg.to   = msg.to   || msg._to;
      msg.text = msg.text || msg._text;

      console.log(`📢 WebSocket Event Received: send-message from socket.userId=${senderId}`);

      // Validate required fields
      if (!msg.to || (typeof msg.text !== "string" && typeof msg.image !== "string")) {
        console.error("❌ Invalid message format! Must include text or image.", msg);
        try { socket.emit('send-message-error', { tempId, reason: 'invalid_format' }); } catch (_) {}
        return;
      }

      // Validate ObjectId for recipient
      if (!mongoose.Types.ObjectId.isValid(msg.to)) {
        console.error("❌ Invalid recipient ID in message", msg.to);
        try { socket.emit('send-message-error', { tempId, reason: 'invalid_recipient_id', to: msg.to }); } catch (_) {}
        return;
      }

      console.log(`📩 Message attempt from ${senderId} to ${msg.to}`);

      // Ensure users exist
      const [sender, receiver] = await Promise.all([
        User.findById(senderId),
        User.findById(msg.to),
      ]);
      if (!sender || !receiver) {
        console.error("❌ Sender or Receiver not found!");
        try { socket.emit('send-message-error', { tempId, reason: 'user_not_found' }); } catch (_) {}
        return;
      }

      // Check if blocked
      const isBlockedByReceiver = receiver.blockedUsers && receiver.blockedUsers.some(id => id.toString() === senderId.toString());
      const isBlockedBySender = sender.blockedUsers && sender.blockedUsers.some(id => id.toString() === msg.to.toString());

      if (isBlockedByReceiver || isBlockedBySender) {
        console.warn(`Message blocked: ${senderId} and ${msg.to} have a block relationship`);
        try { socket.emit('send-message-error', { tempId, reason: 'blocked' }); } catch (_) {}
        return;
      }

      // Privacy Check: If receiver is private, sender must be a friend or active follower
      if (receiver.isPrivate) {
        const isFriend = receiver.friends && receiver.friends.some(id => id.toString() === senderId.toString());
        const follow = await Follow.findOne({ follower: senderId, followed: msg.to, status: 'active' });
        
        if (!isFriend && !follow) {
          console.warn(`Message blocked: ${msg.to} is private and ${senderId} is not a friend or active follower`);
          try { socket.emit('send-message-error', { tempId, reason: 'privacy_blocked' }); } catch (_) {}
          emitToUser(senderId, 'message-blocked-privacy', { recipientId: msg.to });
          return;
        }
      }

      // Simple per-socket rate limiting (privacy-abuse protection)
      try {
        const windowMs = 60 * 1000; // 1 minute
        const maxPerWindow = Number(process.env.MSG_RATE_LIMIT_PER_MIN || 60);
        socket._msgWindowStart = socket._msgWindowStart || Date.now();
        socket._msgCount = socket._msgCount || 0;
        if (Date.now() - socket._msgWindowStart > windowMs) {
          socket._msgWindowStart = Date.now(); socket._msgCount = 0;
        }
        socket._msgCount += 1;
        if (socket._msgCount > maxPerWindow) {
          console.warn(`Rate limit exceeded for ${senderId}`);
          try { await recordMessageEvent({ from: senderId, to: msg.to, event: 'blocked', reason: 'rate_limit' }); } catch (e) {}
          try { socket.emit('send-message-error', { tempId, reason: 'rate_limited' }); } catch (_) {}
          emitToUser(senderId, 'message-rate-limited', { perMinute: maxPerWindow });
          return;
        }
      } catch (e) { console.warn('rate-limit check failed', e); }

      // Prepare message doc (store canonical author server-side)
      const messageData = {
        text: msg.text,
        from: new mongoose.Types.ObjectId(senderId),
        to  : new mongoose.Types.ObjectId(msg.to),
        image: null,
        state: "sent",
        type : msg.type || "friend",
        productId: msg.productId || null,
      };

      // Handle image if present
      if (typeof msg.image === "string") {
        if (msg.image.startsWith("http")) {
          const ext = path.extname(msg.image).toLowerCase();
          const mimeType =
            ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
            ext === ".png"                      ? "image/png"   :
            ext === ".gif"                      ? "image/gif"   :
                                                  "application/octet-stream";
          messageData.image = { path: msg.image, type: mimeType };
        } else if (msg.image.startsWith("data:image")) {
          console.log("🖼️ Detected base64 image. Starting to save...");
          const matches   = msg.image.match(/^data:(image\/\w+);base64,/);
          const mimeType  = matches ? matches[1] : "image/png";
          const extension = mimeType.split("/")[1];
          const photoName = `${msg.from}_${msg.to}_${Date.now()}.${extension}`;
          const photoPath = path.join(__dirname, `../../public/chats/${photoName}`);
          const base64    = msg.image.replace(/^data:image\/\w+;base64,/, "");

          try {
            // Ensure directory exists (async)
            await fsp.mkdir(path.dirname(photoPath), { recursive: true });
            await fsp.writeFile(photoPath, Buffer.from(base64, "base64"));
            messageData.image = { path: `/chats/${photoName}`, type: mimeType };
            console.log("✅ Image saved at:", `/chats/${photoName}`);
          } catch (err) {
            console.error("❌ Failed to save image:", err);
          }
        }
      }

      // Save message (author is enforced server-side)
      const message = new Message(messageData);
      const savedMessage = await message.save();
      console.log("✅ Message saved:", savedMessage._id);

      // Record minimal send attempt event (no content stored)
      try { await recordMessageEvent({ messageId: savedMessage._id, from: senderId, to: msg.to, event: 'send_attempt' }); } catch (e) { console.warn('Failed to record message event', e); }

      // Update user docs (use server-side senderId, never trust msg.from)
      await Promise.all([
        User.findByIdAndUpdate(senderId, { $push: { messages: savedMessage._id } }),
        User.findByIdAndUpdate(msg.to,   { $push: { messages: savedMessage._id } }),
      ]);
      console.log("✅ Message added to users' message arrays");

      // Sanitize payload: only send minimal, intentional fields to clients.
      // All ObjectIds MUST be converted to strings for clean cross-device comparison.
      const safePayload = {
        _id: String(savedMessage._id),
        text: savedMessage.text,
        from: String(savedMessage.from),
        to: String(savedMessage.to),
        image: savedMessage.image || null,
        state: savedMessage.state || 'sent',
        type: savedMessage.type || 'friend',
        productId: savedMessage.productId ? String(savedMessage.productId) : null,
        createdAt: savedMessage.createdAt
      };

      // Deliver to receiver (ALL sockets)
      const delivered = await emitToUser(msg.to, "new-message", safePayload);
      if (delivered) {
        console.log(`📤 Delivered to receiver (${msg.to}) on ${getUserSockets(msg.to).length} socket(s)`);
        try { await recordMessageEvent({ messageId: savedMessage._id, from: senderId, to: msg.to, event: 'delivered' }); } catch (e) { console.warn('Failed to record message delivered event', e); }
      } else {
        console.warn(`⚠️ User ${msg.to} offline - message saved but not delivered`);
        // Do NOT record message content; record delivery missing for diagnostics
        // Send FCM push so the recipient is notified on their device
        try {
          const { sendNotification } = require('../helpers');
          const senderName = `${sender.firstName || ''} ${sender.lastName || ''}`.trim() || 'New message';
          const messagePreview = msg.text ? String(msg.text).substring(0, 100) : '📷 Image';
          sendNotification([msg.to], messagePreview, senderName, senderId).catch(() => {});
        } catch (pushErr) {
          console.warn('[chat] FCM push failed for offline user:', pushErr.message);
        }
      }

      // Confirm to sender using server-authoritative senderId (not client-supplied msg.from).
      // This ensures the confirmation always reaches the right socket even if msg.from encoding differs.
      const senderConfirmation = { ...safePayload, tempId, delivery: delivered ? 'delivered' : 'sent' };
      socket.emit("message-sent", senderConfirmation);
      await emitToUser(senderId, "message-sent", senderConfirmation);

      // (Optional) Emit a counter update event if you maintain per-tab badges:
      // emitToUser(msg.to, 'messages-updated', { delta: 1 });

    } catch (err) {
      console.error("❌ Error in send-message:", err);
      try { socket.emit('send-message-error', { tempId, reason: 'save_failed' }); } catch (_) {}
    }
  });
};
