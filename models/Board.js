const mongoose = require("mongoose");

const daySchema = new mongoose.Schema({
    day: {
        type: Number,
        required: true
    },
    smoked: {
        type: Boolean,
        default: null
    },
    date: {
        type: Date,
        required: true
    }
},
    { _id: false }
);

const boardSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },
    boardSize: {
        type: Number,
        required: true
    },
    days: {
        type: [daySchema],
        default: []
    },
    isCompleted: {
        type: Boolean,
        default: false
    },
    // Optional: set when board belongs to a competition
    competition: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Competition",
        default: null,
    },
},
    { timestamps: true }
);

module.exports = mongoose.model("Board", boardSchema);