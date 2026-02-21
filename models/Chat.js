const mongoose = require("mongoose");

const chatSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    title: {
        type: String,
        default: "New Chat"
    },
    message: {
        type: String,
        default: ""
    }
}, { timestamps: true });

module.exports = mongoose.model("Chat", chatSchema);