const express = require('express')
const { storeRequest, requests, acceptRequest, rejectRequest, cancelRequest} = require('../app/controllers/RequestController')
const { requireSignin, withAuthUser } = require('../app/middlewares/auth')
const { userById, isNotFriend, isNotBlocked } = require('../app/middlewares/user')
const { requestById, requestSender, requestReceiver, requestNotExist, sendRequestPermission } = require('../app/middlewares/request')
const router = express.Router()

// Debugging: log every incoming request to this router
router.use((req, res, next) => {
	try {
		console.log(`[DEBUG][request router] ${req.method} ${req.originalUrl} - Authorization: ${req.headers.authorization ? 'yes' : 'no'}`);
	} catch (e) {
		// ignore logging failures
	}
	next();
});

// Ensure param handlers are registered early so they run before routes
router.param('requestId', requestById)
router.param('userId', userById);  // Apply requireSignin first

// router.get('/', indexRequests)

router.post('/accept/:requestId', [requireSignin, requestReceiver, isNotBlocked, withAuthUser], acceptRequest)
router.post('/reject/:requestId', [requireSignin, requestReceiver, isNotBlocked], rejectRequest)
router.post('/cancel/:requestId', [requireSignin, withAuthUser, requestSender, isNotBlocked], cancelRequest);
// Add a quick inline logger in the middleware chain to trace execution order
router.post('/:userId', [
	requireSignin,
	(req, res, next) => { try { console.log('[route.middleware] after requireSignin'); } catch(e){}; next(); },
	withAuthUser,
	(req, res, next) => { try { console.log('[route.middleware] after withAuthUser'); } catch(e){}; next(); },
	(req, res, next) => { try { console.log('[route.middleware] before isNotFriend'); } catch(e){}; next(); },
	isNotFriend,
	(req, res, next) => { try { console.log('[route.middleware] after isNotFriend'); } catch(e){}; next(); },
	requestNotExist,
	(req, res, next) => { try { console.log('[route.middleware] after requestNotExist'); } catch(e){}; next(); },
	sendRequestPermission,
	(req, res, next) => { try { console.log('[route.middleware] after sendRequestPermission'); } catch(e){}; next(); }
], storeRequest);

router.get('/requests', [requireSignin], requests)
module.exports = router