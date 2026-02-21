const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const {
    getAllTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate
} = require("../controllers/TemplateController");

// Public route - anyone can view templates
router.get("/", getAllTemplates);

// Admin-only routes
router.post("/", verifyToken, createTemplate);
router.put("/:id", verifyToken, updateTemplate);
router.delete("/:id", verifyToken, deleteTemplate);

module.exports = router;
