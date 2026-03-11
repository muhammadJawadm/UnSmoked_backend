const Message = require("../models/Message");
const Chat = require("../models/Chat");
const { OpenAI } = require("openai");

// Get all messages for a specific chat
exports.getMessagesByChatId = async (req, res) => {
    try {
        const messages = await Message.find({ chat: req.params.chatId }).sort({ createdAt: 1 });
        res.status(200).json({ success: true, messages });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Delete a specific message
exports.deleteMessage = async (req, res) => {
    try {
        const message = await Message.findByIdAndDelete(req.params.id);
        if (!message) {
            return res.status(404).json({ success: false, message: "Message not found" });
        }
        res.status(200).json({ success: true, message: "Message deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Send a message to OpenAI and store both the user message and AI response.
// Automatically finds (or creates) the user's single persistent chat.
exports.sendToOpenAI = async (req, res) => {
    try {
        const { userMessage } = req.body;

        if (!userMessage || !userMessage.trim()) {
            return res.status(400).json({ success: false, message: "userMessage is required" });
        }

        // Find or create the user's single persistent chat
        let chat = await Chat.findOne({ user: req.user.id });
        if (!chat) {
            chat = new Chat({ user: req.user.id, title: "My Chat" });
            await chat.save();
        }

        // Store the user's message first
        const userMsg = new Message({
            chat: chat._id,
            role: "user",
            message: userMessage.trim()
        });
        await userMsg.save();

        // Load the full conversation history (including the message just saved)
        const conversationHistory = await Message.find({ chat: chat._id })
            .sort({ createdAt: 1 })
            .select("role message");

        // Build the messages array for OpenAI with a fixed system prompt
        const openaiMessages = [
            {
                role: "system",
                content: "You are a supportive AI assistant for Unsmoked, a smoking cessation app. Help users quit smoking by providing encouragement, evidence-based advice, coping strategies, and emotional support. Be empathetic, positive, and motivating."
            },
            ...conversationHistory.map(msg => ({
                role: msg.role,
                content: msg.message
            }))
        ];

        let aiResponse;
        try {
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
            const completion = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: openaiMessages,
                temperature: 0.7,
                max_tokens: 500
            });
            aiResponse = completion.choices[0].message.content;
        } catch (openaiError) {
            // Fallback dummy response so the full message flow can be tested
            // even when the OpenAI key has no quota or is not set
            aiResponse = `[DUMMY RESPONSE] I received your message: "${userMessage.trim()}". This is a placeholder reply used for testing — the AI service is currently unavailable (${openaiError.message}).`;
        }
        
        // Store the AI's response
        const aiMsg = new Message({
            chat: chat._id,
            role: "assistant",
            message: aiResponse
        });
        await aiMsg.save();

        // Update the chat preview with the latest user message
        chat.message = userMessage.trim().length > 60
            ? userMessage.trim().substring(0, 60) + "..."
            : userMessage.trim();
        chat.updatedAt = new Date();
        await chat.save();

        res.status(200).json({
            success: true,
            userMessage: userMsg,
            aiMessage: aiMsg
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
