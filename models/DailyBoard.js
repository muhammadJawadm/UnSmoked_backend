const mongoose = require("mongoose");

const dailyBoardSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        day: {
            type: Number,
            required: true,
            min: 1,
        },
        date: {
            type: Date,
            required: true,
        },
        smokes: {
            type: [String], // each element: null (unlogged), "smoked", "unsmoked"
            default: [],
        },
        cigarettesAvoided: { type: Number, default: 0, min: 0 },
        cigarettesSmoked: { type: Number, default: 0, min: 0 },
        lifeRegained: { type: Number, default: 0, min: 0 },   // in minutes
        moneySaved: { type: Number, default: 0, min: 0 },      // in dollars
    },
    { timestamps: true }
);

// Compound index: one daily board per user per date
dailyBoardSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("DailyBoard", dailyBoardSchema);
