const Follow = require('../models/Follow');
const User = require('../models/User');
const Response = require('./Response');
const { sendNotification, emitToUser } = require('../helpers');
const mongoose = require('mongoose');

/**
 * Fetch live follow statistics for a user to attach to socket events.
 * Pulls counts directly from the User document arrays + pending Follow records.
 */
async function getUserStats(userId) {
    const [user, pendingCount] = await Promise.all([
        User.findById(userId).select('followers following friends').lean(),
        Follow.countDocuments({ followed: userId, status: 'pending' })
    ]);
    return {
        followers: user?.followers?.length || 0,
        following: user?.following?.length || 0,
        friends:   user?.friends?.length   || 0,
        pendingFollowRequests: pendingCount
    };
}

/**
 * ✅ Follow a user
 * Supports private profiles (pending status)
 */
exports.followUser = async (req, res) => {
    const followerId = req.authUser._id;
    const followedId = req.params.userId;

    if (followerId.toString() === followedId.toString()) {
        return Response.sendError(res, 400, 'You cannot follow yourself');
    }

    try {
        const targetUser = await User.findById(followedId);
        if (!targetUser) {
            return Response.sendError(res, 404, 'User not found');
        }

        // Check if blocked
        const isBlockedByTarget = targetUser.blockedUsers && targetUser.blockedUsers.some(id => id.toString() === followerId.toString());
        const isBlockedByMe = req.authUser.blockedUsers && req.authUser.blockedUsers.some(id => id.toString() === followedId.toString());

        if (isBlockedByTarget || isBlockedByMe) {
            return Response.sendError(res, 403, 'Cannot follow due to block relationship');
        }

        // Friends receive each other's feed implicitly.
        // They must not also appear in Followers / Following.
        const alreadyFriends =
            (req.authUser.friends || []).some(
                id => String(id && id._id ? id._id : id) === String(followedId)
            ) ||
            (targetUser.friends || []).some(
                id => String(id && id._id ? id._id : id) === String(followerId)
            );

        if (alreadyFriends) {
            // Clean stale legacy overlap defensively.
            await Promise.all([
                Follow.deleteMany({
                    $or: [
                        { follower: followerId, followed: followedId },
                        { follower: followedId, followed: followerId }
                    ]
                }),
                User.findByIdAndUpdate(followerId, {
                    $pull: {
                        following: followedId,
                        followers: followedId
                    }
                }),
                User.findByIdAndUpdate(followedId, {
                    $pull: {
                        following: followerId,
                        followers: followerId
                    }
                })
            ]);

            return Response.sendResponse(
                res,
                {
                    status: 'friend',
                    implicitFollow: true
                },
                'Friends already receive each other in feed'
            );
        }

        // Check if already following or blocked
        const existingFollow = await Follow.findOne({ follower: followerId, followed: followedId });
        if (existingFollow) {
            if (existingFollow.status === 'active') {
                return Response.sendResponse(res, { status: 'active' }, 'Already following');
            }
            if (existingFollow.status === 'pending') {
                return Response.sendResponse(res, { status: 'pending' }, 'Follow request already pending');
            }
            if (existingFollow.status === 'blocked') {
                return Response.sendError(res, 403, 'You are blocked by this user');
            }
        }

        const status = targetUser.isPrivate ? 'pending' : 'active';
        
        const follow = await Follow.findOneAndUpdate(
            { follower: followerId, followed: followedId },
            { status },
            { upsert: true, new: true }
        );

        // Update User arrays for backward compatibility and performance
        if (status === 'active') {
            await User.findByIdAndUpdate(followerId, { $addToSet: { following: followedId } });
            await User.findByIdAndUpdate(followedId, { $addToSet: { followers: followerId } });
        }

        // Emit socket event AFTER array updates so stats reflect new counts
        const io = req.app.get('io');
        if (io) {
            try {
                const [actorStats, targetStats] = await Promise.all([
                    getUserStats(followerId),
                    getUserStats(followedId)
                ]);
                console.log('[FollowController] followUser emitting stats — actor:', JSON.stringify(actorStats), 'target:', JSON.stringify(targetStats));
                const followPayload = { followerId, followedId, status, at: new Date(), actorStatistics: actorStats, targetStatistics: targetStats };
                emitToUser(String(followerId), 'follow-update', followPayload);
                emitToUser(String(followedId), 'follow-update', followPayload);
            } catch (statsErr) {
                console.error('[FollowController] getUserStats failed, emitting without stats:', statsErr);
                const fallbackPayload = { followerId, followedId, status, at: new Date() };
                emitToUser(String(followerId), 'follow-update', fallbackPayload);
                emitToUser(String(followedId), 'follow-update', fallbackPayload);
            }
        } else {
            console.error('[FollowController] io is null/undefined — socket event NOT sent');
        }

        if (status === 'active') {
            sendNotification(
                { en: `${req.authUser.firstName} ${req.authUser.lastName}` },
                { en: 'started following you' },
                { type: 'follow-user', link: `/tabs/profile/display/${followerId}` },
                [],
                [followedId]
            );
        } else {
            sendNotification(
                { en: `${req.authUser.firstName} ${req.authUser.lastName}` },
                { en: 'sent you a follow request' },
                { type: 'follow-request', link: `/tabs/profile/display/${followerId}` },
                [],
                [followedId]
            );
        }

        return Response.sendResponse(res, { status }, status === 'active' ? 'Followed successfully' : 'Follow request sent');
    } catch (error) {
        console.error('Follow error:', error);
        return Response.sendError(res, 500, 'Server error');
    }
};

/**
 * ✅ Unfollow a user
 */
exports.unfollowUser = async (req, res) => {
    const followerId = req.authUser._id;
    const followedId = req.params.userId;

    try {
        const follow = await Follow.findOneAndDelete({ follower: followerId, followed: followedId });
        
        if (follow) {
            await User.findByIdAndUpdate(followerId, { $pull: { following: followedId } });
            await User.findByIdAndUpdate(followedId, { $pull: { followers: followerId } });

            // Emit socket event AFTER array updates so stats are accurate
            const io = req.app.get('io');
            if (io) {
                const [actorStats, targetStats] = await Promise.all([
                    getUserStats(followerId),
                    getUserStats(followedId)
                ]);
                const unfollowPayload = { followerId, followedId, status: 'unfollowed', at: new Date(), actorStatistics: actorStats, targetStatistics: targetStats };
                emitToUser(String(followerId), 'follow-update', unfollowPayload);
                emitToUser(String(followedId), 'follow-update', unfollowPayload);
            }
        }

        return Response.sendResponse(res, null, 'Unfollowed successfully');
    } catch (error) {
        console.error('Unfollow error:', error);
        return Response.sendError(res, 500, 'Server error');
    }
};

/**
 * ✅ Remove a follower (for the followed user)
 */
/**
 * ✅ Accept/Reject follow request
 */
exports.handleFollowRequest = async (req, res) => {
    const followedId = req.authUser._id;
    const followerId = req.params.userId;
    const { status } = req.body; // status: 'active' or 'rejected'

    try {
        if (status === 'active') {
            const follow = await Follow.findOneAndUpdate(
                { follower: followerId, followed: followedId, status: 'pending' },
                { status: 'active' },
                { new: true }
            );

            if (!follow) {
                return Response.sendError(res, 404, 'Follow request not found');
            }

            await User.findByIdAndUpdate(followerId, { $addToSet: { following: followedId } });
            await User.findByIdAndUpdate(followedId, { $addToSet: { followers: followerId } });

            // Emit socket event AFTER array updates so stats are accurate
            const io = req.app.get('io');
            if (io) {
                const [actorStats, targetStats] = await Promise.all([
                    getUserStats(followerId),
                    getUserStats(followedId)
                ]);
                const acceptPayload = { followerId, followedId, status: 'active', at: new Date(), actorStatistics: actorStats, targetStatistics: targetStats };
                emitToUser(String(followerId), 'follow-update', acceptPayload);
                emitToUser(String(followedId), 'follow-update', acceptPayload);
            }

            sendNotification(
                { en: `${req.authUser.firstName} ${req.authUser.lastName}` },
                { en: 'accepted your follow request' },
                { type: 'follow-accepted', link: `/tabs/profile/display/${followedId}` },
                [],
                [followerId]
            );

            return Response.sendResponse(res, null, 'Follow request accepted');
        } else {
            await Follow.findOneAndDelete({ follower: followerId, followed: followedId, status: 'pending' });
            return Response.sendResponse(res, null, 'Follow request rejected');
        }
    } catch (error) {
        console.error('Handle follow request error:', error);
        return Response.sendError(res, 500, 'Server error');
    }
};

/**
 * ✅ Remove a follower (Soft block)
 */
exports.removeFollower = async (req, res) => {
    const followedId = req.authUser._id;
    const followerId = req.params.userId;

    try {
        const follow = await Follow.findOneAndDelete({ follower: followerId, followed: followedId });
        
        if (follow) {
            await User.findByIdAndUpdate(followerId, { $pull: { following: followedId } });
            await User.findByIdAndUpdate(followedId, { $pull: { followers: followerId } });

            // Emit socket event AFTER array updates so stats are accurate
            const io = req.app.get('io');
            if (io) {
                const [actorStats, targetStats] = await Promise.all([
                    getUserStats(followerId),
                    getUserStats(followedId)
                ]);
                const removePayload = { followerId, followedId, status: 'removed', at: new Date(), actorStatistics: actorStats, targetStatistics: targetStats };
                emitToUser(String(followerId), 'follow-update', removePayload);
                emitToUser(String(followedId), 'follow-update', removePayload);
            }
        }

        return Response.sendResponse(res, null, 'Follower removed');
    } catch (error) {
        console.error('Remove follower error:', error);
        return Response.sendError(res, 500, 'Server error');
    }
};

/**
 * ✅ Block a user (Prevents following)
 */
exports.blockUser = async (req, res) => {
    const blockerId = req.authUser._id;
    const blockedId = req.params.userId;

    try {
        // 1. Update or create follow relationship as blocked
        await Follow.findOneAndUpdate(
            { follower: blockedId, followed: blockerId },
            { status: 'blocked' },
            { upsert: true }
        );

        // 2. Remove any existing follow from blocker to blocked
        await Follow.findOneAndDelete({ follower: blockerId, followed: blockedId });

        // 3. Update User arrays
        await User.findByIdAndUpdate(blockerId, { 
            $addToSet: { blockedUsers: blockedId },
            $pull: { following: blockedId, followers: blockedId, friends: blockedId }
        });
        await User.findByIdAndUpdate(blockedId, { 
            $pull: { following: blockerId, followers: blockerId, friends: blockerId }
        });

        // Emit socket event AFTER array updates so stats are accurate
        {
            const [actorStats, targetStats] = await Promise.all([
                getUserStats(blockerId),
                getUserStats(blockedId)
            ]);
            const blockPayload = { followerId: blockerId, followedId: blockedId, status: 'blocked', at: new Date(), actorStatistics: actorStats, targetStatistics: targetStats };
            emitToUser(String(blockerId), 'follow-update', blockPayload);
            emitToUser(String(blockedId), 'follow-update', blockPayload);
        }

        return Response.sendResponse(res, null, 'User blocked');
    } catch (error) {
        console.error('Block user error:', error);
        return Response.sendError(res, 500, 'Server error');
    }
};

/**
 * ✅ Get follow requests (for private profiles)
 */
exports.getFollowRequests = async (req, res) => {
    const userId = req.authUser._id;

    try {
        const requests = await Follow.find({ followed: userId, status: 'pending' })
            .populate('follower', 'firstName lastName mainAvatar aboutMe avatar avatarStyle avatarSeed avatarVariant avatarOverrides city country');

        return Response.sendResponse(res, requests);
    } catch (error) {
        console.error('Get follow requests error:', error);
        return Response.sendError(res, 500, 'Server error');
    }
};

/**
 * ✅ Get followers list
 */
exports.getFollowers = async (req, res) => {
    const userId = req.params.userId || req.authUser._id;
    const page = parseInt(req.query.page) || 0;
    const limit = parseInt(req.query.limit) || 20;

    // Restriction: User can only see their own followers list
    if (userId.toString() !== req.authUser._id.toString()) {
        return Response.sendError(res, 403, 'You are not authorized to view this list');
    }

    try {
        // Get blocked users (both ways)
        const blockedByMe = req.authUser.blockedUsers || [];
        const blockedMe = await User.find({ blockedUsers: req.authUser._id }).select('_id');
        const blockedMeIds = blockedMe.map(u => u._id);
        const allBlockedIds = [...blockedByMe, ...blockedMeIds];

        const followers = await Follow.find({ 
            followed: userId, 
            status: 'active',
            follower: { $nin: allBlockedIds }
        })
            .skip(page * limit)
            .limit(limit)
            .populate('follower', 'firstName lastName mainAvatar aboutMe city country avatarStyle avatarSeed avatarVariant avatarOverrides');

        const total = await Follow.countDocuments({ 
            followed: userId, 
            status: 'active',
            follower: { $nin: allBlockedIds }
        });

        return Response.sendResponse(res, {
            docs: followers.map(f => f.follower),
            total,
            pages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error('Get followers error:', error);
        return Response.sendError(res, 500, 'Server error');
    }
};

/**
 * ✅ Get following list
 */
exports.getFollowing = async (req, res) => {
    const userId = req.params.userId || req.authUser._id;
    const page = parseInt(req.query.page) || 0;
    const limit = parseInt(req.query.limit) || 20;

    // Restriction: User can only see their own following list
    if (userId.toString() !== req.authUser._id.toString()) {
        return Response.sendError(res, 403, 'You are not authorized to view this list');
    }

    try {
        // Get blocked users (both ways)
        const blockedByMe = req.authUser.blockedUsers || [];
        const blockedMe = await User.find({ blockedUsers: req.authUser._id }).select('_id');
        const blockedMeIds = blockedMe.map(u => u._id);
        const allBlockedIds = [...blockedByMe, ...blockedMeIds];

        const following = await Follow.find({ 
            follower: userId, 
            status: 'active',
            followed: { $nin: allBlockedIds }
        })
            .skip(page * limit)
            .limit(limit)
            .populate('followed', 'firstName lastName mainAvatar aboutMe city country avatarStyle avatarSeed avatarVariant avatarOverrides');

        const total = await Follow.countDocuments({ 
            follower: userId, 
            status: 'active',
            followed: { $nin: allBlockedIds }
        });

        return Response.sendResponse(res, {
            docs: following.map(f => f.followed),
            total,
            pages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error('Get following error:', error);
        return Response.sendError(res, 500, 'Server error');
    }
};
