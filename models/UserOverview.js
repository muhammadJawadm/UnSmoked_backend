const mongoose = require("mongoose");

const userOverviewSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true, required: true },

        // Daily stats (reset each day or represent current day)
        dailyCigarettesAvoided: { type: Number, default: 0, min: 0 },
        dailyLifeRegained: { type: Number, default: 0, min: 0 },       // in minutes
        dailyMoneySaved: { type: Number, default: 0, min: 0 },          // in dollars
        dailyDate: { type: Date, default: null },                        // which day these daily stats belong to

        // Monthly stats (accumulated for the current month)
        monthlyCigarettesAvoided: { type: Number, default: 0, min: 0 },
        monthlyLifeRegained: { type: Number, default: 0, min: 0 },
        monthlyMoneySaved: { type: Number, default: 0, min: 0 },
        monthlyMonth: { type: Number, default: null },                   // which month (1-12)
        monthlyYear: { type: Number, default: null },                    // which year

        // Lifetime totals
        totalCigarettesAvoided: { type: Number, default: 0, min: 0 },
        totalLifeRegained: { type: Number, default: 0, min: 0 },
        totalMoneySaved: { type: Number, default: 0, min: 0 },

        // Health indicators
        lungsHealth: { type: String, enum: ["Poor", "Fair", "Improving", "Healthy", "Excellent"], default: "Fair" },
        overallHealth: { type: String, enum: ["Poor", "Fair", "Improving", "Improved", "Excellent"], default: "Fair" },
    },
    { timestamps: true }
);

module.exports = mongoose.model("UserOverview", userOverviewSchema);
