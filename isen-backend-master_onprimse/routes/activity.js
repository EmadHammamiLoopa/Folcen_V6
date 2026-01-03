const express = require('express');
const router = express.Router();
const ActivityController = require('../app/controllers/ActivityController');
// Use the application's JWT middleware instead of passport 'jwt' strategy
const { requireSignin, withAuthUser } = require('../app/middlewares/auth');

router.post('/', [requireSignin, withAuthUser], ActivityController.create);
router.get('/', [requireSignin, withAuthUser], ActivityController.list);

module.exports = router;
