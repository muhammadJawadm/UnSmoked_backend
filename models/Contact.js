const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    issue: {
        type: String,
        required: true
    },
    response: {
        type: String,
    },
    status: {
        type: String,
        enum: ["pending", "resolved"],
        default: "pending"
    }
}, { timestamps: true });

module.exports = mongoose.model("Contact", contactSchema);