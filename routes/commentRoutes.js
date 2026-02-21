const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { createComment, getAllComments, getCommentById, updateComment, deleteComment } = require("../controllers/commentController");

router.post("/", verifyToken, createComment);
router.get("/", verifyToken, getAllComments);
router.get("/:id", verifyToken, getCommentById);
router.put("/:id", verifyToken, updateComment);
router.delete("/:id", verifyToken, deleteComment);

module.exports = router;