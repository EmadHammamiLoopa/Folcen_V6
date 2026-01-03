const mongoose = require("mongoose");
const { sendNotification, emitNewFriendRequest, emitFriendRequestsUpdated, emitFriendRequestAccepted, emitFriendRequestDeclined } = require("../helpers");
const Request = require("../models/Request");
const User = require("../models/User");
const Response = require("./Response");

/**
 * Create a friend request from req.auth._id → req.user._id (or body.to)
 * Requires an auth middleware that sets req.auth and a resolver that sets req.user (target).
 */
exports.storeRequest = async (req, res) => {
  console.log('ENTER storeRequest', { path: req.path, params: req.params, authId: req.auth && req.auth._id });
  try {
    const fromId = String(req.auth?._id || "");
    const toId   = String(req.user?._id || req.body?.to || "");

    if (!fromId || !toId || !mongoose.Types.ObjectId.isValid(fromId) || !mongoose.Types.ObjectId.isValid(toId)) {
      return Response.sendError(res, 400, "Invalid user id(s)");
    }
    if (fromId === toId) {
      return Response.sendError(res, 400, "You cannot send a request to yourself");
    }

    // Make sure both users exist
    const [fromUser, toUser] = await Promise.all([
      User.findById(fromId).select("_id firstName lastName blockedUsers"),
      User.findById(toId).select("_id firstName lastName blockedUsers"),
    ]);
    if (!fromUser || !toUser) {
      return Response.sendError(res, 404, "User not found");
    }

    // Check if blocked
    const isBlockedByTo = toUser.blockedUsers && toUser.blockedUsers.some(id => id.toString() === fromId);
    const isBlockedByFrom = fromUser.blockedUsers && fromUser.blockedUsers.some(id => id.toString() === toId);

    if (isBlockedByTo || isBlockedByFrom) {
      return Response.sendError(res, 403, "Cannot send request due to block relationship");
    }

    // Already friends?
    const alreadyFriends = await User.exists({ _id: fromId, friends: new mongoose.Types.ObjectId(toId) });
    if (alreadyFriends) {
      return Response.sendError(res, 409, "You are already friends");
    }

    // Existing pending request in either direction?
    const existing = await Request.findOne({
      accepted: false,
      $or: [
        { from: new mongoose.Types.ObjectId(fromId), to: new mongoose.Types.ObjectId(toId) },
        { from: new mongoose.Types.ObjectId(toId),   to: new mongoose.Types.ObjectId(fromId) },
      ],
    }).select("_id");
    if (existing) {
      return Response.sendError(res, 409, "A pending request already exists");
    }

    // Create request
    const doc = await new Request({
      from: new mongoose.Types.ObjectId(fromId),
      to  : new mongoose.Types.ObjectId(toId),
      accepted: false,
    }).save();

    // Track on each user (optional; safe/no-dup)
    await Promise.all([
      User.updateOne({ _id: fromId }, { $addToSet: { requests: doc._id } }),
      User.updateOne({ _id: toId   }, { $addToSet: { requests: doc._id } }),
    ]);

    // 🔔 Push + Socket events
    const senderName = `${fromUser.firstName || ""} ${fromUser.lastName || ""}`.trim() || "Someone";
    sendNotification([toId], "sent you a friendship request", senderName, fromId).catch(console.error);
    emitNewFriendRequest(toId, fromId);

    return Response.sendResponse(res, { request: doc }, "Friendship request sent");
  } catch (err) {
    console.error("storeRequest error:", err);
    return Response.sendError(res, 500, "Failed to store request");
  }
};

/**
 * List incoming requests for the authenticated user
 * GET /request?&page=0
 */
exports.requests = async (req, res) => {
  try {
    const authId = String(req.auth?._id || "");
    if (!authId || !mongoose.Types.ObjectId.isValid(authId)) {
      return Response.sendError(res, 400, "Invalid user id");
    }

    const limit = 20;
    const page = Number.isFinite(+req.query.page) ? +req.query.page : 0;

    const items = await Request.find({
      to: new mongoose.Types.ObjectId(authId),
      accepted: false,
    })
      .populate("from", {
        firstName : 1,
        lastName  : 1,
        avatar    : 1,
        mainAvatar: 1,
        avatarStyle: 1,
        avatarSeed: 1,
        avatarVariant: 1,
        avatarOverrides: 1,
        city: 1,
        country: 1,
      }, "User")
      .select({ from: 1, createdAt: 1 })
      .sort({ createdAt: -1 })
      .skip(limit * page)
      .limit(limit);

    return Response.sendResponse(res, items);
  } catch (err) {
    console.error("requests error:", err);
    return Response.sendError(res, 400, "Failed to fetch requests.");
  }
};

/**
 * Accept a pending request and make both users friends
 * POST /request/:id/accept    (or :requestId/accept)
 */
exports.acceptRequest = async (req, res) => {
  try {
    const id = req.params.requestId || req.params.id;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return Response.sendError(res, 400, "Invalid request ID");
    }

    // Load request with from/to
    const reqDoc = await Request.findById(id);
    if (!reqDoc) return Response.sendError(res, 404, "Request not found");

    const fromId = String(reqDoc.from);
    const toId   = String(reqDoc.to);

    // Check if blocked
    const [fromUser, toUser] = await Promise.all([
      User.findById(fromId).select("blockedUsers"),
      User.findById(toId).select("blockedUsers"),
    ]);

    if ((fromUser?.blockedUsers && fromUser.blockedUsers.some(id => id.toString() === toId)) || 
        (toUser?.blockedUsers && toUser.blockedUsers.some(id => id.toString() === fromId))) {
      return Response.sendError(res, 403, "Cannot accept request due to block relationship");
    }

    // Add each other to friends (idempotent)
    await Promise.all([
      User.updateOne({ _id: fromId }, { $addToSet: { friends: new mongoose.Types.ObjectId(toId) } }),
      User.updateOne({ _id: toId   }, { $addToSet: { friends: new mongoose.Types.ObjectId(fromId) } }),
    ]);

    // Remove request + clean from users
    await Promise.all([
      Request.deleteOne({ _id: id }),
      User.updateOne({ _id: fromId }, { $pull: { requests: new mongoose.Types.ObjectId(id) } }),
      User.updateOne({ _id: toId   }, { $pull: { requests: new mongoose.Types.ObjectId(id) } }),
    ]);

    // Notify sender that it was accepted
    const authUser = await User.findById(req.auth._id).select("firstName lastName");
    const acceptorName = `${authUser?.firstName || ""} ${authUser?.lastName || ""}`.trim() || "Someone";
    sendNotification([fromId], "accepted your friendship request", acceptorName, String(req.auth._id)).catch(console.error);

    // 🔁 Ask both sides to refresh counters precisely
    emitFriendRequestsUpdated(fromId, toId);
    emitFriendRequestAccepted(fromId, toId);

    return Response.sendResponse(res, true, "Friendship request accepted");
  } catch (err) {
    console.error("acceptRequest error:", err);
    return Response.sendError(res, 500, "Server error");
  }
};

/**
 * Reject a request (remove it; does not add friendship)
 * POST /request/:id/reject
 */
exports.rejectRequest = async (req, res) => {
  try {
    const id = req.params.requestId || req.params.id;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return Response.sendError(res, 400, "Invalid request ID");
    }

    const reqDoc = await Request.findById(id);
    if (!reqDoc) return Response.sendError(res, 404, "Request not found");

    const fromId = String(reqDoc.from);
    const toId   = String(reqDoc.to);

    await Promise.all([
      Request.deleteOne({ _id: id }),
      User.updateOne({ _id: fromId }, { $pull: { requests: new mongoose.Types.ObjectId(id) } }),
      User.updateOne({ _id: toId   }, { $pull: { requests: new mongoose.Types.ObjectId(id) } }),
    ]);

    // 🔁 precise recount for both users
    emitFriendRequestsUpdated(fromId, toId);
    emitFriendRequestDeclined(fromId, toId);

    return Response.sendResponse(res, true, "Request rejected");
  } catch (err) {
    console.error("rejectRequest error:", err);
    return Response.sendError(res, 500, "Server error");
  }
};

/**
 * Cancel a request (by the sender) – equivalent to deleting the pending request
 * POST /request/:id/cancel     (or :requestId/cancel)
 */
exports.cancelRequest = async (req, res) => {
  try {
    const id = req.params.requestId || req.params.id;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return Response.sendError(res, 400, "Invalid request ID format");
    }

    const reqDoc = await Request.findById(id);
    if (!reqDoc) {
      return Response.sendError(res, 404, "Request not found");
    }

    const fromId = String(reqDoc.from);
    const toId   = String(reqDoc.to);

    await Promise.all([
      Request.deleteOne({ _id: id }),
      User.updateOne({ _id: fromId }, { $pull: { requests: new mongoose.Types.ObjectId(id) } }),
      User.updateOne({ _id: toId   }, { $pull: { requests: new mongoose.Types.ObjectId(id) } }),
    ]);

    // 🔁 precise recount for both users
    emitFriendRequestsUpdated(fromId, toId);
    emitFriendRequestDeclined(fromId, toId); // Treat cancel as a decline for UI refresh purposes

    return Response.sendResponse(res, true, "Request canceled successfully");
  } catch (err) {
    console.error("cancelRequest error:", err);
    return Response.sendError(res, 500, "Server error while canceling the request");
  }
};
