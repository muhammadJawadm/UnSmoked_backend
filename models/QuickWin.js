const mongoose = require("mongoose");

const quickWinSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    read_time: {
        type: String,   // e.g. "1 min tip", "2 min read"
        default: "1 min tip"
    },
    icon: {
        type: String    // icon name or URL
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

module.exports = mongoose.model("QuickWin", quickWinSchema);
