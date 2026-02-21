const router = require('express').Router();
const ctrl   = require('../app/controllers/NotificationController');
const { requireSignin, withAuthUser } = require('../app/middlewares/auth');

const auth = [requireSignin, withAuthUser];

router.get('/',           auth, ctrl.list);
router.post('/read',      auth, ctrl.markAllRead);
router.post('/:id/read',  auth, ctrl.markOneRead);

module.exports = router;
