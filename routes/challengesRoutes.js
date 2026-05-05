const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const challengesController = require("../controllers/challengesController");

// User routes - all require authentication for these

// 1. Create Challenge
router.post("/create", verifyToken, challengesController.createChallenge);

// 2. Invite Players
router.post("/:id/invite", verifyToken, challengesController.invitePlayers);

// 3. Get My Invites
router.get("/invites", verifyToken, challengesController.getMyInvites);

// 4. Get Challenge Detail (before accepting)
router.get("/:id/detail", verifyToken, challengesController.getChallengeDetail);

// 5. Respond to Invite (Accept / Decline)
router.post("/:id/respond", verifyToken, challengesController.respondToInvite);

// 6. Waiting Room - Player View
router.get("/:id/waiting-room", verifyToken, challengesController.getWaitingRoom);

// 7. Creator Monitor
router.get("/:id/monitor", verifyToken, challengesController.getCreatorMonitor);

// 8. Remind a Pending Invitee
router.post("/:id/remind", verifyToken, challengesController.remindInvitee);

// 9. Force-Start Challenge
router.post("/:id/start", verifyToken, challengesController.startChallenge);

// 10. Cancel Challenge
router.post("/:id/cancel", verifyToken, challengesController.cancelChallenge);

// 11. My Challenges Hub (Ongoing, Created, Completed)
router.get("/my", verifyToken, challengesController.getMyChallenges);

// Match History
router.get("/history", verifyToken, challengesController.getMatchHistory);

// 12. Log Progress
router.post("/:id/log-progress", verifyToken, challengesController.logProgress);

// 13. Live Leaderboard
router.get("/:id/leaderboard", verifyToken, challengesController.getLeaderboard);

// 14. Get Results / Complete Challenge
router.post("/:id/complete", verifyToken, challengesController.completeChallenge);

// 15. Discover Preset Challenges
router.get("/discover", verifyToken, challengesController.discoverChallenges);

// 15b. Join Open Challenge
router.post("/:id/join", verifyToken, challengesController.joinOpenChallenge);

// 16. My Active Challenge — full detail + board (token only, no params)
router.get("/my-active", verifyToken, challengesController.getMyActiveChallenge);

// Admin: Remove a Challenge
router.post("/admin/:id/remove", verifyToken, challengesController.adminRemoveChallenge);

module.exports = router;
