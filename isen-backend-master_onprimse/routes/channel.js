const express = require('express');
const {
  myChannels,
  storeChannel,
  followedChannels,
  exploreChannels, // This handles all explore levels (city, country, global)
  followChannel,
  deleteChannel,
  allChannels,
  showChannel,
  //disableChannel,
  updateChannel,
  clearChannelReports,
  reportChannel,
  toggleChannelStatus,
  getCityChannels,
  toggleChannelApprovement
} = require('../app/controllers/ChannelController');

const {
  allPosts
} = require('../app/controllers/PostController');


const {
  getAllCommentsForAdmin,
  deleteComment,
  voteOnComment,
  reportComment,
} = require('../app/controllers/CommentController');

const { commentById, commentOwner } = require('../app/middlewares/comment');
const { postById } = require('../app/middlewares/post');
const { requireSignin, withAuthUser, isAdmin } = require('../app/middlewares/auth');
const { channelById, channelOwner } = require('../app/middlewares/channel');
const form = require('../app/middlewares/form');
const { storeChannelValidator } = require('../app/middlewares/validators/ChannelValidator');
const { requireLegalAcceptance } = require('../app/middlewares/legal');

const router = express.Router();

// Admin Routes
router.get('/all', [requireSignin, isAdmin], allChannels);
router.delete('/dash/:channelId', [requireSignin, isAdmin], deleteChannel);
router.post('/:channelId/status', [requireSignin, isAdmin], toggleChannelStatus);
router.post('/:channelId/approvement', [requireSignin, isAdmin], toggleChannelApprovement);
router.post('/:channelId/clearReports', [requireSignin, isAdmin], clearChannelReports);
router.get('/comment/comment/all', [requireSignin, isAdmin], getAllCommentsForAdmin)

// User Routes
router.get('/myChannels', [requireSignin], myChannels);
router.post('/', [
  form, 
  requireSignin, 
  storeChannelValidator, 
  withAuthUser,
  requireLegalAcceptance([
    { type: 'terms_and_conditions', versionEnvVar: 'TERMS_VERSION' },
    { type: 'privacy_policy', versionEnvVar: 'PRIVACY_VERSION' },
    {
      type: 'channels_disclaimer',
      versionEnvVar: 'CHANNELS_DISCLAIMER_VERSION',
      acceptanceField: 'acceptedChannelRules'
    }
  ])
], storeChannel);
router.post('/follow/:channelId', [requireSignin, withAuthUser], followChannel);
router.get('/followed', [requireSignin, withAuthUser], followedChannels);

// Explore Channels Route (handles city, country, and global exploration)
router.get('/explore', [requireSignin, withAuthUser], exploreChannels); // Handles all exploration levels
router.get('/post/all', [requireSignin, isAdmin], allPosts);

// Compatibility routes for existing mobile clients whose ChannelService is rooted at /channel.
router.delete('/comment/:commentId', [requireSignin, commentOwner], deleteComment);
router.post('/comment/:commentId/vote', [requireSignin, withAuthUser], voteOnComment);
router.post('/comment/:commentId/report', [requireSignin], reportComment);

// Channel Management Routes
router.delete('/:channelId', [requireSignin, channelOwner], deleteChannel);
router.get('/:channelId', [requireSignin], showChannel);
router.put('/:channelId', [form, requireSignin, channelOwner], updateChannel);
router.post('/:channelId/report', [requireSignin], reportChannel);

router.post('/citychannels', getCityChannels);

// Param Middleware
router.param('channelId', channelById);
router.param('commentId', commentById)
router.param('postId', postById)
module.exports = router;
