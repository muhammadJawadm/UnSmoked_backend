const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { getAllChats, getMyChat, clearMyChat } = require("../controllers/chatController");

// Admin: list all users' chats
router.get("/", verifyToken, getAllChats);

// User: get (or auto-create) their single persistent chat + full message history
router.get("/my-chat", verifyToken, getMyChat);

// User: wipe their entire message history (chat record is kept)
router.delete("/my-chat/clear", verifyToken, clearMyChat);

module.exports = router;
