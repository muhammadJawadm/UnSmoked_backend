const Message = require("../models/Message");
const Chat = require("../models/Chat");
const { OpenAI } = require("openai");

// Create a new message
exports.createMessage = async (req, res) => {
    try {
        const { chat, role, message, media } = req.body;

        // Verify chat exists
        const chatExists = await Chat.findById(chat);
        if (!chatExists) {
            return res.status(404).json({ message: "Chat not found" });
        }

        const newMessage = new Message({
            chat,
            role,
            message,
            media: media || []
        });

        await newMessage.save();

        // Update chat's updatedAt timestamp
        chatExists.updatedAt = new Date();
        await chatExists.save();

        res.status(201).json({ message: "Message created successfully", data: newMessage });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get all messages for a specific chat
exports.getMessagesByChatId = async (req, res) => {
    try {
        const messages = await Message.find({ chat: req.params.chatId }).sort({ createdAt: 1 });
        res.status(200).json(messages);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Delete a specific message
exports.deleteMessage = async (req, res) => {
    try {
        const message = await Message.findByIdAndDelete(req.params.id);
        if (!message) {
            return res.status(404).json({ message: "Message not found" });
        }
        res.status(200).json({ message: "Message deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Optional: Send message to OpenAI and store response
// This is a placeholder - you'll need to install 'openai' package and add your API key
exports.sendToOpenAI = async (req, res) => {
    try {
        const { chatId, userMessage } = req.body;

        // Verify chat exists
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return res.status(404).json({ message: "Chat not found" });
        }

        // Store user's message
        const userMsg = new Message({
            chat: chatId,
            role: "user",
            message: userMessage
        });
        await userMsg.save();

        // Get entire conversation history for context
        const conversationHistory = await Message.find({ chat: chatId })
            .sort({ createdAt: 1 })
            .select('role message');

        // TODO: Integrate with OpenAI API
        // Example (requires 'openai' package):

        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: conversationHistory.map(msg => ({
                role: msg.role,
                content: msg.message
            })),
            temperature: 0.7,
            max_tokens: 500
        });
        const aiResponse = completion.choices[0].message.content;

        // Placeholder response
        // aiResponse = `This is a placeholder response. Integrate OpenAI API to get real responses. (Context: ${conversationHistory.length} messages in history)`;

        // Store AI's response
        const aiMsg = new Message({
            chat: chatId,
            role: "assistant",
            message: aiResponse
        });
        await aiMsg.save();

        // Auto-generate title from first user message (if still "New Chat")
        if (chat.title === "New Chat" && userMessage) {
            const title = userMessage.length > 50
                ? userMessage.substring(0, 50) + "..."
                : userMessage;
            chat.title = title;
        }

        // Update preview with latest user message
        const preview = userMessage.length > 60
            ? userMessage.substring(0, 60) + "..."
            : userMessage;
        chat.message = preview;
        chat.updatedAt = new Date();
        await chat.save();

        res.status(200).json({
            userMessage: userMsg,
            aiMessage: aiMsg,
            chatTitle: chat.title,
            chatPreview: chat.message
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
