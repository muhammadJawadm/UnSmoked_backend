const mongoose = require("mongoose");

const challengeSchema = new mongoose.Schema(
    {
        // Creator
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        // Content source
        sourceType: {
            type: String,
            enum: ["preset", "custom"],
            required: true,
        },
        templateId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Template",
            default: null,
        },

        // Challenge content — always stored inline for fast reads
        durationDays: { type: Number, default: 1, min: 1 },
        boardSize: { type: Number, default: 50 },

        // Mode
        mode: {
            type: String,
            enum: ["1v1", "4-player"],
            required: true,
        },

        // Lifecycle
        // pending   → just created, no invites sent yet
        // waiting   → invites sent, waiting for players to respond
        // active    → challenge is running
        // completed → challenge ended
        // cancelled → creator cancelled
        status: {
            type: String,
            enum: ["pending", "waiting", "active", "completed", "cancelled"],
            default: "pending",
        },
        scheduledDate: { type: Date, default: null },
        startAt: { type: Date, default: null },
        endsAt: { type: Date, default: null },

        // Winner (participant with highest progress at end)
        winner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },

        // Admin moderation
        moderationStatus: {
            type: String,
            enum: ["ok", "removed"],
            default: "ok",
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Challenge", challengeSchema);
