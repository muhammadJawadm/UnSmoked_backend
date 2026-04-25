const mongoose = require("mongoose");

const motivationalTipSchema = new mongoose.Schema({
    tip: {
        type: String,
        required: true
    },
    category: {
        type: String,
        required: true
    },
    tag: {
        type: String,
        default: ""
    },
    description: {
        type: String,
        default: ""
    },
    // For the "Fact of the Day" banner at the top
    is_fact_of_day: {
        type: Boolean,
        default: false
    },
    // For the "Featured Tip / Top Pick" card
    is_featured: {
        type: Boolean,
        default: false
    },
    // Author/source e.g. "— Verified by WHO Health Guidelines"
    source: {
        type: String,
        default: ""
    },
    read_time: {
        type: String,
        default: "2 min read"
    },
    is_active: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

module.exports = mongoose.model("MotivationalTip", motivationalTipSchema);