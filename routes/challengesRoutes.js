const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const {
    assignChallenge,
    getMyOngoing,
    getMyHistory,
    completeChallenge,
    removeChallenge,
    getGroupChallenge
} = require("../controllers/challengesController");

// User routes - all require authentication
// Single endpoint for both predefined and custom templates
router.post("/assign/template", verifyToken, assignChallenge);
router.get("/my/ongoing", verifyToken, getMyOngoing);
router.get("/my/history", verifyToken, getMyHistory);
router.post("/:id/complete", verifyToken, completeChallenge);
router.get("/group/:groupId", verifyToken, getGroupChallenge);


router.post("/admin/:id/remove", verifyToken, removeChallenge);

module.exports = router;
