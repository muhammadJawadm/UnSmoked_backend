const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { createChat, getAllChats, getUserChats, getChatById, deleteChat } = require("../controllers/chatController");

router.post("/", verifyToken, createChat);
router.get("/", verifyToken, getAllChats);
router.get("/my-chats", verifyToken, getUserChats);
router.get("/:id", verifyToken, getChatById);
router.delete("/:id", verifyToken, deleteChat);

module.exports = router;
