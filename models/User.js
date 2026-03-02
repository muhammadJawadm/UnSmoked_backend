const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    profile_picture: { type: String },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    is_verified: { type: Boolean, default: false },
    is_active: { type: Boolean, default: true },
    cigarettes_per_day: { type: Number, default: 0 },
    cost: { type: Number, default: 0 },
    per: { type: String, default: "pack" },
    amount_of_cigarettes_per_pack: { type: Number, default: 0 },
    health_goal: { type: String, default: "" },
    about_me: { type: String, default: "" },
    fcm_tokens: [
        { type: String },
    ],
    badges: [
        { type: mongoose.Schema.Types.ObjectId, ref: "BadgeTemplate" },
    ],

}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);