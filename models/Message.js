const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
    chat: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Chat",
        required: true
    },
    role: {
        type: String,
        enum: ["user", "assistant", "system"],
        required: true
    },
    message: {
        type: String,
        required: true
    },
    media: [
        {
            type: String
        }
    ]
}, { timestamps: true });

module.exports = mongoose.model("Message", messageSchema);