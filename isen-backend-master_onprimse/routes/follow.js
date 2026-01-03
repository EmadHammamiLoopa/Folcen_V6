const express = require('express');
const router = express.Router();
const { requireSignin, withAuthUser } = require('../app/middlewares/auth');
const {
    followUser,
    unfollowUser,
    handleFollowRequest,
    removeFollower,
    blockUser,
    getFollowers,
    getFollowing,
    getFollowRequests
} = require('../app/controllers/FollowController');

// All routes require signin and auth user
router.use(requireSignin, withAuthUser);

router.get('/requests', getFollowRequests);
router.post('/:userId', followUser);
router.delete('/:userId', unfollowUser);
router.put('/request/:userId', handleFollowRequest);
router.delete('/follower/:userId', removeFollower);
router.post('/block/:userId', blockUser);
router.get('/followers/:userId?', getFollowers);
router.get('/following/:userId?', getFollowing);

module.exports = router;
