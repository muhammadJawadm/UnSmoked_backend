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
const axios = require("axios"); // npm install axios

// Helper: fetch image URL and convert to base64
const fetchImageAsBase64 = async (url) => {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    const base64 = Buffer.from(response.data).toString("base64");
    const contentType = response.headers["content-type"] || "image/jpeg";
    return { base64, contentType };
};

exports.sendToOpenAI = async (req, res) => {
    try {
        const { userMessage, media, mediaUrls } = req.body;
        const trimmedUserMessage = typeof userMessage === "string" ? userMessage.trim() : "";

        const rawMediaInput = media !== undefined ? media : mediaUrls;
        let normalizedMedia = [];

        if (Array.isArray(rawMediaInput)) {
            normalizedMedia = rawMediaInput
                .filter(item => typeof item === "string")
                .map(item => item.trim())
                .filter(Boolean);
        } else if (typeof rawMediaInput === "string") {
            const trimmedMedia = rawMediaInput.trim();
            if (trimmedMedia) {
                normalizedMedia = [trimmedMedia];
            }
        }

        const hasText = Boolean(trimmedUserMessage);
        const hasMedia = normalizedMedia.length > 0;

        if (!hasText && !hasMedia) {
            return res.status(400).json({ success: false, message: "Send either userMessage or media URL(s)" });
        }

        let chat = await Chat.findOne({ user: req.user.id });
        if (!chat) {
            chat = new Chat({ user: req.user.id, title: "My Chat" });
            await chat.save();
        }

        const userMsg = new Message({
            chat: chat._id,
            role: "user",
            message: hasText ? trimmedUserMessage : "[Media attachment]",
            media: normalizedMedia
        });
        await userMsg.save();

        const conversationHistory = await Message.find({ chat: chat._id })
            .sort({ createdAt: 1 })
            .select("role message media");

        // ✅ Build messages with base64 image conversion
        const buildMessageContent = async (msg) => {
            const hasMediaUrls = Array.isArray(msg.media) && msg.media.length > 0;

            if (!hasMediaUrls) {
                return msg.message || "";
            }

            const contentArray = [];

            // Add text part if exists
            if (msg.message && msg.message !== "[Media attachment]") {
                contentArray.push({ type: "text", text: msg.message });
            }

            // Convert each image URL to base64 and add as image_url block
            for (const url of msg.media) {
                try {
                    const { base64, contentType } = await fetchImageAsBase64(url);
                    contentArray.push({
                        type: "image_url",
                        image_url: {
                            url: `data:${contentType};base64,${base64}`
                        }
                    });
                } catch (err) {
                    console.error(`Failed to fetch image: ${url}`, err.message);
                    // Skip failed images silently
                }
            }

            return contentArray;
        };

        // Build all messages (async)
        const builtMessages = await Promise.all(
            conversationHistory.map(async (msg) => ({
                role: msg.role,
                content: await buildMessageContent(msg)
            }))
        );

        const openaiMessages = [
            {
                role: "system",
                content: "You are a supportive AI assistant for Unsmoked, a smoking cessation app. Help users quit smoking by providing encouragement, evidence-based advice, coping strategies, and emotional support. Be empathetic, positive, and motivating."
            },
            ...builtMessages
        ];

        let aiResponse;
        try {
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
            const completion = await openai.chat.completions.create({
                model: "gpt-4o", // ✅ Required for vision support
                messages: openaiMessages,
                temperature: 0.7,
                max_tokens: 500
            });
            aiResponse = completion.choices[0].message.content;
        } catch (openaiError) {
            aiResponse = `[DUMMY RESPONSE] I received your message: "${hasText ? trimmedUserMessage : "[Media attachment]"}". This is a placeholder reply used for testing - the AI service is currently unavailable (${openaiError.message}).`;
        }

        const aiMsg = new Message({
            chat: chat._id,
            role: "assistant",
            message: aiResponse
        });
        await aiMsg.save();

        const latestPreviewText = hasText ? trimmedUserMessage : "[Media attachment]";
        chat.message = latestPreviewText.length > 60
            ? latestPreviewText.substring(0, 60) + "..."
            : latestPreviewText;
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