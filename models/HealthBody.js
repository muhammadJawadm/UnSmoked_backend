const mongoose = require("mongoose");

const healthBodySchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    category: {
        type: String,
        required: true,
        enum: ["Lung Health", "Finance & Savings", "Mindset & Habit", "Heart Health", "Energy & Sleep", "Skin & Appearance", "Mental Health", "Other"],
        default: "Other"
    },
    category_tag: {
        type: String,       // e.g. "Lung Health", "Money Saved", "Habit Science"
        trim: true
    },
    icon: {
        type: String        // icon name or URL
    },
    read_time: {
        type: String,       // e.g. "2 min read"
        default: "2 min read"
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

module.exports = mongoose.model("HealthBody", healthBodySchema);
