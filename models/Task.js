const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
    },
    description: {
        type: String,
        required: true,
    },
    xps_points: {
        type: Number,
        default: 0,
    },
}, { timestamps: true });

module.exports = mongoose.model("Task", taskSchema);
