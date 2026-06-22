const User                   = require("../models/User");
const Post                   = require("../models/Post");
const Blog                   = require("../models/Blog");
const Comment                = require("../models/Comment");
const Like                   = require("../models/Like");
const Task                   = require("../models/Task");
const Category               = require("../models/Category");
const Milestone              = require("../models/Milestones");
const UserMilestone          = require("../models/UserMilestone");
const Faq                    = require("../models/Faq");
const Feedback               = require("../models/Feedback");
const Contact                = require("../models/Contact");
const Chat                   = require("../models/Chat");
const Message                = require("../models/Message");
const MotivationalTip        = require("../models/MotivationalTip");
const QuickWin               = require("../models/QuickWin");
const HealthBody             = require("../models/HealthBody");
const Notification           = require("../models/Notifications");
const Template               = require("../models/Template");
const Challenge              = require("../models/Challenges");
const ChallengeParticipant   = require("../models/ChallengeParticipant");
const ChallengeTaskAssignment = require("../models/ChallengeTaskAssignment");
const Competition            = require("../models/Competition");
const BadgeTemplate          = require("../models/BadgeTemplate");
const Badges                 = require("../models/Badges");
const PostReport             = require("../models/PostReport");
const PostHide               = require("../models/PostHide");
const UserProgress           = require("../models/UserProgress");
const DailyBoard             = require("../models/DailyBoard");
const MonthlyBoard           = require("../models/MonthlyBoard");
const Board                  = require("../models/Board");
const SmokeFreeMilestone     = require("../models/SmokeFreeMilestone");
const Otp                    = require("../models/Otp");
const UserOverview           = require("../models/UserOverview");
const firebaseAdmin          = require("../utils/firebase");
const mongoose               = require("mongoose");
const { enrichChallengeCreatorXp, enrichChallengesCreatorXp } = require("../utils/challengeUtils");

// ─── Pagination helper ────────────────────────────────────────────────────────

const paginate = (query) => {
    const page  = Math.max(parseInt(query.page)  || 1, 1);
    const limit = Math.min(Math.max(parseInt(query.limit) || 20, 1), 100);
    const skip  = (page - 1) * limit;
    return { page, limit, skip };
};

const paginationMeta = (total, page, limit) => ({
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
});

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

exports.getDashboardStats = async (req, res) => {
    try {
        const [
            totalUsers,
            activeUsers,
            totalPosts,
            totalBlogs,
            totalComments,
            totalChallenges,
            activeChallenges,
            totalCompetitions,
            totalFeedback,
            totalContacts,
            pendingContacts,
            totalPostReports,
            totalNotifications,
        ] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ is_active: true }),
            Post.countDocuments(),
            Blog.countDocuments(),
            Comment.countDocuments(),
            Challenge.countDocuments(),
            Challenge.countDocuments({ status: "active" }),
            Competition.countDocuments(),
            Feedback.countDocuments(),
            Contact.countDocuments(),
            Contact.countDocuments({ status: "pending" }),
            PostReport.countDocuments(),
            Notification.countDocuments(),
        ]);

        res.status(200).json({
            success: true,
            message: "Dashboard stats fetched successfully",
            stats: {
                users:         { total: totalUsers, active: activeUsers },
                posts:         { total: totalPosts },
                blogs:         { total: totalBlogs },
                comments:      { total: totalComments },
                challenges:    { total: totalChallenges, active: activeChallenges },
                competitions:  { total: totalCompetitions },
                feedback:      { total: totalFeedback },
                contacts:      { total: totalContacts, pending: pendingContacts },
                postReports:   { total: totalPostReports },
                notifications: { total: totalNotifications },
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Users ────────────────────────────────────────────────────────────────────

exports.getAllUsers = async (req, res) => {
    try {
        const { page, limit, skip } = paginate(req.query);
        const { search, role, is_active, is_verified } = req.query;

        const filter = {};
        if (search)     filter.$or = [{ name: new RegExp(search, "i") }, { email: new RegExp(search, "i") }];
        if (role)       filter.role       = role;
        if (is_active   !== undefined) filter.is_active   = is_active   === "true";
        if (is_verified !== undefined) filter.is_verified = is_verified === "true";

        const [users, total] = await Promise.all([
            User.find(filter)
                .select("-password")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            User.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            message: "Users fetched successfully",
            users,
            pagination: paginationMeta(total, page, limit),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Posts ────────────────────────────────────────────────────────────────────

exports.getAllPosts = async (req, res) => {
    try {
        const { page, limit, skip } = paginate(req.query);

        const [posts, total] = await Promise.all([
            Post.find()
                .populate("userId", "name email profile_picture")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Post.countDocuments(),
        ]);

        const postIds = posts.map((p) => p._id);

        const [likeCounts, commentCounts] = await Promise.all([
            Like.aggregate([
                { $match: { targetId: { $in: postIds }, targetType: "Post" } },
                { $group: { _id: "$targetId", count: { $sum: 1 } } },
            ]),
            Comment.aggregate([
                { $match: { targetId: { $in: postIds }, targetType: "Post" } },
                { $group: { _id: "$targetId", count: { $sum: 1 } } },
            ]),
        ]);

        const likeMap    = Object.fromEntries(likeCounts.map((l) => [l._id.toString(), l.count]));
        const commentMap = Object.fromEntries(commentCounts.map((c) => [c._id.toString(), c.count]));

        const enriched = posts.map((p) => ({
            ...p.toObject(),
            likesCount:    likeMap[p._id.toString()]    || 0,
            commentsCount: commentMap[p._id.toString()] || 0,
        }));

        res.status(200).json({
            success: true,
            message: "Posts fetched successfully",
            posts: enriched,
            pagination: paginationMeta(total, page, limit),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Blogs ────────────────────────────────────────────────────────────────────

exports.getAllBlogs = async (req, res) => {
    try {
        const { page, limit, skip } = paginate(req.query);

        const [blogs, total] = await Promise.all([
            Blog.find()
                .populate("userId", "name email profile_picture")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Blog.countDocuments(),
        ]);

        res.status(200).json({
            success: true,
            message: "Blogs fetched successfully",
            blogs,
            pagination: paginationMeta(total, page, limit),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Comments ─────────────────────────────────────────────────────────────────

exports.getAllComments = async (req, res) => {
    try {
        const { page, limit, skip } = paginate(req.query);
        const filter = {};
        if (req.query.targetType) filter.targetType = req.query.targetType;

        const [comments, total] = await Promise.all([
            Comment.find(filter)
                .populate("userId", "name email profile_picture")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Comment.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            message: "Comments fetched successfully",
            comments,
            pagination: paginationMeta(total, page, limit),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Tasks ────────────────────────────────────────────────────────────────────

exports.getAllTasks = async (req, res) => {
    try {
        const { page, limit, skip } = paginate(req.query);
        const filter = {};
        if (req.query.is_custom !== undefined) filter.is_custom = req.query.is_custom === "true";

        const [tasks, total] = await Promise.all([
            Task.find(filter)
                .populate("userId", "name email")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Task.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            message: "Tasks fetched successfully",
            tasks,
            pagination: paginationMeta(total, page, limit),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Categories ───────────────────────────────────────────────────────────────

exports.getAllCategories = async (req, res) => {
    try {
        const categories = await Category.find().sort({ name: 1 });
        res.status(200).json({
            success: true,
            message: "Categories fetched successfully",
            categories,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Milestones ───────────────────────────────────────────────────────────────

exports.getAllMilestones = async (req, res) => {
    try {
        const { page, limit, skip } = paginate(req.query);

        const [milestones, total] = await Promise.all([
            Milestone.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
            Milestone.countDocuments(),
        ]);

        res.status(200).json({
            success: true,
            message: "Milestones fetched successfully",
            milestones,
            pagination: paginationMeta(total, page, limit),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── User Milestones ──────────────────────────────────────────────────────────

exports.getAllUserMilestones = async (req, res) => {
    try {
        const { page, limit, skip } = paginate(req.query);

        const [userMilestones, total] = await Promise.all([
            UserMilestone.find()
                .populate("userId",      "name email profile_picture")
                .populate("milestoneId", "title description badge_image")
                .sort({ achieved_at: -1 })
                .skip(skip)
                .limit(limit),
            UserMilestone.countDocuments(),
        ]);

        res.status(200).json({
            success: true,
            message: "User milestones fetched successfully",
            userMilestones,
            pagination: paginationMeta(total, page, limit),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Smoke-Free Milestones ────────────────────────────────────────────────────

exports.getAllSmokeFreeMilestones = async (req, res) => {
    try {
        const { page, limit, skip } = paginate(req.query);

        const [milestones, total] = await Promise.all([
            SmokeFreeMilestone.find().sort({ sort_order: 1 }).skip(skip).limit(limit),
            SmokeFreeMilestone.countDocuments(),
        ]);

        res.status(200).json({
            success: true,
            message: "Smoke-free milestones fetched successfully",
            milestones,
            pagination: paginationMeta(total, page, limit),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── FAQs ─────────────────────────────────────────────────────────────────────

exports.getAllFaqs = async (req, res) => {
    try {
        const { page, limit, skip } = paginate(req.query);
        const filter = {};
        if (req.query.is_active !== undefined) filter.is_active = req.query.is_active === "true";

        const [faqs, total] = await Promise.all([
            Faq.find(filter)
                .populate("categoryId", "name")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Faq.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            message: "FAQs fetched successfully",
            faqs,
            pagination: paginationMeta(total, page, limit),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Feedback ─────────────────────────────────────────────────────────────────

exports.getAllFeedback = async (req, res) => {
    try {
        const { page, limit, skip } = paginate(req.query);

        const [feedback, total] = await Promise.all([
            Feedback.find()
                .populate("userId", "name email profile_picture")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Feedback.countDocuments(),
        ]);

        res.status(200).json({
            success: true,
            message: "Feedback fetched successfully",
            feedback,
            pagination: paginationMeta(total, page, limit),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Contacts ─────────────────────────────────────────────────────────────────

exports.getAllContacts = async (req, res) => {
    try {
        const { page, limit, skip } = paginate(req.query);
        const filter = {};
        if (req.query.status) filter.status = req.query.status;

        const [contacts, total] = await Promise.all([
            Contact.find(filter)
                .populate("userId", "name email profile_picture")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Contact.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            message: "Contacts fetched successfully",
            contacts,
            pagination: paginationMeta(total, page, limit),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Chats ────────────────────────────────────────────────────────────────────

exports.getAllChats = async (req, res) => {
    try {
        const { page, limit, skip } = paginate(req.query);

        const [chats, total] = await Promise.all([
            Chat.find()
                .populate("user", "name email profile_picture")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Chat.countDocuments(),
        ]);

        res.status(200).json({
            success: true,
            message: "Chats fetched successfully",
            chats,
            pagination: paginationMeta(total, page, limit),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Messages ─────────────────────────────────────────────────────────────────

exports.getAllMessages = async (req, res) => {
    try {
        const { page, limit, skip } = paginate(req.query);
        const filter = {};
        if (req.query.chatId) filter.chat = req.query.chatId;

        const [messages, total] = await Promise.all([
            Message.find(filter)
                .populate("chat", "title")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Message.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            message: "Messages fetched successfully",
            messages,
            pagination: paginationMeta(total, page, limit),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Motivational Tips ────────────────────────────────────────────────────────

exports.getAllMotivationalTips = async (req, res) => {
    try {
        const { page, limit, skip } = paginate(req.query);
        const filter = {};
        if (req.query.is_active !== undefined) filter.is_active = req.query.is_active === "true";
        if (req.query.category) filter.category = req.query.category;

        const [tips, total] = await Promise.all([
            MotivationalTip.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
            MotivationalTip.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            message: "Motivational tips fetched successfully",
            tips,
            pagination: paginationMeta(total, page, limit),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Quick Wins ───────────────────────────────────────────────────────────────

exports.getAllQuickWins = async (req, res) => {
    try {
        const { page, limit, skip } = paginate(req.query);
        const filter = {};
        if (req.query.is_active !== undefined) filter.is_active = req.query.is_active === "true";

        const [quickWins, total] = await Promise.all([
            QuickWin.find(filter).sort({ sort_order: 1, createdAt: -1 }).skip(skip).limit(limit),
            QuickWin.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            message: "Quick wins fetched successfully",
            quickWins,
            pagination: paginationMeta(total, page, limit),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Health Body ──────────────────────────────────────────────────────────────

exports.getAllHealthBody = async (req, res) => {
    try {
        const { page, limit, skip } = paginate(req.query);
        const filter = {};
        if (req.query.is_active !== undefined) filter.is_active = req.query.is_active === "true";
        if (req.query.category)  filter.category = req.query.category;

        const [items, total] = await Promise.all([
            HealthBody.find(filter).sort({ sort_order: 1, createdAt: -1 }).skip(skip).limit(limit),
            HealthBody.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            message: "Health body items fetched successfully",
            healthBody: items,
            pagination: paginationMeta(total, page, limit),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Notifications ────────────────────────────────────────────────────────────

exports.getAllNotifications = async (req, res) => {
    try {
        const { page, limit, skip } = paginate(req.query);
        const filter = {};
        if (req.query.status) filter.status = req.query.status;
        if (req.query.userId) filter.userId = req.query.userId;

        const [notifications, total] = await Promise.all([
            Notification.find(filter)
                .populate("userId", "name email profile_picture")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Notification.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            message: "Notifications fetched successfully",
            notifications,
            pagination: paginationMeta(total, page, limit),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Challenge Templates ──────────────────────────────────────────────────────

exports.getAllTemplates = async (req, res) => {
    try {
        const { page, limit, skip } = paginate(req.query);
        const filter = {};
        if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === "true";

        const [templates, total] = await Promise.all([
            Template.find(filter)
                .populate("category",  "name")
                .populate("createdBy", "name email")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Template.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            message: "Templates fetched successfully",
            templates,
            pagination: paginationMeta(total, page, limit),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Challenges ───────────────────────────────────────────────────────────────

exports.getAllChallenges = async (req, res) => {
    try {
        const { page, limit, skip } = paginate(req.query);
        const filter = {};
        if (req.query.status)           filter.status           = req.query.status;
        if (req.query.moderationStatus) filter.moderationStatus = req.query.moderationStatus;
        if (req.query.mode)             filter.mode             = req.query.mode;

        const [challenges, total] = await Promise.all([
            Challenge.find(filter)
                .populate("createdBy", "name email profile_picture")
                .populate("winner",    "name email profile_picture")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Challenge.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            message: "Challenges fetched successfully",
            challenges: await enrichChallengesCreatorXp(challenges),
            pagination: paginationMeta(total, page, limit),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Challenge Participants ───────────────────────────────────────────────────

exports.getAllChallengeParticipants = async (req, res) => {
    try {
        const { page, limit, skip } = paginate(req.query);
        const filter = {};
        if (req.query.challengeId)   filter.challengeId   = req.query.challengeId;
        if (req.query.inviteStatus)  filter.inviteStatus  = req.query.inviteStatus;
        if (req.query.role)          filter.role          = req.query.role;

        const [participants, total] = await Promise.all([
            ChallengeParticipant.find(filter)
                .populate("challengeId", "title status mode")
                .populate("userId",      "name email profile_picture")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            ChallengeParticipant.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            message: "Challenge participants fetched successfully",
            participants,
            pagination: paginationMeta(total, page, limit),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Challenge Task Assignments ───────────────────────────────────────────────

exports.getAllChallengeTaskAssignments = async (req, res) => {
    try {
        const { page, limit, skip } = paginate(req.query);
        const filter = {};
        if (req.query.challengeId) filter.challengeId = req.query.challengeId;
        if (req.query.status)      filter.status      = req.query.status;

        const [assignments, total] = await Promise.all([
            ChallengeTaskAssignment.find(filter)
                .populate("challengeId", "title status")
                .populate("assignedBy",  "name email")
                .populate("assignedTo",  "name email")
                .populate("taskId",      "title xps_points")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            ChallengeTaskAssignment.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            message: "Challenge task assignments fetched successfully",
            assignments,
            pagination: paginationMeta(total, page, limit),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Competitions ─────────────────────────────────────────────────────────────

exports.getAllCompetitions = async (req, res) => {
    try {
        const { page, limit, skip } = paginate(req.query);
        const filter = {};
        if (req.query.status) filter.status = req.query.status;

        const [competitions, total] = await Promise.all([
            Competition.find(filter)
                .populate("createdBy",     "name email profile_picture")
                .populate("players.user",  "name email profile_picture")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Competition.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            message: "Competitions fetched successfully",
            competitions,
            pagination: paginationMeta(total, page, limit),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Badge Templates ──────────────────────────────────────────────────────────

exports.getAllBadgeTemplates = async (req, res) => {
    try {
        const { page, limit, skip } = paginate(req.query);
        const filter = {};
        if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === "true";
        if (req.query.type)                   filter.type     = req.query.type;

        const [badgeTemplates, total] = await Promise.all([
            BadgeTemplate.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
            BadgeTemplate.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            message: "Badge templates fetched successfully",
            badgeTemplates,
            pagination: paginationMeta(total, page, limit),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── User Badges ──────────────────────────────────────────────────────────────

exports.getAllUserBadges = async (req, res) => {
    try {
        const { page, limit, skip } = paginate(req.query);
        const filter = {};
        if (req.query.userId) filter.userId = req.query.userId;

        const [badges, total] = await Promise.all([
            Badges.find(filter)
                .populate("userId", "name email profile_picture")
                .populate("badge",  "title imageUrl type")
                .sort({ earnedAt: -1 })
                .skip(skip)
                .limit(limit),
            Badges.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            message: "User badges fetched successfully",
            badges,
            pagination: paginationMeta(total, page, limit),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Post Reports ─────────────────────────────────────────────────────────────

exports.getAllPostReports = async (req, res) => {
    try {
        const { page, limit, skip } = paginate(req.query);

        const [reports, total] = await Promise.all([
            PostReport.find()
                .populate("userId", "name email profile_picture")
                .populate("postId", "description media")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            PostReport.countDocuments(),
        ]);

        res.status(200).json({
            success: true,
            message: "Post reports fetched successfully",
            reports,
            pagination: paginationMeta(total, page, limit),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Post Hides ───────────────────────────────────────────────────────────────

exports.getAllPostHides = async (req, res) => {
    try {
        const { page, limit, skip } = paginate(req.query);

        const [hides, total] = await Promise.all([
            PostHide.find()
                .populate("userId", "name email profile_picture")
                .populate("postId", "description media")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            PostHide.countDocuments(),
        ]);

        res.status(200).json({
            success: true,
            message: "Post hides fetched successfully",
            hides,
            pagination: paginationMeta(total, page, limit),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── User Progress ────────────────────────────────────────────────────────────

exports.getAllUserProgress = async (req, res) => {
    try {
        const { page, limit, skip } = paginate(req.query);

        const [progress, total] = await Promise.all([
            UserProgress.find()
                .populate("userId", "name email profile_picture")
                .sort({ xp: -1 })
                .skip(skip)
                .limit(limit),
            UserProgress.countDocuments(),
        ]);

        res.status(200).json({
            success: true,
            message: "User progress fetched successfully",
            progress,
            pagination: paginationMeta(total, page, limit),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Daily Boards ─────────────────────────────────────────────────────────────

exports.getAllDailyBoards = async (req, res) => {
    try {
        const { page, limit, skip } = paginate(req.query);
        const filter = {};
        if (req.query.userId) filter.userId = req.query.userId;
        if (req.query.date)   filter.date   = new Date(req.query.date);

        const [boards, total] = await Promise.all([
            DailyBoard.find(filter)
                .populate("userId", "name email profile_picture")
                .sort({ date: -1 })
                .skip(skip)
                .limit(limit),
            DailyBoard.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            message: "Daily boards fetched successfully",
            boards,
            pagination: paginationMeta(total, page, limit),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Monthly Boards ───────────────────────────────────────────────────────────

exports.getAllMonthlyBoards = async (req, res) => {
    try {
        const { page, limit, skip } = paginate(req.query);
        const filter = {};
        if (req.query.userId) filter.userId = req.query.userId;
        if (req.query.month)  filter.month  = parseInt(req.query.month);
        if (req.query.year)   filter.year   = parseInt(req.query.year);

        const [boards, total] = await Promise.all([
            MonthlyBoard.find(filter)
                .populate("userId", "name email profile_picture")
                .sort({ year: -1, month: -1 })
                .skip(skip)
                .limit(limit),
            MonthlyBoard.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            message: "Monthly boards fetched successfully",
            boards,
            pagination: paginationMeta(total, page, limit),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Legacy Boards ────────────────────────────────────────────────────────────

exports.getAllBoards = async (req, res) => {
    try {
        const { page, limit, skip } = paginate(req.query);
        const filter = {};
        if (req.query.userId) filter.userId = req.query.userId;

        const [boards, total] = await Promise.all([
            Board.find(filter)
                .populate("userId",      "name email profile_picture")
                .populate("competition", "status numberOfPlayers days")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Board.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            message: "Boards fetched successfully",
            boards,
            pagination: paginationMeta(total, page, limit),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Challenge Full Detail ────────────────────────────────────────────────────

exports.getChallengeDetail = async (req, res) => {
    try {
        const challenge = await Challenge.findById(req.params.id)
            .populate("createdBy", "name email profile_picture")
            .populate("templateId", "title description")
            .populate("winner",    "name email profile_picture");

        if (!challenge) {
            return res.status(404).json({ success: false, message: "Challenge not found" });
        }

        const [participants, taskAssignments, enrichedChallenge] = await Promise.all([
            ChallengeParticipant.find({ challengeId: challenge._id })
                .populate("userId", "name email profile_picture"),
            ChallengeTaskAssignment.find({ challengeId: challenge._id })
                .populate("assignedBy", "name email profile_picture")
                .populate("assignedTo", "name email profile_picture")
                .populate("taskId",     "title xps_points"),
            enrichChallengeCreatorXp(challenge),
        ]);

        res.status(200).json({
            success: true,
            message: "Challenge detail fetched successfully",
            challenge: enrichedChallenge,
            participants,
            taskAssignments,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── User Detail by ID ────────────────────────────────────────────────────────

exports.getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select("-password");
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const [progress, badges, milestones, postCount, challengeCount] = await Promise.all([
            UserProgress.findOne({ userId: user._id }),
            Badges.find({ userId: user._id }).populate("badge", "title imageUrl type"),
            UserMilestone.find({ userId: user._id }).populate("milestoneId", "title description badge_image"),
            Post.countDocuments({ userId: user._id }),
            Challenge.countDocuments({ createdBy: user._id }),
        ]);

        res.status(200).json({
            success: true,
            message: "User detail fetched successfully",
            user,
            progress,
            badges,
            milestones,
            stats: {
                postCount,
                challengeCount,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Post Likes & Comments ────────────────────────────────────────────────────

exports.getPostLikesAndComments = async (req, res) => {
    try {
        const { id: postId } = req.params;
        const { page, limit, skip } = paginate(req.query);

        const post = await Post.findById(postId).populate("userId", "name email profile_picture");
        if (!post) {
            return res.status(404).json({ success: false, message: "Post not found" });
        }

        const [likes, comments, likeCount, commentCount] = await Promise.all([
            Like.find({ targetId: postId, targetType: "Post" })
                .populate("userId", "name email profile_picture")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Comment.find({ targetId: postId, targetType: "Post" })
                .populate("userId", "name email profile_picture")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Like.countDocuments({ targetId: postId, targetType: "Post" }),
            Comment.countDocuments({ targetId: postId, targetType: "Post" }),
        ]);

        res.status(200).json({
            success: true,
            message: "Post likes and comments fetched successfully",
            post,
            likes: {
                total: likeCount,
                data: likes,
                pagination: paginationMeta(likeCount, page, limit),
            },
            comments: {
                total: commentCount,
                data: comments,
                pagination: paginationMeta(commentCount, page, limit),
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ══════════════════════════════════════════════════════════════════════════════
// USER MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

exports.toggleUserStatus = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select("-password");
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        if (user.role === "admin") return res.status(400).json({ success: false, message: "Cannot ban another admin" });
        user.is_active = !user.is_active;
        await user.save();
        res.status(200).json({ success: true, message: `User ${user.is_active ? "activated" : "banned"} successfully`, user });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.changeUserRole = async (req, res) => {
    try {
        const { role } = req.body;
        if (!["user", "admin"].includes(role)) return res.status(400).json({ success: false, message: "role must be 'user' or 'admin'" });
        const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select("-password");
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        res.status(200).json({ success: true, message: "User role updated successfully", user });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        const userId = user._id;
        const [postIds, blogIds, chatIds, createdChallengeIds, createdCompetitionIds] = await Promise.all([
            Post.distinct("_id", { userId }),
            Blog.distinct("_id", { userId }),
            Chat.distinct("_id", { user: userId }),
            Challenge.distinct("_id", { createdBy: userId }),
            Competition.distinct("_id", { createdBy: userId }),
        ]);
        await Promise.all([
            Otp.deleteMany({ userId }),
            UserProgress.deleteMany({ userId }),
            UserOverview.deleteMany({ userId }),
            UserMilestone.deleteMany({ userId }),
            Badges.deleteMany({ userId }),
            PostHide.deleteMany({ userId }),
            PostReport.deleteMany({ userId }),
            Notification.deleteMany({ userId }),
            Contact.deleteMany({ userId }),
            Feedback.deleteMany({ userId }),
            Task.deleteMany({ userId }),
            MonthlyBoard.deleteMany({ userId }),
            Template.deleteMany({ createdBy: userId }),
            Chat.deleteMany({ user: userId }),
        ]);
        await Promise.all([
            Comment.deleteMany({ $or: [{ userId }, { targetType: "Post", targetId: { $in: postIds } }, { targetType: "Blog", targetId: { $in: blogIds } }] }),
            Like.deleteMany({ $or: [{ userId }, { targetType: "Post", targetId: { $in: postIds } }, { targetType: "Blog", targetId: { $in: blogIds } }] }),
            Post.deleteMany({ userId }),
            Blog.deleteMany({ userId }),
            Message.deleteMany({ chat: { $in: chatIds } }),
            DailyBoard.deleteMany({ $or: [{ userId }, { challengeId: { $in: createdChallengeIds } }] }),
            ChallengeParticipant.deleteMany({ $or: [{ userId }, { challengeId: { $in: createdChallengeIds } }] }),
            ChallengeTaskAssignment.deleteMany({ $or: [{ assignedBy: userId }, { assignedTo: userId }, { challengeId: { $in: createdChallengeIds } }] }),
            Board.deleteMany({ $or: [{ userId }, { competition: { $in: createdCompetitionIds } }] }),
        ]);
        await Promise.all([
            Challenge.deleteMany({ createdBy: userId }),
            Challenge.updateMany({ winner: userId }, { $unset: { winner: "" } }),
            Competition.deleteMany({ createdBy: userId }),
            Competition.updateMany({ "players.user": userId }, { $pull: { players: { user: userId } } }),
        ]);
        await User.findByIdAndDelete(userId);
        res.status(200).json({ success: true, message: "User and all associated data deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ══════════════════════════════════════════════════════════════════════════════
// CONTENT MODERATION
// ══════════════════════════════════════════════════════════════════════════════

exports.deletePost = async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ success: false, message: "Post not found" });
        await Promise.all([
            Like.deleteMany({ targetId: post._id, targetType: "Post" }),
            Comment.deleteMany({ targetId: post._id, targetType: "Post" }),
            PostHide.deleteMany({ postId: post._id }),
            PostReport.deleteMany({ postId: post._id }),
        ]);
        await Post.findByIdAndDelete(post._id);
        res.status(200).json({ success: true, message: "Post deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteBlog = async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);
        if (!blog) return res.status(404).json({ success: false, message: "Blog not found" });
        await Promise.all([
            Like.deleteMany({ targetId: blog._id, targetType: "Blog" }),
            Comment.deleteMany({ targetId: blog._id, targetType: "Blog" }),
        ]);
        await Blog.findByIdAndDelete(blog._id);
        res.status(200).json({ success: true, message: "Blog deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteComment = async (req, res) => {
    try {
        const comment = await Comment.findByIdAndDelete(req.params.id);
        if (!comment) return res.status(404).json({ success: false, message: "Comment not found" });
        res.status(200).json({ success: true, message: "Comment deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.resolvePostReport = async (req, res) => {
    try {
        const report = await PostReport.findById(req.params.id);
        if (!report) return res.status(404).json({ success: false, message: "Post report not found" });
        const { action } = req.body;
        if (action === "delete_post") {
            await Promise.all([
                Like.deleteMany({ targetId: report.postId, targetType: "Post" }),
                Comment.deleteMany({ targetId: report.postId, targetType: "Post" }),
                PostHide.deleteMany({ postId: report.postId }),
                PostReport.deleteMany({ postId: report.postId }),
            ]);
            await Post.findByIdAndDelete(report.postId);
            return res.status(200).json({ success: true, message: "Post report resolved and post deleted" });
        }
        await PostReport.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, message: "Post report dismissed successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.moderateChallenge = async (req, res) => {
    try {
        const { moderationStatus } = req.body;
        if (!["ok", "removed"].includes(moderationStatus)) return res.status(400).json({ success: false, message: "moderationStatus must be 'ok' or 'removed'" });
        const challenge = await Challenge.findByIdAndUpdate(req.params.id, { moderationStatus }, { new: true }).populate("createdBy", "name email");
        if (!challenge) return res.status(404).json({ success: false, message: "Challenge not found" });
        res.status(200).json({ success: true, message: "Challenge moderation status updated", challenge });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ══════════════════════════════════════════════════════════════════════════════
// CMS — FAQs
// ══════════════════════════════════════════════════════════════════════════════

exports.createFaq = async (req, res) => {
    try {
        const { question, answer, categoryId, is_active } = req.body;
        if (!question || !answer) return res.status(400).json({ success: false, message: "question and answer are required" });
        const faq = await Faq.create({ question, answer, categoryId, is_active });
        res.status(201).json({ success: true, message: "FAQ created successfully", faq });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateFaq = async (req, res) => {
    try {
        const { question, answer, categoryId, is_active } = req.body;
        const faq = await Faq.findByIdAndUpdate(req.params.id, { question, answer, categoryId, is_active }, { new: true });
        if (!faq) return res.status(404).json({ success: false, message: "FAQ not found" });
        res.status(200).json({ success: true, message: "FAQ updated successfully", faq });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteFaq = async (req, res) => {
    try {
        const faq = await Faq.findByIdAndDelete(req.params.id);
        if (!faq) return res.status(404).json({ success: false, message: "FAQ not found" });
        res.status(200).json({ success: true, message: "FAQ deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ══════════════════════════════════════════════════════════════════════════════
// CMS — Motivational Tips
// ══════════════════════════════════════════════════════════════════════════════

exports.createMotivationalTip = async (req, res) => {
    try {
        const { tip, category, tag, description, is_active, is_featured, is_fact_of_day, source, read_time } = req.body;
        if (!tip) return res.status(400).json({ success: false, message: "tip is required" });
        const motivationalTip = await MotivationalTip.create({ tip, category, tag, description, is_active, is_featured, is_fact_of_day, source, read_time });
        res.status(201).json({ success: true, message: "Motivational tip created successfully", motivationalTip });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateMotivationalTip = async (req, res) => {
    try {
        const { tip, category, tag, description, is_active, is_featured, is_fact_of_day, source, read_time } = req.body;
        const motivationalTip = await MotivationalTip.findByIdAndUpdate(req.params.id, { tip, category, tag, description, is_active, is_featured, is_fact_of_day, source, read_time }, { new: true });
        if (!motivationalTip) return res.status(404).json({ success: false, message: "Motivational tip not found" });
        res.status(200).json({ success: true, message: "Motivational tip updated successfully", motivationalTip });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteMotivationalTip = async (req, res) => {
    try {
        const tip = await MotivationalTip.findByIdAndDelete(req.params.id);
        if (!tip) return res.status(404).json({ success: false, message: "Motivational tip not found" });
        res.status(200).json({ success: true, message: "Motivational tip deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ══════════════════════════════════════════════════════════════════════════════
// CMS — Quick Wins
// ══════════════════════════════════════════════════════════════════════════════

exports.createQuickWin = async (req, res) => {
    try {
        const { title, description, read_time, icon, is_active, sort_order } = req.body;
        if (!title) return res.status(400).json({ success: false, message: "title is required" });
        const quickWin = await QuickWin.create({ title, description, read_time, icon, is_active, sort_order });
        res.status(201).json({ success: true, message: "Quick win created successfully", quickWin });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateQuickWin = async (req, res) => {
    try {
        const { title, description, read_time, icon, is_active, sort_order } = req.body;
        const quickWin = await QuickWin.findByIdAndUpdate(req.params.id, { title, description, read_time, icon, is_active, sort_order }, { new: true });
        if (!quickWin) return res.status(404).json({ success: false, message: "Quick win not found" });
        res.status(200).json({ success: true, message: "Quick win updated successfully", quickWin });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteQuickWin = async (req, res) => {
    try {
        const quickWin = await QuickWin.findByIdAndDelete(req.params.id);
        if (!quickWin) return res.status(404).json({ success: false, message: "Quick win not found" });
        res.status(200).json({ success: true, message: "Quick win deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ══════════════════════════════════════════════════════════════════════════════
// CMS — Health Body
// ══════════════════════════════════════════════════════════════════════════════

exports.createHealthBody = async (req, res) => {
    try {
        const { title, description, category, category_tag, icon, read_time, is_active, sort_order } = req.body;
        if (!title || !description || !category) return res.status(400).json({ success: false, message: "title, description, and category are required" });
        const healthBody = await HealthBody.create({ title, description, category, category_tag, icon, read_time, is_active, sort_order });
        res.status(201).json({ success: true, message: "Health body item created successfully", healthBody });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateHealthBody = async (req, res) => {
    try {
        const { title, description, category, category_tag, icon, read_time, is_active, sort_order } = req.body;
        const healthBody = await HealthBody.findByIdAndUpdate(req.params.id, { title, description, category, category_tag, icon, read_time, is_active, sort_order }, { new: true });
        if (!healthBody) return res.status(404).json({ success: false, message: "Health body item not found" });
        res.status(200).json({ success: true, message: "Health body item updated successfully", healthBody });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteHealthBody = async (req, res) => {
    try {
        const item = await HealthBody.findByIdAndDelete(req.params.id);
        if (!item) return res.status(404).json({ success: false, message: "Health body item not found" });
        res.status(200).json({ success: true, message: "Health body item deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ══════════════════════════════════════════════════════════════════════════════
// CMS — Challenge Templates
// ══════════════════════════════════════════════════════════════════════════════

exports.createTemplate = async (req, res) => {
    try {
        const { title, description, category, durationDays, boardSize, xpReward, isActive, isCustom } = req.body;
        if (!title) return res.status(400).json({ success: false, message: "title is required" });
        if (!category || !mongoose.Types.ObjectId.isValid(category)) return res.status(400).json({ success: false, message: "Valid category id is required" });
        if (durationDays !== undefined && durationDays < 1) return res.status(400).json({ success: false, message: "durationDays must be at least 1" });
        if (xpReward !== undefined && xpReward < 0) return res.status(400).json({ success: false, message: "xpReward cannot be negative" });
        const template = await Template.create({ title, description, category, durationDays, boardSize, xpReward, isActive, isCustom, createdBy: req.user.id });
        await template.populate("category", "name");
        res.status(201).json({ success: true, message: "Template created successfully", template });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateTemplate = async (req, res) => {
    try {
        const { title, description, category, durationDays, boardSize, xpReward, isActive, isCustom } = req.body;
        const template = await Template.findByIdAndUpdate(req.params.id, { title, description, category, durationDays, boardSize, xpReward, isActive, isCustom }, { new: true }).populate("category", "name");
        if (!template) return res.status(404).json({ success: false, message: "Template not found" });
        res.status(200).json({ success: true, message: "Template updated successfully", template });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteTemplate = async (req, res) => {
    try {
        const template = await Template.findByIdAndDelete(req.params.id);
        if (!template) return res.status(404).json({ success: false, message: "Template not found" });
        res.status(200).json({ success: true, message: "Template deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ══════════════════════════════════════════════════════════════════════════════
// CMS — Badge Templates
// ══════════════════════════════════════════════════════════════════════════════

exports.createBadgeTemplate = async (req, res) => {
    try {
        const { title, imageUrl, type, conditionValue, isActive } = req.body;
        if (!title || !imageUrl || !type || conditionValue === undefined) return res.status(400).json({ success: false, message: "title, imageUrl, type, and conditionValue are required" });
        const template = await BadgeTemplate.create({ title, imageUrl, type, conditionValue, isActive: isActive !== undefined ? isActive : true });
        res.status(201).json({ success: true, message: "Badge template created successfully", template });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateBadgeTemplate = async (req, res) => {
    try {
        const { title, imageUrl, type, conditionValue, isActive } = req.body;
        const template = await BadgeTemplate.findByIdAndUpdate(req.params.id, { title, imageUrl, type, conditionValue, isActive }, { new: true });
        if (!template) return res.status(404).json({ success: false, message: "Badge template not found" });
        res.status(200).json({ success: true, message: "Badge template updated successfully", template });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteBadgeTemplate = async (req, res) => {
    try {
        const template = await BadgeTemplate.findByIdAndDelete(req.params.id);
        if (!template) return res.status(404).json({ success: false, message: "Badge template not found" });
        res.status(200).json({ success: true, message: "Badge template deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ══════════════════════════════════════════════════════════════════════════════
// CMS — Categories
// ══════════════════════════════════════════════════════════════════════════════

exports.createCategory = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ success: false, message: "name is required" });
        const category = await Category.create({ name });
        res.status(201).json({ success: true, message: "Category created successfully", category });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateCategory = async (req, res) => {
    try {
        const { name } = req.body;
        const category = await Category.findByIdAndUpdate(req.params.id, { name }, { new: true });
        if (!category) return res.status(404).json({ success: false, message: "Category not found" });
        res.status(200).json({ success: true, message: "Category updated successfully", category });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteCategory = async (req, res) => {
    try {
        const category = await Category.findByIdAndDelete(req.params.id);
        if (!category) return res.status(404).json({ success: false, message: "Category not found" });
        res.status(200).json({ success: true, message: "Category deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ══════════════════════════════════════════════════════════════════════════════
// CMS — Milestones
// ══════════════════════════════════════════════════════════════════════════════

exports.createMilestone = async (req, res) => {
    try {
        const { title, description, badge_image } = req.body;
        if (!title) return res.status(400).json({ success: false, message: "title is required" });
        const milestone = await Milestone.create({ title, description, badge_image });
        res.status(201).json({ success: true, message: "Milestone created successfully", milestone });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateMilestone = async (req, res) => {
    try {
        const { title, description, badge_image } = req.body;
        const milestone = await Milestone.findByIdAndUpdate(req.params.id, { title, description, badge_image }, { new: true });
        if (!milestone) return res.status(404).json({ success: false, message: "Milestone not found" });
        res.status(200).json({ success: true, message: "Milestone updated successfully", milestone });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteMilestone = async (req, res) => {
    try {
        const milestone = await Milestone.findByIdAndDelete(req.params.id);
        if (!milestone) return res.status(404).json({ success: false, message: "Milestone not found" });
        res.status(200).json({ success: true, message: "Milestone deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ══════════════════════════════════════════════════════════════════════════════
// CMS — Smoke-Free Milestones
// ══════════════════════════════════════════════════════════════════════════════

exports.createSmokeFreeMilestone = async (req, res) => {
    try {
        const { title, description, duration_minutes, icon, badge_image, xp_reward, is_active, sort_order } = req.body;
        if (!title || duration_minutes === undefined) return res.status(400).json({ success: false, message: "title and duration_minutes are required" });
        const milestone = await SmokeFreeMilestone.create({ title, description, duration_minutes, icon, badge_image, xp_reward, is_active, sort_order });
        res.status(201).json({ success: true, message: "Smoke-free milestone created successfully", milestone });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateSmokeFreeMilestone = async (req, res) => {
    try {
        const { title, description, duration_minutes, icon, badge_image, xp_reward, is_active, sort_order } = req.body;
        const milestone = await SmokeFreeMilestone.findByIdAndUpdate(req.params.id, { title, description, duration_minutes, icon, badge_image, xp_reward, is_active, sort_order }, { new: true });
        if (!milestone) return res.status(404).json({ success: false, message: "Smoke-free milestone not found" });
        res.status(200).json({ success: true, message: "Smoke-free milestone updated successfully", milestone });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteSmokeFreeMilestone = async (req, res) => {
    try {
        const milestone = await SmokeFreeMilestone.findByIdAndDelete(req.params.id);
        if (!milestone) return res.status(404).json({ success: false, message: "Smoke-free milestone not found" });
        res.status(200).json({ success: true, message: "Smoke-free milestone deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ══════════════════════════════════════════════════════════════════════════════
// CONTACTS — Respond
// ══════════════════════════════════════════════════════════════════════════════

exports.respondToContact = async (req, res) => {
    try {
        const { response } = req.body;
        if (!response) return res.status(400).json({ success: false, message: "response is required" });
        const contact = await Contact.findByIdAndUpdate(req.params.id, { response, status: "resolved" }, { new: true }).populate("userId", "name email profile_picture");
        if (!contact) return res.status(404).json({ success: false, message: "Contact not found" });
        res.status(200).json({ success: true, message: "Contact responded to successfully", contact });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS — Admin Send
// ══════════════════════════════════════════════════════════════════════════════

exports.sendNotification = async (req, res) => {
    try {
        const { userIds: rawUserIds, title, body, data, sendToAll } = req.body;
        if (!title || !body) return res.status(400).json({ success: false, message: "title and body are required" });
        if (!sendToAll && !rawUserIds) return res.status(400).json({ success: false, message: "Provide sendToAll or userIds" });

        let mode, userIds;
        if (sendToAll) {
            mode = "broadcast";
        } else if (Array.isArray(rawUserIds)) {
            if (rawUserIds.length === 0) return res.status(400).json({ success: false, message: "userIds must not be empty" });
            mode = "multi";
            userIds = rawUserIds;
        } else {
            if (!mongoose.Types.ObjectId.isValid(rawUserIds)) return res.status(400).json({ success: false, message: "Invalid user ID" });
            mode = "single";
            userIds = [rawUserIds];
        }

        const userFilter = mode === "broadcast"
            ? { fcm_token: { $exists: true, $ne: "" } }
            : { _id: { $in: userIds }, fcm_token: { $exists: true, $ne: "" } };

        const users = await User.find(userFilter).select("_id fcm_token");
        if (users.length === 0) return res.status(404).json({ success: false, message: "No users with FCM tokens found" });

        const fcmTokens = users.map((u) => u.fcm_token).filter(Boolean);
        const savedNotifications = await Notification.insertMany(users.map((u) => ({ userId: u._id, title, body, data: data || {} })));

        const message = {
            notification: { title, body },
            data: {
                broadcastId: Date.now().toString(),
                clickAction: "FLUTTER_NOTIFICATION_CLICK",
                ...(data ? Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])) : {}),
            },
            tokens: fcmTokens,
        };

        try {
            const fcmResponse = await firebaseAdmin.messaging().sendEachForMulticast(message);
            await Notification.updateMany(
                { _id: { $in: savedNotifications.map((n) => n._id) } },
                { status: fcmResponse.successCount > 0 ? "sent" : "failed", sentAt: new Date(), ...(fcmResponse.failureCount > 0 && { failureReason: `${fcmResponse.failureCount} device(s) failed` }) }
            );
            res.status(201).json({ success: true, message: "Notification sent successfully", usersTargeted: users.length, devicesTargeted: fcmTokens.length, successCount: fcmResponse.successCount, failureCount: fcmResponse.failureCount });
        } catch (fcmError) {
            await Notification.updateMany({ _id: { $in: savedNotifications.map((n) => n._id) } }, { status: "failed", failureReason: fcmError.message });
            res.status(500).json({ success: false, message: "Failed to send notification via FCM" });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
