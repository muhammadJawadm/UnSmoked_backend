const mongoose = require("mongoose");

const smokeFreeМilestoneSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true    // e.g. "20 Minutes Smoke-Free"
    },
    description: {
        type: String,
        trim: true
    },
    duration_minutes: {
        type: Number,
        required: true  // Duration in minutes (e.g. 20, 4320 for 72h, 10080 for 1 week)
    },
    icon: {
        type: String    // icon name or URL
    },
    badge_image: {
        type: String
    },
    xp_reward: {
        type: Number,
        default: 0
    },
    is_active: {
        type: Boolean,
        default: true
    },
    sort_order: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

module.exports = mongoose.model("SmokeFreeМilestone", smokeFreeМilestoneSchema);
