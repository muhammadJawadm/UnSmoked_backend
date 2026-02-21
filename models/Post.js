const mongoose = require("mongoose");

const postSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    description: {
        type: String,
        required: true
    },
    media: [
        {
            type: String
        }
    ],

}, { timestamps: true });

module.exports = mongoose.model("Post", postSchema);
