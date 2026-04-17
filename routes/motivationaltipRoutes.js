const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const {
    createMotivationalTip,
    getAllMotivationalTips,
    getMotivationalTip,
    updateMotivationalTip,
    deleteMotivationalTip,
    getFeaturedTip,
    getFactOfTheDay,
    getMobileHomeData
} = require("../controllers/motivationaltipController");

// ── Special / aggregated endpoints (place before /:id to avoid conflicts) ──
router.get("/mobile-home", getMobileHomeData);       // All home screen data in one call
router.get("/featured", getFeaturedTip);             // Featured "Top Pick" tip
router.get("/fact-of-the-day", getFactOfTheDay);     // Fact of the day banner

// ── Standard CRUD ──
router.post("/", verifyToken, createMotivationalTip);
router.get("/", getAllMotivationalTips);              // Public: list all active tips
router.get("/:id", getMotivationalTip);
router.put("/:id", verifyToken, updateMotivationalTip);
router.delete("/:id", verifyToken, deleteMotivationalTip);

module.exports = router;
