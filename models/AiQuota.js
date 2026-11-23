const mongoose = require("mongoose");

const aiQuotaSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        unique: true
    },
    // Current billing cycle allowance in euros (starts at 1.50)
    allowanceEur: {
        type: Number,
        default: 1.50
    },
    // How much has been used in the current billing cycle (euros)
    usedEur: {
        type: Number,
        default: 0
    },
    // Number of reload packs purchased in the current billing cycle
    reloadCount: {
        type: Number,
        default: 0
    },
    // When the current billing cycle started (set from RevenueCat subscription purchase date)
    cycleStartDate: {
        type: Date,
        required: true
    },
    // When the current billing cycle ends (set from RevenueCat subscription expiration date)
    cycleEndDate: {
        type: Date,
        required: true
    },
    // RevenueCat app_user_id for this user
    revenueCatUserId: {
        type: String,
        default: ""
    },
    // History of reload transactions
    reloadHistory: [{
        transactionId: { type: String, required: true },
        purchasedAt: { type: Date, default: Date.now },
        amountEur: { type: Number, default: 1.50 }
    }]
}, { timestamps: true });

module.exports = mongoose.model("AiQuota", aiQuotaSchema);
