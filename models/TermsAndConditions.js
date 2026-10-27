const mongoose = require("mongoose");

// Singleton document — only one Terms & Conditions record should ever exist.
const termsAndConditionsSchema = new mongoose.Schema(
    {
        content: { type: String, required: true, default: "" },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true }
);

module.exports = mongoose.model("TermsAndConditions", termsAndConditionsSchema);
