const mongoose = require("mongoose");

const userProgressSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true, required: true },

        challengesCompleted: { type: Number, default: 0, min: 0 },
        totalWins: { type: Number, default: 0, min: 0 },
        totalLosses: { type: Number, default: 0, min: 0 },
    },
    { timestamps: true }
);

module.exports = mongoose.model("UserProgress", userProgressSchema);
