const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { createCategory, getAllCategories, getCategoryById, updateCategory, deleteCategory } = require("../controllers/categoryController");

router.post("/", verifyToken, createCategory);
router.get("/", verifyToken, getAllCategories);
router.get("/:id", verifyToken, getCategoryById);
router.put("/:id", verifyToken, updateCategory);
router.delete("/:id", verifyToken, deleteCategory);

module.exports = router;