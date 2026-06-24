const mongoose = require("mongoose");

const challengeTaskAssignmentSchema = new mongoose.Schema(
    {
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

        // Task selected from the task list
        taskId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Task",
            required: true,
        },

        // Optional note from the winner
        note: { type: String, default: "" },

        status: {
            type: String,
            enum: ["pending", "completed"],
            default: "pending",
        },
        completedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

module.exports = mongoose.model("ChallengeTaskAssignment", challengeTaskAssignmentSchema);
