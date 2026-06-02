const { response } = require('express');
const mongoose = require('mongoose');
const { setOnlineUsers, connectedUsers } = require('../helpers');
const { userSubscribed } = require('../middlewares/subscription');
const Message = require('../models/Message');
const User = require('../models/User');
const Response = require('./Response');
const helpers = require('../helpers');          // path to helpers/index.js
const logger = require('../utils/logger');

exports.indexMessages = async (req, res) => {
    logger.info("hereeeeeeeeeeeeeeeeeeeee");

    const limit = 20;
    const page = +req.query.page || 0;
    const authUserId = new mongoose.Types.ObjectId(req.auth._id);
    const userId = new mongoose.Types.ObjectId(req.params.userId);

    const filter = {
        $or: [
            { from: authUserId, to: userId },
            { from: userId, to: authUserId }
        ]
    };

    logger.info('Message filter:', JSON.stringify(filter, null, 2)); // Log the filter

    try {
        const messages = await Message.find(filter)
            .sort({ createdAt: -1 })
            .skip(limit * page)
            .limit(limit);

        logger.info('Messages found:', messages); // Log the messages

        const count = await Message.countDocuments(filter);
        
        // Task 1: Use shared policy for initial state
        const check = await helpers.canInitiateChat(authUserId, userId);
        const allowToChat = check.allowed;
        const budgetRemaining = check.budgetRemaining;
    

            messages.forEach((msg, i) => {
              logger.info(`📥 [${i}] Image path:`, msg.image?.path || null);
            });

            
        return Response.sendResponse(res, {
            messages,
            more: (count - (limit * (page + 1))) > 0,
            allowToChat,
            budgetRemaining
        });
    } catch (error) {
        logger.error('Error fetching messages:', error); // Log the error
        return Response.sendError(res, 400, 'Failed to fetch messages');
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

        const check = await helpers.canInitiateChat(authId, targetId);

        return Response.sendResponse(res, check.allowed, check.allowed ? 'Allowed' : check.reason);
    } catch (error) {
        logger.error('sendMessagePermission error:', error);
        return Response.sendError(res, 500, 'Server error');
    }
};

