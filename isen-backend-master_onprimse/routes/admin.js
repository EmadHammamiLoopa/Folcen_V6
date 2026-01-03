const express = require('express');
const router = express.Router();
const AdminController = require('../app/controllers/AdminController');
const { requireSignin, withAuthUser, isAdmin, isSuperAdmin } = require('../app/middlewares/auth');
const { requireLatestTermsPrivacy } = require('../app/middlewares/legal');

// Overview for auth events and recent entries
router.get('/auth-events/overview', [requireSignin, withAuthUser, isAdmin], AdminController.authEventsOverview);
router.get('/auth-events/recent', [requireSignin, withAuthUser, isAdmin], AdminController.authEventsRecent);

// Admin Messaging
router.post('/messages/send', [requireSignin, withAuthUser, isSuperAdmin], AdminController.sendAdminMessage);

// Announcements
router.get('/announcements', [requireSignin, withAuthUser, isAdmin], AdminController.getAnnouncements);
router.post('/announcements', [requireSignin, withAuthUser, isSuperAdmin], AdminController.createAnnouncement);
router.delete('/announcements/:id', [requireSignin, withAuthUser, isSuperAdmin], AdminController.deleteAnnouncement);

// User Management & Analytics
router.get('/users/export', [requireSignin, withAuthUser, requireLatestTermsPrivacy, isAdmin], AdminController.exportUsers);
router.get('/channels/export', [requireSignin, withAuthUser, requireLatestTermsPrivacy, isAdmin], AdminController.exportChannels);
router.get('/subscriptions/export', [requireSignin, withAuthUser, requireLatestTermsPrivacy, isAdmin], AdminController.exportSubscriptions);
router.get('/analytics', [requireSignin, withAuthUser, isAdmin], AdminController.getAnalytics);
router.delete('/users/:id/permanent', [requireSignin, withAuthUser, isSuperAdmin], AdminController.deleteUserPermanent);
router.get('/users/deleted', [requireSignin, withAuthUser, isAdmin], AdminController.deletedUsersStatus);
router.get('/analytics/users/active', [requireSignin, withAuthUser, isAdmin], AdminController.getActiveUsers);
router.get('/analytics/users/retention', [requireSignin, withAuthUser, isAdmin], AdminController.getRetention);

module.exports = router;
