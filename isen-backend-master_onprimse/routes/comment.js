const express = require('express')

const {
    storeComment,
    getComments,
    deleteComment,
    voteOnComment,
    reportComment,
    getDashComments,
    showComment,
    showDashComment,
    showCommentEditDash,
    updateComment,
    postComments,
    getAllCommentsForAdmin,
    clearCommentReports
} = require('../app/controllers/CommentController');

const { requireSignin, withAuthUser, isAdmin } = require('../app/middlewares/auth');
const { requireLatestTermsPrivacy } = require('../app/middlewares/legal');
const { commentById, commentOwner } = require('../app/middlewares/comment');
const {
    commentPostById,
    startCommentPostPrefetch,
    finishCommentPostPrefetch
} = require('../app/middlewares/post');
const { storeCommentValidator } = require('../app/middlewares/validators/CommentValidator');

const router = express.Router()

const withStoreCommentAuthFields = (req, res, next) => {
    req._authUserExtraSelect =
        'blockedUsers firstName lastName mainAvatar avatarStyle ' +
        'avatarSeed avatarVariant avatarOverrides';

    // Allow requireSignin to overlap this route's auth-user Mongo read
    // with the Redis token-revocation checks.
    req._prefetchAuthUser = true;

    next();
};

router.param('commentId', commentById)

const loadCommentPostForRead = (req, res, next) =>
    commentPostById(
        req,
        res,
        next,
        req.params.postId
    );

router.get('/all', [requireSignin, withAuthUser, isAdmin], getAllCommentsForAdmin)
router.get(
    '/post/:postId/comments',
    [loadCommentPostForRead, requireSignin, withAuthUser, isAdmin],
    postComments
)

router.get('/:commentId', [requireSignin], showComment)
router.get('/dash/:commentId', [requireSignin, withAuthUser, isAdmin], showDashComment)
router.put('/:commentId', [requireSignin, withAuthUser, isAdmin], updateComment)

router.post(
    '/post/:postId/comment',
    [
        withStoreCommentAuthFields,
        startCommentPostPrefetch,
        requireSignin,
        withAuthUser,
        finishCommentPostPrefetch
    ],
    storeComment
)
router.get(
    '/post/:postId/comment',
    [loadCommentPostForRead, requireSignin, withAuthUser],
    getComments
)
router.delete('/:commentId', [requireSignin, withAuthUser, commentOwner], deleteComment)
router.post('/:commentId/vote', [requireSignin, withAuthUser], voteOnComment)
router.post('/:commentId/report', [requireSignin], reportComment)
router.post('/:commentId/clearReports', [requireSignin, withAuthUser, isAdmin], clearCommentReports)



module.exports = router