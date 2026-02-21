const mongoose = require("mongoose");

const challengesSchema = new mongoose.Schema(
    {
        assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        sourceType: { type: String, enum: ["template", "custom"], required: true },
        templateId: { type: mongoose.Schema.Types.ObjectId, ref: "Template", default: null },
        status: { type: String, enum: ["pending", "completed", "failed", "expired", "removed"], default: "pending" },
        startAt: { type: Date, default: Date.now },
        dueAt: { type: Date, required: true },
        completedAt: { type: Date, default: null },

        // Admin moderation: "ok" = visible, "removed" = hidden from users
        moderationStatus: {
            type: String,
            enum: ["ok", "removed"],
            default: "ok"
        },

        // Groups all assignments from a single 4-player challenge dispatch together
        groupId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },

        // Set on the FIRST completion in the group — populated with user details
        winner: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Challenges", challengesSchema);
