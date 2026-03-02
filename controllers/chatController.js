const Chat = require("../models/Chat");
const Message = require("../models/Message");

// Create new chat
exports.createChat = async (req, res) => {
    try {
        const chat = new Chat({ user: req.user.id });
        await chat.save();
        res.status(201).json({ success: true, message: "Chat created successfully", chat });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get all chats (admin only)
exports.getAllChats = async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }
        const chats = await Chat.find().populate("user", "name email");
        res.status(200).json({ success: true, chats });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get user's chats
exports.getUserChats = async (req, res) => {
    try {
        const chats = await Chat.find({ user: req.user.id }).sort({ updatedAt: -1 });
        res.status(200).json({ success: true, chats });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get chat by ID with messages
exports.getChatById = async (req, res) => {
    try {
        const chat = await Chat.findById(req.params.id).populate("user", "name email");
        if (!chat) {
            return res.status(404).json({ success: false, message: "Chat not found" });
        }

        // Get all messages for this chat
        const messages = await Message.find({ chat: req.params.id }).sort({ createdAt: 1 });

        res.status(200).json({ success: true, chat, messages });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Delete chat and all its messages
exports.deleteChat = async (req, res) => {
    try {
        const chat = await Chat.findById(req.params.id);
        if (!chat) {
            return res.status(404).json({ success: false, message: "Chat not found" });
        }

        // Delete all messages in this chat
        await Message.deleteMany({ chat: req.params.id });

        // Delete the chat
        await Chat.findByIdAndDelete(req.params.id);

        res.status(200).json({ success: true, message: "Chat and all messages deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
