const mongoose = require("mongoose");

const monthlyBoardSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        month: { type: Number, required: true },   // 1-12
        year: { type: Number, required: true },
        boardSize: {
            type: Number,
            required: true,
            default: 30,
        },
        dailyBoards: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "DailyBoard",
            },
        ],
        // Monthly accumulated stats
        totalCigarettesAvoided: { type: Number, default: 0, min: 0 },
        totalCigarettesSmoked: { type: Number, default: 0, min: 0 },
        totalLifeRegained: { type: Number, default: 0, min: 0 },       // minutes
        totalMoneySaved: { type: Number, default: 0, min: 0 },          // dollars
        isCompleted: { type: Boolean, default: false },
    },
    { timestamps: true }
);

// One monthly board per user per month/year
monthlyBoardSchema.index({ userId: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model("MonthlyBoard", monthlyBoardSchema);
