const AiQuota = require("../models/AiQuota");

const COST_PER_MESSAGE_EUR = 0.03; // estimated average cost per AI message

/**
 * Middleware that checks whether the user has enough AI quota left
 * before allowing an AI coach message through.
 *
 * Attaches req.aiQuota so the controller can record actual cost later.
 */
const checkAiQuota = async (req, res, next) => {
    try {
        const quota = await AiQuota.findOne({ user: req.user.id });

        if (!quota) {
            return res.status(403).json({
                success: false,
                code: "NO_AI_QUOTA",
                message: "No AI quota found. Please subscribe to Premium to use the AI Coach."
            });
        }

        // Check if the billing cycle has expired — if so, the mobile app
        // should have already called the renewal endpoint. We don't auto-reset
        // here because the cycle dates come from RevenueCat.
        const now = new Date();
        if (now > quota.cycleEndDate) {
            return res.status(403).json({
                success: false,
                code: "CYCLE_EXPIRED",
                message: "Your billing cycle has expired. Please renew your subscription."
            });
        }

        const remaining = quota.allowanceEur - quota.usedEur;

        if (remaining < COST_PER_MESSAGE_EUR) {
            return res.status(403).json({
                success: false,
                code: "QUOTA_EXCEEDED",
                message: "You have reached your AI usage limit for this billing cycle. Purchase a reload or wait for your next cycle.",
                quota: {
                    allowanceEur: quota.allowanceEur,
                    usedEur: parseFloat(quota.usedEur.toFixed(4)),
                    remainingEur: parseFloat(Math.max(0, remaining).toFixed(4)),
                    reloadCount: quota.reloadCount,
                    cycleEndDate: quota.cycleEndDate
                }
            });
        }

        req.aiQuota = quota;
        next();
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = checkAiQuota;
