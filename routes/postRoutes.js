const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { createPost, getAllPosts, getPostById, updatePost, deletePost } = require("../controllers/postController");

router.post("/", verifyToken, createPost);
router.get("/", verifyToken, getAllPosts);
router.get("/:id", verifyToken, getPostById);
router.put("/:id", verifyToken, updatePost);
router.delete("/:id", verifyToken, deletePost);

module.exports = router;