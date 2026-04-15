const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { getAllChats, getMyChat, clearMyChat } = require("../controllers/chatController");

router.get("/", verifyToken, getAllChats);

router.get("/my-chat", verifyToken, getMyChat);

router.delete("/my-chat/clear", verifyToken, clearMyChat);

module.exports = router;
