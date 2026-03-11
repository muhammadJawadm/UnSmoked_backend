const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { getMessagesByChatId, deleteMessage, sendToOpenAI } = require("../controllers/messageController");

// Send a user message and receive the AI reply (uses the caller's persistent chat)
router.post("/send", verifyToken, sendToOpenAI);

// Get all messages for a chat by its ID
router.get("/chat/:chatId", verifyToken, getMessagesByChatId);

// Delete a specific message by ID
router.delete("/:id", verifyToken, deleteMessage);

module.exports = router;
