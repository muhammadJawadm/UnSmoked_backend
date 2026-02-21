const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const {
    createBadgeTemplate,
    getAllBadgeTemplates,
    getBadgeTemplateById,
    updateBadgeTemplate,
    deleteBadgeTemplate,
    getMyBadges,
    getUserBadges,
    triggerBadgeCheck,
} = require("../controllers/badgeController");

// ─── Badge Template routes (admin CRUD) ──────────────────────────────────────
router.post("/templates", verifyToken, createBadgeTemplate);
router.get("/templates", verifyToken, getAllBadgeTemplates);
router.get("/templates/:id", verifyToken, getBadgeTemplateById);
router.put("/templates/:id", verifyToken, updateBadgeTemplate);
router.delete("/templates/:id", verifyToken, deleteBadgeTemplate);

// ─── User Badge routes ──────────────────────────────────────────────────────
router.get("/my-badges", verifyToken, getMyBadges);
router.get("/user/:userId", verifyToken, getUserBadges);

// ─── Admin / Debug: manually trigger badge check ────────────────────────────
router.post("/check", verifyToken, triggerBadgeCheck);

module.exports = router;
