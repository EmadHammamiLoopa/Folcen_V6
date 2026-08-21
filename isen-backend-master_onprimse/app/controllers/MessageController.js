const { response } = require('express');
const mongoose = require('mongoose');
const { setOnlineUsers, connectedUsers } = require('../helpers');
const { userSubscribed } = require('../middlewares/subscription');
const Message = require('../models/Message');
const User = require('../models/User');
const Follow = require('../models/Follow');
const Response = require('./Response');
const helpers = require('../helpers');          // path to helpers/index.js
const logger = require('../utils/logger');

function normalizeImagePayload(image) {
    if (!image) return null;
    if (typeof image === 'object' && image.path) return image;
    if (typeof image !== 'string') return null;
    if (!image.startsWith('http')) return null;

    const lower = image.toLowerCase();
    const type = lower.endsWith('.jpg') || lower.endsWith('.jpeg') ? 'image/jpeg'
        : lower.endsWith('.png') ? 'image/png'
        : lower.endsWith('.gif') ? 'image/gif'
        : 'application/octet-stream';
    return { path: image, type };
}

function messagePayload(savedMessage, tempId, delivery) {
    return {
        _id: String(savedMessage._id),
        id: String(savedMessage._id),
        text: savedMessage.text,
        from: String(savedMessage.from),
        to: String(savedMessage.to),
        image: savedMessage.image || null,
        state: savedMessage.state || 'sent',
        type: savedMessage.type || 'friend',
        productId: savedMessage.productId ? String(savedMessage.productId) : null,
        status: savedMessage.status || null,
        createdAt: savedMessage.createdAt,
        tempId,
        delivery: delivery || 'sent'
    };
}

exports.storeMessage = async (req, res) => {
    const tempId = req.body?.tempId || req.body?.id || null;
    let openingReservationToken = null;
    let openingReservationTarget = null;
    let messagePersisted = false;

    try {
        const senderId = req.auth && req.auth._id;
        const recipientId = req.body?.to || req.body?._to;
        const text = typeof req.body?.text === 'string' ? req.body.text : '';
        const image = normalizeImagePayload(req.body?.image);
        const messageType = req.body?.type || 'friend';
        const isNormalMessage = messageType !== 'video-call-request';

        if (!senderId) return Response.sendError(res, 401, 'Unauthorized');
        if (!mongoose.Types.ObjectId.isValid(recipientId)) {
            return Response.sendError(res, 400, 'Unable to identify recipient');
        }
        if (!text.trim() && !image) {
            return Response.sendError(res, 400, 'Message is empty');
        }

        const [sender, receiver] = await Promise.all([
            User.findById(senderId).select('firstName lastName blockedUsers friends'),
            User.findById(recipientId).select('blockedUsers friends isPrivate')
        ]);

        if (!sender || !receiver) {
            return Response.sendError(res, 404, 'Recipient account is unavailable');
        }

        const isBlockedByReceiver = receiver.blockedUsers && receiver.blockedUsers.some(id => String(id) === String(senderId));
        const isBlockedBySender = sender.blockedUsers && sender.blockedUsers.some(id => String(id) === String(recipientId));
        if (isBlockedByReceiver || isBlockedBySender) {
            return Response.sendError(res, 403, 'You can no longer message this user');
        }

        const chatPolicy =
            await (
                isNormalMessage
                    ? helpers.canInitiateChat(senderId, recipientId)
                    : helpers.canInitiateChatPreview(senderId, recipientId)
            );

        openingReservationToken =
            chatPolicy.openingReservationToken || null;
        openingReservationTarget = openingReservationToken
            ? { senderId, recipientId }
            : null;

        if (!chatPolicy.allowed) {
            const status =
                chatPolicy.reason === 'budget_exhausted'
                    ? 429
                    : 403;

            const reasonMessage = {
                awaiting_reply:
                    'Please wait for this user to reply before sending another message.',
                budget_exhausted:
                    'You have reached today\'s new non-friend chat limit.',
                blocked:
                    'You can no longer message this user.',
                user_not_found:
                    'Recipient account is unavailable.'
            };

            return Response.sendError(
                res,
                status,
                reasonMessage[chatPolicy.reason] ||
                    'Chat is not available.'
            );
        }

        const savedMessage = await Message.create({
            text,
            from: new mongoose.Types.ObjectId(senderId),
            to: new mongoose.Types.ObjectId(recipientId),
            image,
            state: 'sent',
            type: messageType,
            productId: mongoose.Types.ObjectId.isValid(req.body?.productId) ? req.body.productId : null,
        });
        messagePersisted = true;

        if (openingReservationToken) {
            try {
                await helpers.finalizeChatOpeningReservation(
                    senderId,
                    recipientId,
                    openingReservationToken,
                    savedMessage.createdAt
                );
            } catch (reservationErr) {
                // The message is already durable. Keep the reservation
                // conservative rather than turning bookkeeping failure into a
                // second opener opportunity.
                logger.warn(
                    '[message.store] opener reservation finalize failed:',
                    reservationErr.message
                );
            }
        }

        await Promise.all([
            User.findByIdAndUpdate(senderId, { $addToSet: { messages: savedMessage._id } }),
            User.findByIdAndUpdate(recipientId, { $addToSet: { messages: savedMessage._id } }),
        ]);

        const safePayload = messagePayload(savedMessage, tempId);
        const delivered = await helpers.emitToUser(recipientId, 'new-message', safePayload);
        // Android may keep Socket.IO connected while the app is backgrounded.
        // A persisted normal chat message therefore always gets one FCM push.
        try {
            const senderName =
                `${sender.firstName || ''} ${sender.lastName || ''}`
                    .trim() ||
                'New message';

            const preview =
                text
                    ? text.substring(0, 100)
                    : (
                        image?.type &&
                        String(image.type).startsWith('video/')
                            ? 'Video'
                            : 'Image'
                      );

            helpers
                .sendNotification(
                    [String(recipientId)],
                    preview,
                    senderName,
                    String(senderId)
                )
                .catch(err => {
                    logger.warn(
                        '[message.store] push failed:',
                        err.message
                    );
                });

        } catch (pushErr) {
            logger.warn(
                '[message.store] push setup failed:',
                pushErr.message
            );
        }


        return Response.sendResponse(res, messagePayload(savedMessage, tempId, delivered ? 'delivered' : 'sent'));
    } catch (error) {
        if (
            openingReservationToken &&
            openingReservationTarget &&
            !messagePersisted
        ) {
            try {
                await helpers.releaseChatOpeningReservation(
                    openingReservationTarget.senderId,
                    openingReservationTarget.recipientId,
                    openingReservationToken
                );
            } catch (releaseErr) {
                logger.warn(
                    '[message.store] opener reservation release failed:',
                    releaseErr.message
                );
            }
        }

        logger.error('storeMessage error:', error);
        return Response.sendError(res, 500, 'Message could not be saved. Please try again.');
    }
};

exports.indexMessages = async (req, res) => {
    const limit = 20;

    const page =
        Math.max(
            0,
            +req.query.page || 0
        );

    try {
        const authUserId =
            new mongoose.Types.ObjectId(
                req.auth._id
            );

        const userId =
            new mongoose.Types.ObjectId(
                req.params.userId
            );

        const filter = {
            $or: [
                {
                    from: authUserId,
                    to: userId
                },
                {
                    from: userId,
                    to: authUserId
                }
            ]
        };

        const rowsPromise =
            Message.find(filter)
                .sort({
                    createdAt: -1
                })
                .skip(
                    limit * page
                )
                .limit(
                    limit + 1
                )
                .lean();

        // Chat permission is only consumed by the initial page.
        // Infinite-scroll history pages do not need the extra DB reads.
        const policyPromise =
            page === 0
                ? helpers.canInitiateChatPreview(
                    authUserId,
                    userId
                )
                : Promise.resolve(null);

        const [
            rows,
            check
        ] = await Promise.all([
            rowsPromise,
            policyPromise
        ]);

        const more =
            rows.length > limit;

        const messages =
            more
                ? rows.slice(0, limit)
                : rows;

        const payload = {
            messages,
            more
        };

        if (page === 0 && check) {
            payload.allowToChat =
                !!check.allowed;

            payload.chatReason =
                check.reason || null;

            payload.budgetRemaining =
                check.budgetRemaining;
        }

        return Response.sendResponse(
            res,
            payload
        );

    } catch (error) {
        logger.error(
            'Error fetching messages:',
            error
        );

        return Response.sendError(
            res,
            400,
            'Failed to fetch messages'
        );
    }
};

exports.getUsersMessages = async (req, res) => {
  try {
    const limit = 20;
    const page  = req.query.page ? +req.query.page : 0;
    const authId = new mongoose.Types.ObjectId(req.authUser._id);
    const authIdStr = String(req.authUser._id);
    const blocked = (req.authUser.blockedUsers || []).map(id => String(id));

    // 1) Optimized High-Throughput Aggregation (API Efficiency & Database Access)
    const usersWithMessages = await Message.aggregate([
      // Stage 1: Initial filtering (Handle both ObjectId and String storage)
      { $match: { 
          $or: [ 
            { from: authId }, { to: authId },
            { from: authIdStr }, { to: authIdStr }
          ] 
      } },
      
      // Stage 2: Identify Peer and sort by age
      { $sort: { createdAt: -1 } },
      { $project: {
          createdAt: 1,
          text: 1,
          from: 1,
          to: 1,
          type: 1,
          productId: 1, // Capture productId for frontend
          // Peer identification comparing strings to be safe
          peerId: { $cond: [ 
              { $eq: [{ $toString: '$from' }, authIdStr] }, 
              '$to', 
              '$from' 
          ] }
        }
      },
      
      // Stage 3: Group by peer to get 'lastMessage'
      { $group: {
          _id: '$peerId',
          lastMessageAt: { $first: '$createdAt' },
          lastMessage: { $first: '$$ROOT' } 
        }
      },
      
      // Stage 4: Fetch Peer Metadata
      { $lookup: { 
          from: 'users', 
          let: { peerId: '$_id' },
          pipeline: [
            { $match: { $expr: { $or: [
                { $eq: ['$_id', '$$peerId'] },
                { $eq: [{ $toString: '$_id' }, { $toString: '$$peerId' }] }
            ] } } },
            { $project: { firstName: 1, lastName: 1, mainAvatar: 1, avatarStyle: 1, avatarSeed: 1, deletedAt: 1, blockedUsers: 1, enabled: 1 } }
          ],
          as: 'peerInfo' 
      }},
      { $unwind: { path: '$peerInfo', preserveNullAndEmptyArrays: true } },
      
      // Stage 5: Security & Lifecycle Filter (Privacy Hardening)
      // peerInfo may be null when preserveNullAndEmptyArrays is true (e.g. system user),
      // so we only enforce lifecycle/block filters when peerInfo exists.
      { $match: {
          $or: [
            { peerInfo: null },
            {
              'peerInfo.deletedAt': null,
              'peerInfo.enabled': { $ne: false },
              'peerInfo.blockedUsers': { $ne: authId }
            }
          ],
          // Filter out users I have blocked (always applies)
          '_id': { $nin: (req.authUser.blockedUsers || []) },
        }
      },
      
      // Stage 6: Sorting & Pagination
      { $sort: { lastMessageAt: -1 } },
      { $skip: limit * page },
      { $limit: limit },
      
      // Stage 7: Clean Object Construction
      { $project: {
          _id: { $toString: '$_id' },
          firstName: { $ifNull: ['$peerInfo.firstName', 'Folcen'] },
          lastName: { $ifNull: ['$peerInfo.lastName', 'Team'] },
          mainAvatar: '$peerInfo.mainAvatar',
          avatarStyle: '$peerInfo.avatarStyle',
          avatarSeed: '$peerInfo.avatarSeed',
          messages: [{
            text: '$lastMessage.text',
            createdAt: '$lastMessage.createdAt',
            from: { $toString: '$lastMessage.from' },
            to: { $toString: '$lastMessage.to' },
            type: '$lastMessage.type',
            productId: '$lastMessage.productId'
          }]
        }
      }
    ]);

    // Simple "more" estimation based on limit
    const more = usersWithMessages.length === limit;

    return Response.sendResponse(res, { users: usersWithMessages, more });
  } catch (err) {
    logger.error('Error fetching users messages:', err);
    return Response.sendError(res, 500, 'Internal server error');
  }
};



exports.deleteMessage = async (req, res) => {
    const messageId = req.params.messageId;

    try {
        // Find the message by ID and ensure it belongs to the authenticated user or the recipient
        const message = await Message.findOne({
            _id: messageId,
            $or: [
                { from: req.auth._id },
                { to: req.auth._id }
            ]
        });

        if (!message) {
            return Response.sendError(res, 404, 'Message not found or you do not have permission to delete this message');
        }

        // Delete the message
        await Message.deleteOne({ _id: messageId });

        // Opener leases are retained for the rolling recipient-budget window.
        // If the only normal message in this direction is deleted, release
        // that pair so deletion preserves the historical retry behavior.
        if (message.type !== 'video-call-request') {
            try {
                const stillHasNormalMessage = await Message.exists({
                    from: message.from,
                    to: message.to,
                    type: { $ne: 'video-call-request' }
                });
                if (!stillHasNormalMessage) {
                    await helpers.releaseChatOpeningPair(message.from, message.to);
                }
            } catch (leaseErr) {
                // The message is already deleted. Reservation reconciliation is
                // best-effort here and must not turn a successful delete into a
                // misleading 500 response. Any stale lease is also bounded by
                // request-time recovery in the reservation service.
                logger.warn('deleteMessage opener lease reconciliation failed:', leaseErr);
            }
        }

        return Response.sendResponse(res, { success: true, message: 'Message deleted successfully' });
    } catch (error) {
        logger.error('Error deleting message:', error);
        return Response.sendError(res, 500, 'Failed to delete message');
    }
};


exports.sendMessagePermission = async (req, res) => {
    try {
        const targetId = req.params.userId || req.body.to;
        const authId = req.auth._id;

        const check = await helpers.canInitiateChatPreview(authId, targetId);

        return Response.sendResponse(res, check.allowed, check.allowed ? 'Allowed' : check.reason);
    } catch (error) {
        logger.error('sendMessagePermission error:', error);
        return Response.sendError(res, 500, 'Server error');
    }
};
