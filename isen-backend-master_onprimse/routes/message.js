const express = require('express')
const { indexMessages, getUsersMessages, sendMessagePermission,deleteMessage } = require('../app/controllers/MessageController')
const { requireSignin, withAuthUser } = require('../app/middlewares/auth')
const { isFriend } = require('../app/middlewares/request')
const { userById, isNotBlocked } = require('../app/middlewares/user')
const router = express.Router()


router.get('/permission/:userId', [requireSignin, withAuthUser], sendMessagePermission);
router.get('/users', [requireSignin, withAuthUser], getUsersMessages);
router.get('/:userId', [requireSignin, withAuthUser], indexMessages);

router.delete('/:messageId', [requireSignin, withAuthUser], deleteMessage);



router.param('userId', userById);  // Apply requireSignin first

module.exports = router