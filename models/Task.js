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
    goal: {
        type: String,
        default: "",
    },
    requirement: {
        type: String,
        default: "",
    },
    // What proof the loser must submit. null/empty = proof not required (skippable).
    proof: {
        type: String,
        default: null,
    },

    xps_points: {
        type: Number,
        default: 0,
    },
}, { timestamps: true });

module.exports = mongoose.model("Task", taskSchema);
