const mongoose = require("mongoose");

// Singleton document — only one Privacy Policy record should ever exist.
const privacyPolicySchema = new mongoose.Schema(
    {
        content: { type: String, required: true, default: "" },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true }
);

module.exports = mongoose.model("PrivacyPolicy", privacyPolicySchema);
