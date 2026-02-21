const mongoose = require("mongoose");

const userMilestoneSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    milestoneId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Milestone",
        required: true
    },
    achieved_at: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

module.exports = mongoose.model("UserMilestone", userMilestoneSchema);
