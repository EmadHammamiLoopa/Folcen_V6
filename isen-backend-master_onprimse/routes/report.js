const express = require('express');
const {
    allReports,
    showReport,
    reportUser,
    reportContent,
    blockUser,
    reviewReports,
    takeActionOnReport
} = require('../app/controllers/ReportController');
const { isAdmin, requireSignin, withAuthUser } = require('../app/middlewares/auth');
const { reportById } = require('../app/middlewares/report');

const router = express.Router();

// Middleware to fetch report by ID
router.param('reportId', reportById);

// Admin routes
router.get('/all', [requireSignin, withAuthUser, isAdmin], allReports);
router.get('/:reportId', [requireSignin, withAuthUser, isAdmin], showReport);

router.post('/:reportId/action', [requireSignin, withAuthUser, isAdmin], takeActionOnReport);

// Reporting routes
router.post('/report/user', [requireSignin], reportUser); // Endpoint for users to report another user
router.post('/report/content', [requireSignin], reportContent); // Endpoint for users to report content
router.post('/user/block', [requireSignin], blockUser); // Endpoint for users to block another user

// Moderation routes
router.get('/moderation/reports', [requireSignin, isAdmin], reviewReports); // Endpoint for admins to review reports
router.post(
    '/moderation/reports/:reportId/action',
    [requireSignin, withAuthUser, isAdmin],
    takeActionOnReport
); // Endpoint for admins to take action on a report

module.exports = router;
