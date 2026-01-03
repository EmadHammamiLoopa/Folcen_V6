const User = require("../models/User");
const Post = require("../models/Post");
const Job = require("../models/Job");
const Service = require("../models/Service");
const Comment = require("../models/Comment");
const Report = require("../models/Report");
const Response = require("./Response");
const mongoose = require('mongoose');

exports.getUsersAnalytics = async (req, res) => {
    try {
        const { fromDate, toDate } = req.query;
        const start = fromDate ? new Date(fromDate) : new Date(new Date().setDate(new Date().getDate() - 30));
        const end = toDate ? new Date(toDate) : new Date();

        // 1. KPI Cards (Total, Active, Banned, Reported)
        const now = new Date();
        const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const [totalUsers, activeUsers, bannedUsers, reportedUsersCount, dau, wau, mau] = await Promise.all([
            User.countDocuments({ deletedAt: null }),
            User.countDocuments({ deletedAt: null, lastSeen: { $gte: monthAgo } }),
            User.countDocuments({ deletedAt: null, banned: true }),
            Report.countDocuments({ entityModel: 'User' }),
            User.countDocuments({ deletedAt: null, lastSeen: { $gte: dayAgo } }),
            User.countDocuments({ deletedAt: null, lastSeen: { $gte: weekAgo } }),
            User.countDocuments({ deletedAt: null, lastSeen: { $gte: monthAgo } })
        ]);

        // 2. Growth Chart (New Users per day)
        const growthData = await User.aggregate([
            { $match: { deletedAt: null, createdAt: { $gte: start, $lte: end } } },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id": 1 } }
        ]);

        // 3. Engagement Chart (Active Users per day based on lastSeen)
        const engagementData = await User.aggregate([
            { $match: { deletedAt: null, lastSeen: { $gte: start, $lte: end } } },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$lastSeen" } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id": 1 } }
        ]);

        // 4. Status Breakdown
        const statusBreakdown = await User.aggregate([
            { $match: { deletedAt: null } },
            {
                $group: {
                    _id: "$enabled",
                    count: { $sum: 1 }
                }
            }
        ]);

        // 5. Feature Usage (Aggregated)
        const [postsCount, jobsCount, servicesCount, commentsCount] = await Promise.all([
            Post.countDocuments({ createdAt: { $gte: start, $lte: end } }),
            Job.countDocuments({ createdAt: { $gte: start, $lte: end } }),
            Service.countDocuments({ createdAt: { $gte: start, $lte: end } }),
            Comment.countDocuments({ createdAt: { $gte: start, $lte: end } })
        ]);

        return Response.sendResponse(res, {
            kpis: {
                totalUsers,
                activeUsers,
                bannedUsers,
                reportedUsersCount,
                dau,
                wau,
                mau
            },
            charts: {
                growth: growthData,
                engagement: engagementData,
                status: statusBreakdown,
                features: {
                    posts: postsCount,
                    jobs: jobsCount,
                    services: servicesCount,
                    comments: commentsCount
                }
            }
        }, "Analytics data retrieved successfully");

    } catch (error) {
        console.error("Analytics Error:", error);
        return Response.sendError(res, 500, "Internal Server Error");
    }
};

exports.getRetentionStats = async (req, res) => {
    try {
        // Simple retention: % of users who joined in period X and were seen in period Y
        // For now, let's do a simple cohort-like aggregation
        const now = new Date();
        const day1 = new Date(new Date().setDate(now.getDate() - 1));
        const day7 = new Date(new Date().setDate(now.getDate() - 7));
        const day30 = new Date(new Date().setDate(now.getDate() - 30));

        const [r1, r7, r30] = await Promise.all([
            User.countDocuments({ createdAt: { $lte: day1 }, lastSeen: { $gte: day1 }, deletedAt: null }),
            User.countDocuments({ createdAt: { $lte: day7 }, lastSeen: { $gte: day7 }, deletedAt: null }),
            User.countDocuments({ createdAt: { $lte: day30 }, lastSeen: { $gte: day30 }, deletedAt: null })
        ]);

        const total = await User.countDocuments({ deletedAt: null });

        return Response.sendResponse(res, {
            day1: total > 0 ? (r1 / total) * 100 : 0,
            day7: total > 0 ? (r7 / total) * 100 : 0,
            day30: total > 0 ? (r30 / total) * 100 : 0
        }, "Retention stats retrieved");
    } catch (error) {
        return Response.sendError(res, 500, "Internal Server Error");
    }
};
