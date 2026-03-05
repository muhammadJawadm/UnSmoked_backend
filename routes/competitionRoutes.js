const express = require("express");
const router = express.Router();
const {
    createCompetition,
    joinCompetition,
    listAvailableCompetitions,
    getMyCompetitions,
    getActiveCompetition,
    getCompetition,
    cancelCompetition,
} = require("../controllers/competitionController");
const verifyToken = require("../middleware/verifyToken");

// Create a new competition (creator only in players initially)
router.post("/create", verifyToken, createCompetition);

// Join a competition via shared competition ID
router.post("/:id/join", verifyToken, joinCompetition);

// List pending competitions with open slots (for browsing / 4-player discovery)
router.get("/list", verifyToken, listAvailableCompetitions);

// Get current user's competitions (optional ?status=pending|active|completed)
router.get("/my", verifyToken, getMyCompetitions);

// Check if user has an active competition right now (for board override logic)
router.get("/active", verifyToken, getActiveCompetition);

// Get a specific competition with player progress
router.get("/:id", verifyToken, getCompetition);

// Creator cancels a pending competition
router.delete("/:id/cancel", verifyToken, cancelCompetition);

module.exports = router;
