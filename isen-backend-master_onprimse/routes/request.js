const express = require('express')
const { storeRequest, requests, acceptRequest, rejectRequest, cancelRequest, cancelRequestByUser} = require('../app/controllers/RequestController')
const { requireSignin, withAuthUser } = require('../app/middlewares/auth')
const { userById, isNotFriend, isNotBlocked } = require('../app/middlewares/user')
const { requestById, requestSender, requestReceiver, requestNotExist, sendRequestPermission } = require('../app/middlewares/request')
const router = express.Router()

// Ensure param handlers are registered early so they run before routes
router.param('requestId', requestById)
router.param('userId', userById);  // Apply requireSignin first

// router.get('/', indexRequests)

router.post('/accept/:requestId', [requireSignin, requestReceiver, isNotBlocked, withAuthUser], acceptRequest)
router.post('/reject/:requestId', [requireSignin, requestReceiver, isNotBlocked], rejectRequest)
router.post('/cancel/:requestId', [requireSignin, withAuthUser, requestSender, isNotBlocked], cancelRequest);
router.post('/cancel-by-user/:userId', [requireSignin, withAuthUser, userById, isNotBlocked], cancelRequestByUser);
router.post('/:userId', [
	requireSignin,
	withAuthUser,
	isNotFriend,
	requestNotExist,
	sendRequestPermission
], storeRequest);

router.get('/requests', [requireSignin], requests)
module.exports = router
