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
    if (!callerId) { if (ack) ack({ success: false, error: 'not_authenticated' }); return; }
    if (!mongoose.Types.ObjectId.isValid(data?.to)) {
      if (ack) ack({ success: false, error: 'invalid_recipient' });
      return;
    }

    const [caller, receiver] = await Promise.all([
      User.findById(callerId).select('friends firstName lastName').lean(),
      User.findById(data.to).select('friends firstName lastName allowVideoRequestsFromNonFriends').lean()
    ]);
    if (!receiver) {
      if (ack) ack({ success: false, error: 'recipient_not_found' });
      return;
    }
    const isFriend =
      (caller?.friends || []).some(id => String(id) === String(data.to)) ||
      (receiver?.friends || []).some(id => String(id) === String(callerId));
    if (!isFriend && receiver.allowVideoRequestsFromNonFriends === false) {
      if (ack) ack({ success: false, error: 'video_requests_disabled' });
      return;
    }

    // Cancel any previous pending requests in this thread
    await Message.updateMany(
      { from: { $in: [callerId, data.to] }, to: { $in: [callerId, data.to] }, type: "video-call-request", status: "pending" },
      { $set: { status: "cancelled" } }
    );

    const payload = {
      text: data.text,
      from: new mongoose.Types.ObjectId(callerId),
      to: new mongoose.Types.ObjectId(data.to),
      type: "video-call-request",
      status: "pending",
      state: "sent",
      createdAt: new Date()
    };

    const message = new Message(payload);
    const saved = await message.save();

    await Promise.all([
      User.findByIdAndUpdate(callerId, { $push: { messages: saved._id } }),
      User.findByIdAndUpdate(data.to, { $push: { messages: saved._id } }),
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

    emitToUser(data.to,   "new-message",   safeCallPayload);
    emitToUser(callerId,  "message-sent",  { ...safeCallPayload, tempId: data.messageId });
    const callerName = [caller?.firstName, caller?.lastName].filter(Boolean).join(" ") || "Someone";
    sendPushToUser(String(data.to), {
      title: "Video request",
      body: `${callerName} sent you a one-time video request`,
      data: {
        ...safeCallPayload,
        type: "video-call-request",
        category: "message",
        event: "video-call-request",
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
      console.log(`[chat] video request push to ${data.to}:`, result);
    }).catch(err => console.warn("[chat] video request push failed:", err.message));

    if (ack) ack({ success: true, messageId: saved._id });
  } catch (err) {
    console.error("❌ Error in video-call-request:", err);
    if (ack) ack({ success: false, error: err.message });
  }
});



// Video call accepted
// Video call accepted
// Video call accepted
socket.on("video-call-accepted", async (data) => {
  try {
    // 🛑 Ignore if client sent a temp id
    if (!mongoose.Types.ObjectId.isValid(data.messageId)) {
      console.warn("⚠️ Ignoring invalid messageId:", data.messageId);
      return;
    }

    const msg = await Message.findByIdAndUpdate(
      data.messageId,
      { status: "accepted" },
      { new: true }
    );

    if (!msg) return;

    emitToUser(data.to, "video-call-accepted", { messageId: msg.id, status: "accepted" });
    emitToUser(data.from, "video-call-accepted", { messageId: msg.id, status: "accepted" });
    User.findById(data.from).select("firstName lastName").lean().then(accepter => {
      const accepterName = [accepter?.firstName, accepter?.lastName].filter(Boolean).join(" ") || "Your video request";
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
  } catch (err) {
    console.error("❌ Error in video-call-accepted:", err);
  }
});

socket.on("video-call-used", async (data) => {
  try {
    const authUser = socket.userId;
    if (!authUser || !mongoose.Types.ObjectId.isValid(data?.messageId)) return;

    const msg = await Message.findOneAndUpdate(
      {
        _id: data.messageId,
        type: "video-call-request",
        status: "accepted",
        $or: [{ from: authUser }, { to: authUser }]
      },
      { status: "used" },
      { new: true }
    );
    if (!msg) return;

    const payload = { messageId: msg.id, status: "used" };
    emitToUser(String(msg.from), "video-call-used", payload);
    emitToUser(String(msg.to), "video-call-used", payload);
  } catch (err) {
    console.error("Error in video-call-used:", err);
  }
});

// Video call cancelled
socket.on("video-call-cancelled", async (data) => {
  try {
    let msg = null;
    const requestedStatus = ['cancelled', 'rejected', 'expired'].includes(String(data?.status))
      ? String(data.status)
      : (String(data?.reason) === 'rejected' ? 'rejected' : String(data?.reason) === 'timeout' ? 'expired' : 'cancelled');
    const reason = requestedStatus === 'rejected' ? 'rejected' : requestedStatus === 'expired' ? 'timeout' : 'cancel';

    if (mongoose.Types.ObjectId.isValid(data.messageId)) {
      // normal path: real id
      msg = await Message.findByIdAndUpdate(
        data.messageId,
        { status: requestedStatus },
        { new: true }
      );
    }

    if (!msg) {
      // fallback: cancel the latest pending call between these two users
      msg = await Message.findOneAndUpdate(
        {
          from: { $in: [data.from, data.to] },
          to:   { $in: [data.from, data.to] },
          type: "video-call-request",
          status: "pending",
        },
        { $set: { status: requestedStatus } },
        { sort: { createdAt: -1 }, new: true }
      );
      if (!msg) return; // nothing to cancel
    }

  emitToUser(data.to,   "video-call-cancelled", { messageId: msg.id, status: requestedStatus, reason });
  emitToUser(data.from, "video-call-cancelled", { messageId: msg.id, status: requestedStatus, reason });

  // Canonical real-time signaling so video UI reliably tears down
  const now = Date.now();
  const canonical = { from: data.from, to: data.to, messageId: msg.id, reason, status: requestedStatus, at: now };
  // Notify callee so they can register a missed call and close UI
  emitToUser(data.to, 'video-canceled', { ...canonical, notify: true });
  // Notify caller for local cleanup only (no missed call)
  emitToUser(data.from, 'video-canceled', { ...canonical, notify: false });
  } catch (err) {
    console.error("❌ Error in video-call-cancelled:", err);
  }
});


socket.on("leave-chat", async ({ withUser }) => {
  try {
    if (!socket.userId || !mongoose.Types.ObjectId.isValid(withUser)) return;

    await Message.updateMany(
      {
        from: { $in: [socket.userId, withUser] },
        to:   { $in: [socket.userId, withUser] },
        type: "video-call-request",
        status: "pending",
      },
      { $set: { status: "cancelled" } }
    );

    emitToUser(withUser,   "video-session-reset", { by: socket.userId });
    emitToUser(socket.userId, "video-session-reset", { by: socket.userId });
  } catch (e) {
    console.error("leave-chat failed", e);
  }
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
