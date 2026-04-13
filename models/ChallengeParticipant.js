const mongoose = require("mongoose");

const challengeParticipantSchema = new mongoose.Schema(
    {
        challengeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Challenge",
            required: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        role: {
            type: String,
            enum: ["creator", "invitee"],
            required: true,
        },

        // Invite lifecycle
        inviteStatus: {
            type: String,
            enum: ["pending", "accepted", "declined"],
            default: "pending",
        },
        respondedAt: { type: Date, default: null },

        // Progress (incremental logs)
        progressValue: { type: Number, default: 0, min: 0 },
        progressLog: [
            {
                value: { type: Number, required: true },
                loggedAt: { type: Date, default: Date.now },
            },
        ],

        // XP awarded after challenge ends (0 = not yet awarded)
        xpEarned: { type: Number, default: 0, min: 0 },
    },
    { timestamps: true }
);

// One participant record per user per challenge
challengeParticipantSchema.index({ challengeId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("ChallengeParticipant", challengeParticipantSchema);
