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
const { isAdmin, requireSignin } = require('../app/middlewares/auth');
const { reportById } = require('../app/middlewares/report');

const router = express.Router();

// Middleware to fetch report by ID
router.param('reportId', reportById);

// Admin routes
router.get('/all', [requireSignin, isAdmin], allReports);
router.get('/:reportId', [requireSignin, isAdmin], showReport);

router.post('/report/:reportId/action', [requireSignin, isAdmin], takeActionOnReport);

// Reporting routes
router.post('/report/user', [requireSignin], reportUser); // Endpoint for users to report another user
router.post('/report/content', [requireSignin], reportContent); // Endpoint for users to report content
router.post('/user/block', [requireSignin], blockUser); // Endpoint for users to block another user

// Moderation routes
router.get('/moderation/reports', [requireSignin, isAdmin], reviewReports); // Endpoint for admins to review reports
router.post(
    '/moderation/reports/:reportId/action',
    [requireSignin, isAdmin],
    takeActionOnReport
); // Endpoint for admins to take action on a report

module.exports = router;
