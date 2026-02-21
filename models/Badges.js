const mongoose = require("mongoose")

const badgeSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },
    badge: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "BadgeTemplate",
        required: true
    },
    earnedAt: {
        type: Date,
        default: Date.now
    }
},
    { timestamps: true }
);

module.exports = mongoose.model("Badges", badgeSchema);