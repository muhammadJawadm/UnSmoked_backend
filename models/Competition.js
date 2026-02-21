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
            required: true,
        },
    },
    { _id: false }
);

const competitionSchema = new mongoose.Schema(
    {
        boardSize: {
            type: Number,
            required: true,
            enum: [7, 14, 30, 60, 90],
        },
        // Each entry links a user to their own dedicated Board
        players: {
            type: [playerSchema],
            validate: {
                validator: (arr) => arr.length === 2 || arr.length === 4,
                message: "A competition must have exactly 2 or 4 players",
            },
        },
        status: {
            type: String,
            enum: ["pending", "active", "completed"],
            default: "active",
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Competition", competitionSchema);
