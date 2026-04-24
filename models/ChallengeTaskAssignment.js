const mongoose = require("mongoose");

/**
 * ChallengeTaskAssignment
 * Created when a challenge winner assigns a task to the loser(s).
 *
 * Two assignment modes:
 *  1. Existing task  → set taskId, leave customTask empty
 *  2. Custom inline  → leave taskId null, fill customTask fields
 */
const challengeTaskAssignmentSchema = new mongoose.Schema(
    {
        // The challenge this assignment is tied to
        challengeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Challenge",
            required: true,
            index: true,
        },

        // Winner who is assigning the task
        assignedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        // Loser who must complete the task
        assignedTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        // ── Mode 1: existing task from the task list ───────────────────────
        taskId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Task",
            default: null,
        },

        // ── Mode 2: custom inline task ─────────────────────────────────────
        customTask: {
            title:       { type: String, default: null },
            description: { type: String, default: null },
            xps_points:  { type: Number, default: 0 },
        },

        // Lifecycle
        status: {
            type: String,
            enum: ["pending", "completed"],
            default: "pending",
        },
        completedAt: { type: Date, default: null },

        // Optional note from the winner
        note: { type: String, default: "" },
    },
    { timestamps: true }
);

module.exports = mongoose.model("ChallengeTaskAssignment", challengeTaskAssignmentSchema);
