const { response } = require('express');
const mongoose = require('mongoose');
const { setOnlineUsers, connectedUsers } = require('../helpers');
const { userSubscribed } = require('../middlewares/subscription');
const Message = require('../models/Message');
const User = require('../models/User');
const Response = require('./Response');
const helpers = require('../helpers');          // path to helpers/index.js

exports.indexMessages = async (req, res) => {
    console.log("hereeeeeeeeeeeeeeeeeeeee");

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

    console.log('Message filter:', JSON.stringify(filter, null, 2)); // Log the filter

    try {
        const messages = await Message.find(filter)
            .sort({ createdAt: -1 })
            .skip(limit * page)
            .limit(limit);

        console.log('Messages found:', messages); // Log the messages

        const count = await Message.countDocuments(filter);
        const allowToChat =
        req.authUser?.friends?.map(id => id.toString()).includes(userId.toString()) ||
        (await Message.countDocuments({ from: userId, to: authUserId })) > 0;
    

            messages.forEach((msg, i) => {
              console.log(`📥 [${i}] Image path:`, msg.image?.path || null);
            });

            
        return Response.sendResponse(res, {
            messages,
            more: (count - (limit * (page + 1))) > 0,
            allowToChat
        });
    } catch (error) {
        console.error('Error fetching messages:', error); // Log the error
        return Response.sendError(res, 400, 'Failed to fetch messages');
    }
};

exports.getUsersMessages = async (req, res) => {
  try {
    const limit = 20;
    const page  = req.query.page ? +req.query.page : 0;

    const authId   = new mongoose.Types.ObjectId(req.authUser._id);
    const blocked  = req.authUser.blockedUsers || [];

    // 1) Get distinct peers you've exchanged messages with, newest first
    const peersPage = await Message.aggregate([
      { $match: { $or: [ { from: authId }, { to: authId } ] } },
      { $project: {
          createdAt: 1,
          peerId: { $cond: [ { $eq: ['$from', authId] }, '$to', '$from' ] }
        }
      },
      { $sort: { createdAt: -1 } },
      { $group: {
          _id: '$peerId',
          lastMessageAt: { $first: '$createdAt' }
        }
      },
      // filter out blocked/soft-deleted here with a $lookup to users
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $match: {
          'user.deletedAt': null,
          '_id': { $nin: blocked },
          'user.blockedUsers': { $ne: authId }
        }
      },
      { $sort: { lastMessageAt: -1 } },
      { $skip: limit * page },
      { $limit: limit }
    ]);

    // 2) Fetch messages for each peer (newest first) and shape the response
    const usersWithMessages = await Promise.all(
      peersPage.map(async ({ _id: peerId, user }) => {
        const messages = await Message.find({
          $or: [
            { from: peerId, to: authId },
            { from: authId, to: peerId }
          ]
        }).sort({ createdAt: -1 });

        return {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          avatar: user.avatar,
          mainAvatar: user.mainAvatar,
          messages
        };
      })
    );

    // 3) Compute total number of distinct peers for pagination
    const totalPeersAgg = await Message.aggregate([
      { $match: { $or: [ { from: authId }, { to: authId } ] } },
      { $project: { peerId: { $cond: [ { $eq: ['$from', authId] }, '$to', '$from' ] } } },
      { $group: { _id: '$peerId' } },
      { $count: 'count' }
    ]);
    const total = totalPeersAgg?.[0]?.count || 0;

    const more = total - limit * (page + 1) > 0;

    return Response.sendResponse(res, { users: usersWithMessages, more });
  } catch (err) {
    console.error('Error fetching users messages:', err);
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
        console.error('Error deleting message:', error);
        return Response.sendError(res, 500, 'Failed to delete message');
    }
};


exports.sendMessagePermission = async (req, res) => {
    try {
        const now = new Date();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const user = req.user;
        const authUser = req.authUser;

        if (authUser.friends && authUser.friends.includes(user._id)) {
            return Response.sendResponse(res, true);
        }

        const messages = await Message.find({
            from: req.auth._id,
            createdAt: {
                $lt: now.toISOString(),
                $gt: yesterday.toISOString()
            },
            to: {
                $nin: req.authUser.friends
            }
        }).distinct('to');

        console.log(messages);

        if (!await userSubscribed(req.authUser) && messages.length > 3) {
            return Response.sendResponse(res, false);
        } else {
            return Response.sendResponse(res, true);
        }
    } catch (error) {
        console.log(error);
        return Response.sendError(res, 500, 'Server error');
    }
};

