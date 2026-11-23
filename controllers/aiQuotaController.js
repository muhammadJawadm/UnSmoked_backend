const AiQuota = require("../models/AiQuota");
const { checkActiveSubscription, verifyReloadPurchase, getSubscriberInfo } = require("../services/revenueCatService");

const BASE_ALLOWANCE_EUR = 0.50;
const RELOAD_AMOUNT_EUR = 0.50;

// ──────────────────────────────────────────────────────────────────────────────
// POST /ai-quota/initialize
// Called by the mobile app after the user's first premium subscription purchase.
// Also used on subsequent subscription renewals to reset the cycle.
// Body: { revenueCatUserId }   (the app_user_id the mobile app set in RevenueCat)
// ──────────────────────────────────────────────────────────────────────────────
exports.initializeQuota = async (req, res) => {
    try {
        const { revenueCatUserId } = req.body;

        if (!revenueCatUserId) {
            return res.status(400).json({ success: false, message: "revenueCatUserId is required" });
        }

        // Verify the subscription is active via RevenueCat
        const sub = await checkActiveSubscription(revenueCatUserId);
        if (!sub.isActive) {
            return res.status(403).json({
                success: false,
                code: "NO_ACTIVE_SUBSCRIPTION",
                message: "No active premium subscription found in RevenueCat."
            });
        }

        // Upsert the quota record — resets usage on each renewal
        const quota = await AiQuota.findOneAndUpdate(
            { user: req.user.id },
            {
                $set: {
                    allowanceEur: BASE_ALLOWANCE_EUR,
                    usedEur: 0,
                    reloadCount: 0,
                    cycleStartDate: sub.purchaseDate,
                    cycleEndDate: sub.expiresDate,
                    revenueCatUserId
                }
            },
            { upsert: true, new: true }
        );

        res.status(200).json({
            success: true,
            message: "AI quota initialized successfully.",
            quota: {
                allowanceEur: quota.allowanceEur,
                usedEur: quota.usedEur,
                remainingEur: parseFloat((quota.allowanceEur - quota.usedEur).toFixed(4)),
                reloadCount: quota.reloadCount,
                cycleStartDate: quota.cycleStartDate,
                cycleEndDate: quota.cycleEndDate
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ──────────────────────────────────────────────────────────────────────────────
// POST /ai-quota/reload
// Called by the mobile app after the user purchases the €3.99 reload pack.
// Body: { transactionId }   (store transaction id from the purchase receipt)
// ──────────────────────────────────────────────────────────────────────────────
exports.purchaseReload = async (req, res) => {
    try {
        const { transactionId } = req.body;

        if (!transactionId) {
            return res.status(400).json({ success: false, message: "transactionId is required" });
        }

        const quota = await AiQuota.findOne({ user: req.user.id });
        if (!quota) {
            return res.status(404).json({
                success: false,
                code: "NO_AI_QUOTA",
                message: "No AI quota record found. Initialize quota first."
            });
        }

        // Prevent duplicate reload for the same transaction
        const alreadyUsed = quota.reloadHistory.some(r => r.transactionId === transactionId);
        if (alreadyUsed) {
            return res.status(409).json({
                success: false,
                code: "DUPLICATE_TRANSACTION",
                message: "This reload transaction has already been applied."
            });
        }

        // Verify the reload purchase with RevenueCat
        const purchase = await verifyReloadPurchase(quota.revenueCatUserId);
        if (!purchase.valid) {
            return res.status(403).json({
                success: false,
                code: "PURCHASE_NOT_FOUND",
                message: "Reload purchase could not be verified with RevenueCat."
            });
        }

        // Apply the reload
        quota.allowanceEur += RELOAD_AMOUNT_EUR;
        quota.reloadCount += 1;
        quota.reloadHistory.push({
            transactionId,
            purchasedAt: new Date(),
            amountEur: RELOAD_AMOUNT_EUR
        });
        await quota.save();

        res.status(200).json({
            success: true,
            message: "Reload applied successfully. You have an additional €1.50 AI allowance.",
            quota: {
                allowanceEur: quota.allowanceEur,
                usedEur: parseFloat(quota.usedEur.toFixed(4)),
                remainingEur: parseFloat((quota.allowanceEur - quota.usedEur).toFixed(4)),
                reloadCount: quota.reloadCount,
                cycleEndDate: quota.cycleEndDate
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ──────────────────────────────────────────────────────────────────────────────
// GET /ai-quota/status
// Returns the user's current AI quota status.
// ──────────────────────────────────────────────────────────────────────────────
exports.getQuotaStatus = async (req, res) => {
    try {
        const quota = await AiQuota.findOne({ user: req.user.id });

        if (!quota) {
            return res.status(200).json({
                success: true,
                hasQuota: false,
                message: "No AI quota. User needs an active premium subscription."
            });
        }

        const remaining = Math.max(0, quota.allowanceEur - quota.usedEur);
        const now = new Date();

        res.status(200).json({
            success: true,
            hasQuota: true,
            quota: {
                allowanceEur: quota.allowanceEur,
                usedEur: parseFloat(quota.usedEur.toFixed(4)),
                remainingEur: parseFloat(remaining.toFixed(4)),
                reloadCount: quota.reloadCount,
                cycleStartDate: quota.cycleStartDate,
                cycleEndDate: quota.cycleEndDate,
                isCycleActive: now <= quota.cycleEndDate,
                canReload: remaining < 0.03 // hint to mobile: show reload button
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ──────────────────────────────────────────────────────────────────────────────
// POST /ai-quota/webhook
// RevenueCat server-to-server webhook.
// Handles RENEWAL, EXPIRATION, etc. to auto-reset or expire the quota.
// Set this URL in your RevenueCat dashboard → Integrations → Webhooks.
// ──────────────────────────────────────────────────────────────────────────────
exports.revenueCatWebhook = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader !== `Bearer ${process.env.REVENUECAT_WEBHOOK_SECRET}`) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const event = req.body.event;
        if (!event) {
            return res.status(400).json({ success: false, message: "No event in body" });
        }

        const { type, app_user_id, expiration_at_ms, purchase_date_ms } = event;
        if (!app_user_id) {
            return res.status(200).json({ success: true, message: "No app_user_id, skipping" });
        }

        const quota = await AiQuota.findOne({ revenueCatUserId: app_user_id });
        if (!quota) {
            return res.status(200).json({ success: true, message: "No quota record for this user, skipping" });
        }

        switch (type) {
            case "RENEWAL":
            case "INITIAL_PURCHASE": {
                // Reset quota for the new billing cycle
                quota.allowanceEur = BASE_ALLOWANCE_EUR;
                quota.usedEur = 0;
                quota.reloadCount = 0;
                quota.reloadHistory = [];
                if (purchase_date_ms) quota.cycleStartDate = new Date(purchase_date_ms);
                if (expiration_at_ms) quota.cycleEndDate = new Date(expiration_at_ms);
                await quota.save();
                break;
            }
            case "EXPIRATION":
            case "CANCELLATION": {
                // Cycle ended — the middleware will block further messages
                if (expiration_at_ms) {
                    quota.cycleEndDate = new Date(expiration_at_ms);
                    await quota.save();
                }
                break;
            }
            default:
                break;
        }

        res.status(200).json({ success: true });
    } catch (error) {
        console.error("[RevenueCat Webhook]", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};
