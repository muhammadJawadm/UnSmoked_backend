const mongoose = require("mongoose");

const userOverviewSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true, required: true },
        cigarettesAvoided: { type: Number, default: 0, min: 0 },
        lifeRegained: { type: Number, default: 0, min: 0 }, // in minutes
        moneySaved: { type: Number, default: 0, min: 0 }, // in dollars
        lungsHealth: { type: String, enum: ["Poor", "Fair", "Improving", "Healthy", "Excellent"], default: "Fair" },
        overallHealth: { type: String, enum: ["Poor", "Fair", "Improving", "Improved", "Excellent"], default: "Fair" },
    },
    { timestamps: true }
);

module.exports = mongoose.model("UserOverview", userOverviewSchema);
