const mongoose = require("mongoose");

const Otp = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    otp: { type: String, required: true },
    expiresAt: { type: Date, default: Date.now, required: true },
});

module.exports = mongoose.model("Otp", Otp);
