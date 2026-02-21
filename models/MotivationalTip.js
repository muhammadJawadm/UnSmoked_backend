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
    is_active: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

module.exports = mongoose.model("MotivationalTip", motivationalTipSchema);