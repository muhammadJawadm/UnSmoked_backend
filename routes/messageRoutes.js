const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { createMessage, getMessagesByChatId, deleteMessage, sendToOpenAI } = require("../controllers/messageController");

router.post("/", verifyToken, createMessage);
router.get("/chat/:chatId", verifyToken, getMessagesByChatId);
router.delete("/:id", verifyToken, deleteMessage);
router.post("/openai", verifyToken, sendToOpenAI); // For future OpenAI integration

module.exports = router;
