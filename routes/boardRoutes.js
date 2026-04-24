const express = require("express");
const router = express.Router();
const {
    getTodayBoard,
    markSlot,
    getMonthlyBoard,
    getTodayImpact,
    getUserOverviewStats,
    getStats,
    getLeaderboard,
    getBoard,
    markTodayStatus,
    getChallengeBoard,
    markChallengeSlot,
    getChallengeBoardSummary,
} = require("../controllers/boardController");
const verifyToken = require("../middleware/verifyToken");

// New board system routes
router.get("/today", verifyToken, getTodayBoard);
router.post("/mark-slot", verifyToken, markSlot);
router.get("/monthly", verifyToken, getMonthlyBoard);
router.get("/today-impact", verifyToken, getTodayImpact);
router.get("/overview", verifyToken, getUserOverviewStats);
router.get("/stats", verifyToken, getStats);
router.get("/leaderboard", verifyToken, getLeaderboard);

// Challenge board routes
router.get("/challenge/:challengeId/today", verifyToken, getChallengeBoard);
router.post("/challenge/:challengeId/mark-slot", verifyToken, markChallengeSlot);
router.get("/challenge/:challengeId/summary", verifyToken, getChallengeBoardSummary);

// Legacy routes (for competition boards)
router.get("/", verifyToken, getBoard);
router.post("/mark-today", verifyToken, markTodayStatus);

module.exports = router;