const express     = require("express");
const router      = express.Router();
const verifyAdmin = require("../middleware/verifyAdmin");
const admin       = require("../controllers/adminController");

// All routes require admin token
router.use(verifyAdmin);

// ─── Dashboard ────────────────────────────────────────────────────────────────
router.get("/dashboard/stats",                    admin.getDashboardStats);

// ─── Users ────────────────────────────────────────────────────────────────────
router.get("/users",                              admin.getAllUsers);
router.get("/users/:id",                          admin.getUserById);
router.patch("/users/:id/toggle-status",          admin.toggleUserStatus);
router.patch("/users/:id/change-role",            admin.changeUserRole);
router.delete("/users/:id",                       admin.deleteUser);

// ─── Posts & Blogs ────────────────────────────────────────────────────────────
router.get("/posts",                              admin.getAllPosts);
router.get("/posts/:id/likes-comments",           admin.getPostLikesAndComments);
router.delete("/posts/:id",                       admin.deletePost);
router.get("/blogs",                              admin.getAllBlogs);
router.delete("/blogs/:id",                       admin.deleteBlog);
router.get("/comments",                           admin.getAllComments);
router.delete("/comments/:id",                    admin.deleteComment);

// ─── Tasks & Categories ───────────────────────────────────────────────────────
router.get("/tasks",                              admin.getAllTasks);
router.get("/categories",                         admin.getAllCategories);
router.post("/categories",                        admin.createCategory);
router.put("/categories/:id",                     admin.updateCategory);
router.delete("/categories/:id",                  admin.deleteCategory);

// ─── Milestones ───────────────────────────────────────────────────────────────
router.get("/milestones",                         admin.getAllMilestones);
router.post("/milestones",                        admin.createMilestone);
router.put("/milestones/:id",                     admin.updateMilestone);
router.delete("/milestones/:id",                  admin.deleteMilestone);
router.get("/milestones/user",                    admin.getAllUserMilestones);
router.get("/milestones/smoke-free",              admin.getAllSmokeFreeMilestones);
router.post("/milestones/smoke-free",             admin.createSmokeFreeMilestone);
router.put("/milestones/smoke-free/:id",          admin.updateSmokeFreeMilestone);
router.delete("/milestones/smoke-free/:id",       admin.deleteSmokeFreeMilestone);

// ─── FAQs ─────────────────────────────────────────────────────────────────────
router.get("/faqs",                               admin.getAllFaqs);
router.post("/faqs",                              admin.createFaq);
router.put("/faqs/:id",                           admin.updateFaq);
router.delete("/faqs/:id",                        admin.deleteFaq);

// ─── Motivational Tips ────────────────────────────────────────────────────────
router.get("/motivational-tips",                  admin.getAllMotivationalTips);
router.post("/motivational-tips",                 admin.createMotivationalTip);
router.put("/motivational-tips/:id",              admin.updateMotivationalTip);
router.delete("/motivational-tips/:id",           admin.deleteMotivationalTip);

// ─── Quick Wins ───────────────────────────────────────────────────────────────
router.get("/quick-wins",                         admin.getAllQuickWins);
router.post("/quick-wins",                        admin.createQuickWin);
router.put("/quick-wins/:id",                     admin.updateQuickWin);
router.delete("/quick-wins/:id",                  admin.deleteQuickWin);

// ─── Health Body ──────────────────────────────────────────────────────────────
router.get("/health-body",                        admin.getAllHealthBody);
router.post("/health-body",                       admin.createHealthBody);
router.put("/health-body/:id",                    admin.updateHealthBody);
router.delete("/health-body/:id",                 admin.deleteHealthBody);

// ─── Feedback & Contacts ──────────────────────────────────────────────────────
router.get("/feedback",                           admin.getAllFeedback);
router.get("/contacts",                           admin.getAllContacts);
router.patch("/contacts/:id/respond",             admin.respondToContact);

// ─── Notifications ────────────────────────────────────────────────────────────
router.get("/notifications",                      admin.getAllNotifications);
router.post("/notifications/send",                admin.sendNotification);

// ─── Chats & Messages ─────────────────────────────────────────────────────────
router.get("/chats",                              admin.getAllChats);
router.get("/messages",                           admin.getAllMessages);

// ─── Challenge Templates ──────────────────────────────────────────────────────
router.get("/challenge-templates",                admin.getAllTemplates);
router.post("/challenge-templates",               admin.createTemplate);
router.put("/challenge-templates/:id",            admin.updateTemplate);
router.delete("/challenge-templates/:id",         admin.deleteTemplate);

// ─── Challenges ───────────────────────────────────────────────────────────────
router.get("/challenges",                         admin.getAllChallenges);
router.get("/challenges/participants",            admin.getAllChallengeParticipants);
router.get("/challenges/task-assignments",        admin.getAllChallengeTaskAssignments);
router.get("/challenges/:id",                     admin.getChallengeDetail);
router.patch("/challenges/:id/moderate",          admin.moderateChallenge);

// ─── Competitions ─────────────────────────────────────────────────────────────
router.get("/competitions",                       admin.getAllCompetitions);

// ─── Badges ───────────────────────────────────────────────────────────────────
router.get("/badges/templates",                   admin.getAllBadgeTemplates);
router.post("/badges/templates",                  admin.createBadgeTemplate);
router.put("/badges/templates/:id",               admin.updateBadgeTemplate);
router.delete("/badges/templates/:id",            admin.deleteBadgeTemplate);
router.get("/badges/user",                        admin.getAllUserBadges);

// ─── Moderation ───────────────────────────────────────────────────────────────
router.get("/post-reports",                       admin.getAllPostReports);
router.patch("/post-reports/:id/resolve",         admin.resolvePostReport);
router.get("/post-hides",                         admin.getAllPostHides);

// ─── Progress & Boards ────────────────────────────────────────────────────────
router.get("/user-progress",                      admin.getAllUserProgress);
router.get("/boards/daily",                       admin.getAllDailyBoards);
router.get("/boards/monthly",                     admin.getAllMonthlyBoards);
router.get("/boards",                             admin.getAllBoards);

module.exports = router;
