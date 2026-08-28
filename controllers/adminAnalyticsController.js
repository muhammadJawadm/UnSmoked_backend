const User              = require("../models/User");
const Post              = require("../models/Post");
const Blog              = require("../models/Blog");
const Comment           = require("../models/Comment");
const Challenge         = require("../models/Challenges");
const ChallengeParticipant = require("../models/ChallengeParticipant");
const Competition       = require("../models/Competition");
const UserOverview      = require("../models/UserOverview");
const UserProgress      = require("../models/UserProgress");
const Feedback          = require("../models/Feedback");
const Notification      = require("../models/Notifications");
const DailyBoard        = require("../models/DailyBoard");
const Badges            = require("../models/Badges");
const PostReport        = require("../models/PostReport");

// ─── Helper: date range for last N days ──────────────────────────────────────
const lastNDays = (n) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - n);
    d.setUTCHours(0, 0, 0, 0);
    return d;
};

// ─── 1. Overview (combined snapshot) ─────────────────────────────────────────

exports.getOverview = async (req, res) => {
    try {
        const now      = new Date();
        const today    = lastNDays(0);
        const week     = lastNDays(7);
        const month    = lastNDays(30);

        const [
            totalUsers,
            activeUsers,
            newUsersToday,
            newUsersThisWeek,
            newUsersThisMonth,
            totalPosts,
            postsThisWeek,
            totalBlogs,
            totalChallenges,
            activeChallenges,
            completedChallenges,
            challengesThisWeek,
            totalCompetitions,
            activeCompetitions,
            totalFeedback,
            avgRating,
            pendingReports,
            totalNotifications,
            sentNotifications,
            failedNotifications,
            platformOverview,
            topUsersByCompletions,
        ] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ is_active: true }),
            User.countDocuments({ createdAt: { $gte: today } }),
            User.countDocuments({ createdAt: { $gte: week } }),
            User.countDocuments({ createdAt: { $gte: month } }),
            Post.countDocuments(),
            Post.countDocuments({ createdAt: { $gte: week } }),
            Blog.countDocuments(),
            Challenge.countDocuments(),
            Challenge.countDocuments({ status: "active" }),
            Challenge.countDocuments({ status: "completed" }),
            Challenge.countDocuments({ createdAt: { $gte: week } }),
            Competition.countDocuments(),
            Competition.countDocuments({ status: "active" }),
            Feedback.countDocuments(),
            Feedback.aggregate([{ $group: { _id: null, avg: { $avg: "$rating" } } }]),
            PostReport.countDocuments(),
            Notification.countDocuments(),
            Notification.countDocuments({ status: "sent" }),
            Notification.countDocuments({ status: "failed" }),
            UserOverview.aggregate([
                {
                    $group: {
                        _id: null,
                        totalCigarettesAvoided: { $sum: "$totalCigarettesAvoided" },
                        totalLifeRegained:       { $sum: "$totalLifeRegained" },
                        totalMoneySaved:         { $sum: "$totalMoneySaved" },
                    },
                },
            ]),
            UserProgress.find().sort({ challengesCompleted: -1 }).limit(5).populate("userId", "name email profile_picture"),
        ]);

        res.status(200).json({
            success: true,
            message: "Analytics overview fetched successfully",
            overview: {
                users: {
                    total:          totalUsers,
                    active:         activeUsers,
                    banned:         totalUsers - activeUsers,
                    newToday:       newUsersToday,
                    newThisWeek:    newUsersThisWeek,
                    newThisMonth:   newUsersThisMonth,
                },
                content: {
                    totalPosts,
                    postsThisWeek,
                    totalBlogs,
                },
                challenges: {
                    total:     totalChallenges,
                    active:    activeChallenges,
                    completed: completedChallenges,
                    thisWeek:  challengesThisWeek,
                    completionRate: totalChallenges > 0
                        ? `${((completedChallenges / totalChallenges) * 100).toFixed(1)}%`
                        : "0%",
                },
                competitions: {
                    total:  totalCompetitions,
                    active: activeCompetitions,
                },
                feedback: {
                    total:         totalFeedback,
                    averageRating: avgRating[0] ? parseFloat(avgRating[0].avg.toFixed(2)) : 0,
                },
                moderation: {
                    pendingReports: pendingReports,
                },
                notifications: {
                    total:   totalNotifications,
                    sent:    sentNotifications,
                    failed:  failedNotifications,
                },
                healthImpact: platformOverview[0]
                    ? {
                        totalCigarettesAvoided: platformOverview[0].totalCigarettesAvoided,
                        totalLifeRegainedMinutes: platformOverview[0].totalLifeRegained,
                        totalMoneySaved: parseFloat(platformOverview[0].totalMoneySaved.toFixed(2)),
                    }
                    : { totalCigarettesAvoided: 0, totalLifeRegainedMinutes: 0, totalMoneySaved: 0 },
                topUsersByCompletions: topUsersByCompletions.map((p) => ({
                    user:  p.userId,
                    challengesCompleted: p.challengesCompleted,
                    totalWins:   p.totalWins,
                    totalLosses: p.totalLosses,
                })),
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── 2. User Growth Trends ────────────────────────────────────────────────────

exports.getUserGrowth = async (req, res) => {
    try {
        const period = (req.query.period || "month").toLowerCase();

        let groupFormat, daysBack, label;
        if (period === "week") {
            groupFormat = "%Y-%m-%d";
            daysBack    = 7;
            label       = "Daily registrations — last 7 days";
        } else if (period === "year") {
            groupFormat = "%Y-%m";
            daysBack    = 365;
            label       = "Monthly registrations — last 12 months";
        } else {
            groupFormat = "%Y-%m-%d";
            daysBack    = 30;
            label       = "Daily registrations — last 30 days";
        }

        const since = lastNDays(daysBack);

        const [registrations, roleBreakdown, authProviderBreakdown, verifiedBreakdown] = await Promise.all([
            User.aggregate([
                { $match: { createdAt: { $gte: since } } },
                {
                    $group: {
                        _id:   { $dateToString: { format: groupFormat, date: "$createdAt" } },
                        count: { $sum: 1 },
                    },
                },
                { $sort: { _id: 1 } },
            ]),
            User.aggregate([
                { $group: { _id: "$role", count: { $sum: 1 } } },
            ]),
            User.aggregate([
                { $group: { _id: "$authProvider", count: { $sum: 1 } } },
            ]),
            User.aggregate([
                { $group: { _id: "$is_verified", count: { $sum: 1 } } },
            ]),
        ]);

        res.status(200).json({
            success: true,
            message: "User growth data fetched successfully",
            period,
            label,
            registrations,
            breakdown: {
                byRole:         roleBreakdown,
                byAuthProvider: authProviderBreakdown,
                byVerified:     verifiedBreakdown,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── 3. Platform Health Impact ────────────────────────────────────────────────

exports.getHealthImpact = async (req, res) => {
    try {
        const [
            platformTotals,
            healthDistribution,
            lungsDistribution,
            topSavers,
            dailyTrend,
        ] = await Promise.all([
            UserOverview.aggregate([
                {
                    $group: {
                        _id: null,
                        totalCigarettesAvoided:  { $sum: "$totalCigarettesAvoided" },
                        totalLifeRegained:        { $sum: "$totalLifeRegained" },
                        totalMoneySaved:          { $sum: "$totalMoneySaved" },
                        avgCigarettesAvoided:     { $avg: "$totalCigarettesAvoided" },
                        avgMoneySaved:            { $avg: "$totalMoneySaved" },
                        usersWithData:            { $sum: 1 },
                    },
                },
            ]),
            UserOverview.aggregate([
                { $group: { _id: "$overallHealth", count: { $sum: 1 } } },
                { $sort: { count: -1 } },
            ]),
            UserOverview.aggregate([
                { $group: { _id: "$lungsHealth", count: { $sum: 1 } } },
                { $sort: { count: -1 } },
            ]),
            UserOverview.find()
                .sort({ totalMoneySaved: -1 })
                .limit(10)
                .populate("userId", "name email profile_picture"),
            DailyBoard.aggregate([
                { $match: { challengeId: null, date: { $gte: lastNDays(30) } } },
                {
                    $group: {
                        _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
                        totalAvoided: { $sum: "$cigarettesAvoided" },
                        totalSmoked:  { $sum: "$cigarettesSmoked" },
                        activeUsers:  { $sum: 1 },
                    },
                },
                { $sort: { _id: 1 } },
            ]),
        ]);

        const totals = platformTotals[0] || {};

        res.status(200).json({
            success: true,
            message: "Platform health impact fetched successfully",
            healthImpact: {
                totals: {
                    cigarettesAvoided:    totals.totalCigarettesAvoided    || 0,
                    lifeRegainedMinutes:  totals.totalLifeRegained          || 0,
                    lifeRegainedHours:    parseFloat(((totals.totalLifeRegained || 0) / 60).toFixed(2)),
                    moneySaved:           parseFloat((totals.totalMoneySaved || 0).toFixed(2)),
                    usersTracking:        totals.usersWithData              || 0,
                },
                averages: {
                    cigarettesAvoidedPerUser: parseFloat((totals.avgCigarettesAvoided || 0).toFixed(1)),
                    moneySavedPerUser:        parseFloat((totals.avgMoneySaved        || 0).toFixed(2)),
                },
                overallHealthDistribution: healthDistribution,
                lungsHealthDistribution:   lungsDistribution,
                topSavers: topSavers.map((u) => ({
                    user:                   u.userId,
                    totalCigarettesAvoided: u.totalCigarettesAvoided,
                    totalMoneySaved:        parseFloat(u.totalMoneySaved.toFixed(2)),
                    totalLifeRegainedHours: parseFloat((u.totalLifeRegained / 60).toFixed(2)),
                })),
                dailyTrend,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── 4. Challenge Analytics ───────────────────────────────────────────────────

exports.getChallengeAnalytics = async (req, res) => {
    try {
        const [
            statusBreakdown,
            modeBreakdown,
            sourceBreakdown,
            moderationBreakdown,
            creationTrend,
            avgDuration,
            topWinners,
            inviteStats,
        ] = await Promise.all([
            Challenge.aggregate([
                { $group: { _id: "$status", count: { $sum: 1 } } },
                { $sort: { count: -1 } },
            ]),
            Challenge.aggregate([
                { $group: { _id: "$mode", count: { $sum: 1 } } },
            ]),
            Challenge.aggregate([
                { $group: { _id: "$sourceType", count: { $sum: 1 } } },
            ]),
            Challenge.aggregate([
                { $group: { _id: "$moderationStatus", count: { $sum: 1 } } },
            ]),
            Challenge.aggregate([
                { $match: { createdAt: { $gte: lastNDays(30) } } },
                {
                    $group: {
                        _id:   { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                        count: { $sum: 1 },
                    },
                },
                { $sort: { _id: 1 } },
            ]),
            Challenge.aggregate([
                { $match: { status: "completed", durationDays: { $exists: true } } },
                { $group: { _id: null, avg: { $avg: "$durationDays" } } },
            ]),
            ChallengeParticipant.aggregate([
                { $match: { resultRecorded: true } },
                { $group: { _id: "$userId", wins: { $sum: 1 } } },
                { $sort: { wins: -1 } },
                { $limit: 10 },
                { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "user" } },
                { $unwind: "$user" },
                { $project: { "user.name": 1, "user.email": 1, "user.profile_picture": 1, wins: 1 } },
            ]),
            ChallengeParticipant.aggregate([
                { $group: { _id: "$inviteStatus", count: { $sum: 1 } } },
            ]),
        ]);

        const total      = statusBreakdown.reduce((s, i) => s + i.count, 0);
        const completed  = (statusBreakdown.find((s) => s._id === "completed") || {}).count || 0;
        const cancelled  = (statusBreakdown.find((s) => s._id === "cancelled") || {}).count || 0;

        res.status(200).json({
            success: true,
            message: "Challenge analytics fetched successfully",
            challenges: {
                total,
                completionRate: total > 0 ? parseFloat(((completed / total) * 100).toFixed(1)) : 0,
                cancellationRate: total > 0 ? parseFloat(((cancelled / total) * 100).toFixed(1)) : 0,
                averageDurationDays: avgDuration[0] ? parseFloat(avgDuration[0].avg.toFixed(1)) : 0,
                statusBreakdown,
                modeBreakdown,
                sourceBreakdown,
                moderationBreakdown,
                inviteStatusBreakdown: inviteStats,
                creationTrendLast30Days: creationTrend,
                topWinners,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── 5. Content Analytics ─────────────────────────────────────────────────────

exports.getContentAnalytics = async (req, res) => {
    try {
        const since30 = lastNDays(30);
        const since7  = lastNDays(7);

        const [
            postTrend,
            blogTrend,
            commentTrend,
            topPosters,
            feedbackRatings,
            avgFeedbackRating,
            notificationStats,
            badgeStats,
        ] = await Promise.all([
            Post.aggregate([
                { $match: { createdAt: { $gte: since30 } } },
                { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
                { $sort: { _id: 1 } },
            ]),
            Blog.aggregate([
                { $match: { createdAt: { $gte: since30 } } },
                { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
                { $sort: { _id: 1 } },
            ]),
            Comment.aggregate([
                { $match: { createdAt: { $gte: since30 } } },
                { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
                { $sort: { _id: 1 } },
            ]),
            Post.aggregate([
                { $group: { _id: "$userId", postCount: { $sum: 1 } } },
                { $sort: { postCount: -1 } },
                { $limit: 10 },
                { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "user" } },
                { $unwind: "$user" },
                { $project: { "user.name": 1, "user.email": 1, "user.profile_picture": 1, postCount: 1 } },
            ]),
            Feedback.aggregate([
                { $group: { _id: "$rating", count: { $sum: 1 } } },
                { $sort: { _id: 1 } },
            ]),
            Feedback.aggregate([
                { $group: { _id: null, avg: { $avg: "$rating" } } },
            ]),
            Notification.aggregate([
                { $group: { _id: "$status", count: { $sum: 1 } } },
            ]),
            Badges.aggregate([
                { $group: { _id: "$badge", count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 },
                { $lookup: { from: "bagetemplates", localField: "_id", foreignField: "_id", as: "badge" } },
                { $unwind: "$badge" },
                { $project: { "badge.title": 1, "badge.type": 1, count: 1 } },
            ]),
        ]);

        const totalPosts    = await Post.countDocuments();
        const totalBlogs    = await Blog.countDocuments();
        const totalComments = await Comment.countDocuments();
        const postsThisWeek = await Post.countDocuments({ createdAt: { $gte: since7 } });
        const blogsThisWeek = await Blog.countDocuments({ createdAt: { $gte: since7 } });

        res.status(200).json({
            success: true,
            message: "Content analytics fetched successfully",
            content: {
                summary: {
                    totalPosts,
                    totalBlogs,
                    totalComments,
                    postsThisWeek,
                    blogsThisWeek,
                },
                trends: {
                    posts:    postTrend,
                    blogs:    blogTrend,
                    comments: commentTrend,
                },
                topPosters,
                feedback: {
                    averageRating:    avgFeedbackRating[0] ? parseFloat(avgFeedbackRating[0].avg.toFixed(2)) : 0,
                    ratingBreakdown:  feedbackRatings,
                },
                notifications: {
                    statusBreakdown: notificationStats,
                },
                mostEarnedBadges: badgeStats,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
