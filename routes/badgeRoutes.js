const express = require("express");
const router = express.Router();
const multer = require("multer");
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
    manualAssignBadge,
    uploadBadgeImage,
} = require("../controllers/badgeController");

// Memory storage — file stays in buffer, no disk write
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith("image/")) {
            return cb(new Error("Only image files are allowed"));
        }
        cb(null, true);
    },
});

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

// ─── Admin: Manually assign a badge directly to a user ───────────────────────
router.post("/assign", verifyToken, manualAssignBadge);

// ─── Admin: Upload badge image to Cloudinary ─────────────────────────────────
router.post("/upload-image", verifyToken, upload.single("image"), uploadBadgeImage);

module.exports = router;
