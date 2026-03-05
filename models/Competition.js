const mongoose = require("mongoose");

const playerSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        board: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Board",
            default: null, // assigned when competition becomes active
        },
    },
    { _id: false }
);

const competitionSchema = new mongoose.Schema(
    {
        numberOfPlayers: {
            type: Number,
            required: true,
            enum: [2, 4],
        },
        // How many days the competition lasts
        days: {
            type: Number,
            required: true,
        },
        // Cigarette slots per day (overrides user's cigarettes_per_day during competition)
        boardSize: {
            type: Number,
            required: true,
        },
        // When the competition starts (creator picks a future date)
        startDate: {
            type: Date,
            required: true,
        },
        // Computed: startDate + days
        endDate: {
            type: Date,
        },
        // Grows as players join; starts with only the creator
        players: {
            type: [playerSchema],
            default: [],
        },
        status: {
            type: String,
            enum: ["pending", "active", "completed", "cancelled"],
            default: "pending",
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
    },
    { timestamps: true }
);

// Auto-compute endDate before saving
competitionSchema.pre("save", function () {
    if (this.startDate && this.days) {
        this.endDate = new Date(
            this.startDate.getTime() + this.days * 24 * 60 * 60 * 1000
        );
    }
});

module.exports = mongoose.model("Competition", competitionSchema);
