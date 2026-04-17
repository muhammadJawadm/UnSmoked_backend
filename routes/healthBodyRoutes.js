const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const {
    createHealthBody,
    getAllHealthBody,
    getAllHealthBodyAdmin,
    getCategories,
    getHealthBody,
    updateHealthBody,
    deleteHealthBody
} = require("../controllers/healthBodyController");

// Special endpoints (before /:id)
router.get("/categories", getCategories);               // Public: list categories
router.get("/all", verifyToken, getAllHealthBodyAdmin);  // Admin: all including inactive

// Standard CRUD
router.post("/", verifyToken, createHealthBody);
router.get("/", getAllHealthBody);   // Public: active only, supports ?category= filter
router.get("/:id", getHealthBody);
router.put("/:id", verifyToken, updateHealthBody);
router.delete("/:id", verifyToken, deleteHealthBody);

module.exports = router;
