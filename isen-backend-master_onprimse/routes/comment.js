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
    commentPostById
} = require('../app/middlewares/post');
const { storeCommentValidator } = require('../app/middlewares/validators/CommentValidator');

const router = express.Router()

const withStoreCommentAuthFields = (req, res, next) => {
    req._authUserExtraSelect =
        'blockedUsers firstName lastName mainAvatar avatarStyle ' +
        'avatarSeed avatarVariant avatarOverrides';
    next();
};

router.param('commentId', commentById)
router.param('postId', commentPostById)

router.get('/all', [requireSignin, isAdmin], getAllCommentsForAdmin)
router.get('/post/:postId/comments', [requireSignin, isAdmin], postComments)

router.get('/:commentId', [requireSignin], showComment)
router.get('/dash/:commentId', [requireSignin, isAdmin], showDashComment)
router.put('/:commentId', [requireSignin, isAdmin], updateComment)

router.post(
    '/post/:postId/comment',
    [requireSignin, withStoreCommentAuthFields, withAuthUser],
    storeComment
)
router.get('/post/:postId/comment', [requireSignin, withAuthUser], getComments)
router.delete('/:commentId', [requireSignin, commentOwner], deleteComment)
router.post('/:commentId/vote', [requireSignin, withAuthUser], voteOnComment)
router.post('/:commentId/report', [requireSignin], reportComment)
router.post('/:commentId/clearReports', [requireSignin, isAdmin], clearCommentReports)



module.exports = router