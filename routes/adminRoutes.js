const express     = require("express");
const router      = express.Router();
const verifyAdmin = require("../middleware/verifyAdmin");
const admin       = require("../controllers/adminController");
const analytics   = require("../controllers/adminAnalyticsController");

// All routes require admin token
router.use(verifyAdmin);

// ─── Dashboard ────────────────────────────────────────────────────────────────
router.get("/dashboard/stats",                    admin.getDashboardStats);

// ─── Analytics ────────────────────────────────────────────────────────────────
router.get("/analytics/overview",                 analytics.getOverview);
router.get("/analytics/user-growth",              analytics.getUserGrowth);
router.get("/analytics/health-impact",            analytics.getHealthImpact);
router.get("/analytics/challenges",               analytics.getChallengeAnalytics);
router.get("/analytics/content",                  analytics.getContentAnalytics);

// ─── Users ────────────────────────────────────────────────────────────────────
router.get("/users",                              admin.getAllUsers);
router.get("/users/:id",                          admin.getUserById);
router.patch("/users/:id/toggle-status",          admin.toggleUserStatus);
router.patch("/users/:id/change-role",            admin.changeUserRole);
router.delete("/users/:id",                       admin.deleteUser);

// ─── Posts ────────────────────────────────────────────────────────────────────
router.get("/posts",                              admin.getAllPosts);
router.get("/posts/:id/likes-comments",           admin.getPostLikesAndComments);
router.delete("/posts/:id",                       admin.deletePost);
router.delete("/comments/:id",                    admin.deleteComment);

// ─── FAQs ─────────────────────────────────────────────────────────────────────
router.get("/faqs",                               admin.getAllFaqs);
router.post("/faqs",                              admin.createFaq);
router.put("/faqs/:id",                           admin.updateFaq);
router.delete("/faqs/:id",                        admin.deleteFaq);

// ─── Milestones ───────────────────────────────────────────────────────────────
router.get("/milestones",                         admin.getAllMilestones);
router.post("/milestones",                        admin.createMilestone);
router.delete("/milestones/:id",                  admin.deleteMilestone);

// ─── Feedback & Contacts ──────────────────────────────────────────────────────
router.get("/feedback",                           admin.getAllFeedback);
router.get("/contacts",                           admin.getAllContacts);
router.patch("/contacts/:id/respond",             admin.respondToContact);

// ─── Notifications ────────────────────────────────────────────────────────────
router.get("/notifications",                      admin.getAllNotifications);
router.post("/notifications/send",                admin.sendNotification);

// ─── Challenge Templates ──────────────────────────────────────────────────────
router.get("/challenge-templates",                admin.getAllTemplates);

// ─── Challenges ───────────────────────────────────────────────────────────────
router.get("/challenges",                         admin.getAllChallenges);
router.get("/challenges/:id",                     admin.getChallengeDetail);
router.patch("/challenges/:id/moderate",          admin.moderateChallenge);

// ─── Moderation ───────────────────────────────────────────────────────────────
router.get("/post-reports",                       admin.getAllPostReports);
router.patch("/post-reports/:id/resolve",         admin.resolvePostReport);

module.exports = router;
