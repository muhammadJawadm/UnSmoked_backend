const mongoose = require("mongoose");
const Category = require("./Category");

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
        title: { type: String, required: true, trim: true },
        category: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Category",
            default: null,
            validate: {
                validator: async function (value) {
                    if (!value) return true;
                    const exists = await Category.exists({ _id: value });
                    return !!exists;
                },
                message: "Invalid category. Category must exist.",
            },
        },
        durationDays: { type: Number, default: 1, min: 1 },
        boardSize: { type: Number, default: 50 },       // metadata only
        xpReward: { type: Number, default: 50, min: 0 }, // freely set by creator
        description: { type: String, default: "" },
        rules: { type: String, default: "" },

        // Mode
        mode: {
            type: String,
            enum: ["1v1", "4-player", "open"],
            required: true,
        },

        // Lifecycle
        status: {
            type: String,
            enum: ["waiting", "active", "completed", "cancelled"],
            default: "waiting",
        },
        startAt: { type: Date, default: null },
        endsAt: { type: Date, default: null },

        // Winner (participant with highest progress at end)
        winner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },

        // Invite token — used for open challenges and share-link flow
        inviteToken: {
            type: String,
            unique: true,
            sparse: true,
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
