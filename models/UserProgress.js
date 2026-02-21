const mongoose = require("mongoose");

const userProgressSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true, required: true },
        xp: { type: Number, default: 0, min: 0 },
        level: { type: Number, default: 1, min: 1 },

        challengesCompleted: { type: Number, default: 0, min: 0 },
    },
    { timestamps: true }
);

module.exports = mongoose.model("UserProgress", userProgressSchema);
