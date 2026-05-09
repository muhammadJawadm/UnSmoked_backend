const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    title: {
        type: String,
        required: true
    },
    body: {
        type: String,
        required: true
    },
    data: {
        type: Object,
        default: {}
    },
    status: {
        type: String,
        enum: ["pending", "sent", "failed","accepted","declined","expired"],
    },
    sentAt: {
        type: Date
    },
    failureReason: {
        type: String
    }
}, { timestamps: true });

module.exports = mongoose.model("Notification", notificationSchema);