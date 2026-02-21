const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { createBlog, getAllBlogs, getBlogById, updateBlog, deleteBlog } = require("../controllers/blogController");

router.post("/", verifyToken, createBlog);
router.get("/", verifyToken, getAllBlogs);
router.get("/:id", verifyToken, getBlogById);
router.put("/:id", verifyToken, updateBlog);
router.delete("/:id", verifyToken, deleteBlog);

module.exports = router;