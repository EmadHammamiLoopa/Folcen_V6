const express = require('express')

const {
    storePost,
    getPosts,
    deletePost,
    voteOnPost,
    reportPost,
    getDashPosts,
    updateVisibility,
    showPost,
    channelPosts,
    showDashPost,
    allPosts,
    getFeed
} = require('../app/controllers/PostController');

const { requireSignin, withAuthUser, isAdmin } = require('../app/middlewares/auth');
const { channelById, isFollowedChannel } = require('../app/middlewares/channel');
const { postById, postOwner, isFollowedChannelPost } = require('../app/middlewares/post');
const { storePostValidator } = require('../app/middlewares/validators/PostValidator');

const router = express.Router()

router.get('/post/all', [requireSignin, withAuthUser, isAdmin], allPosts);
// Allow POST as an alias for dashboard clients that POST to this endpoint
router.post('/post/all', [requireSignin, withAuthUser, isAdmin], allPosts);
router.get('/post/:postId/dash', [requireSignin, withAuthUser, isAdmin], showDashPost)
router.get('/feed', [requireSignin, withAuthUser], getFeed)
router.delete('/post/:postId', [requireSignin, withAuthUser, postOwner], deletePost)
router.get('/:channelId/posts', [requireSignin, withAuthUser, isAdmin], channelPosts)

router.post('/post/:postId/vote', [requireSignin, isFollowedChannelPost, withAuthUser], voteOnPost)
router.post('/post/:postId/report', [requireSignin, withAuthUser], reportPost)

router.get('/post/:postId', [requireSignin, withAuthUser], showPost)
router.post('/:channelId/post/', [
    requireSignin,
    isFollowedChannel,
    withAuthUser
], storePost)
router.get('/:channelId/getposts/', [requireSignin, withAuthUser], getPosts)

router.put('/post/:postId/visibility', [requireSignin, withAuthUser], updateVisibility);

router.param('postId', postById)
router.param('channelId', channelById)

module.exports = router