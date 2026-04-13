const Chat = require("../models/Chat");
const Message = require("../models/Message");

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

// Get (or auto-create) the user's single persistent chat with all messages
exports.getMyChat = async (req, res) => {
    try {
        const currentPage = parseInt(req.query.page, 10) || 1;
        const pageSize = parseInt(req.query.limit, 10) || 20;
        const skip = (currentPage - 1) * pageSize;

        let chat = await Chat.findOne({ user: req.user.id });
        if (!chat) {
            chat = new Chat({ user: req.user.id, title: "My Chat" });
            await chat.save();
        }

        const totalItems = await Message.countDocuments({ chat: chat._id });
        const totalPages = Math.ceil(totalItems / pageSize);

        // Sorting by createdAt: -1 (newest first) is standard for paginated chat
        const items = await Message.find({ chat: chat._id })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(pageSize);

        res.status(200).json({
            success: true,
            chat,
            pagination: {
                currentPage: currentPage,
                totalPages: totalPages,
                totalItems: totalItems,
                pageSize: pageSize,
                itemsCount: items.length,
                results: items
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Clear the user's entire chat history (keeps the chat record, wipes messages)
exports.clearMyChat = async (req, res) => {
    try {
        const chat = await Chat.findOne({ user: req.user.id });
        if (!chat) {
            return res.status(404).json({ success: false, message: "Chat not found" });
        }

        await Message.deleteMany({ chat: chat._id });

        chat.title = "My Chat";
        chat.message = "";
        await chat.save();

        res.status(200).json({ success: true, message: "Chat history cleared successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
