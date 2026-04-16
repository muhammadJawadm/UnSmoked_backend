const mongoose = require("mongoose");

const TemplateSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true },
        description: { type: String, default: "" },
        rules: { type: String, default: "" },          // NEW: challenge rules / how to play
        category: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
        durationDays: { type: Number, default: 1, min: 1 },
        boardSize: { type: Number, default: 50 },       // NEW: metadata (e.g. number of squares)
        xpReward: { type: Number, default: 50, min: 0 },
        isActive: { type: Boolean, default: true },
        isCustom: { type: Boolean, default: false },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Template", TemplateSchema);
