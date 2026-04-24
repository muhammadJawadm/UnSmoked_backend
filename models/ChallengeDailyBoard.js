const mongoose = require("mongoose");

/**
 * ChallengeDailyBoard
 * One record per (challengeId, userId, date).
 * Mirrors DailyBoard but scoped to a specific challenge.
 */
const challengeDailyBoardSchema = new mongoose.Schema(
    {
        challengeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Challenge",
            required: true,
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        // Challenge day number (1 = first day of challenge, 2 = second, …)
        day: {
            type: Number,
            required: true,
            min: 1,
        },
        date: {
            type: Date,
            required: true,
        },
        // Each element: null (unlogged) | "smoked" | "unsmoked"
        smokes: {
            type: [String],
            default: [],
        },
        cigarettesAvoided: { type: Number, default: 0, min: 0 },
        cigarettesSmoked:  { type: Number, default: 0, min: 0 },
        lifeRegained:      { type: Number, default: 0, min: 0 }, // minutes
        moneySaved:        { type: Number, default: 0, min: 0 }, // dollars
    },
    { timestamps: true }
);

// One challenge daily board per user per challenge per date
challengeDailyBoardSchema.index({ challengeId: 1, userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("ChallengeDailyBoard", challengeDailyBoardSchema);
