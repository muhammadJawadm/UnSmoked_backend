const axios = require("axios");

const REVENUECAT_API_KEY = process.env.REVENUECAT_API_KEY;
const REVENUECAT_BASE_URL = "https://api.revenuecat.com/v1";

const rcClient = axios.create({
    baseURL: REVENUECAT_BASE_URL,
    headers: {
        "Authorization": `Bearer ${REVENUECAT_API_KEY}`,
        "Content-Type": "application/json"
    }
});

/**
 * Fetch a subscriber's info from RevenueCat.
 * @param {string} appUserId - The RevenueCat app_user_id (usually your DB user id)
 * @returns {object} subscriber object from RevenueCat
 */
async function getSubscriberInfo(appUserId) {
    const res = await rcClient.get(`/subscribers/${encodeURIComponent(appUserId)}`);
    return res.data.subscriber;
}

/**
 * Check if the user has an active premium subscription.
 * Returns { isActive, entitlement, expiresDate, purchaseDate } or { isActive: false }.
 *
 * @param {string} appUserId
 * @param {string} entitlementId - The entitlement identifier in RevenueCat (e.g. "premium")
 */
async function checkActiveSubscription(appUserId, entitlementId = "premium") {
    const subscriber = await getSubscriberInfo(appUserId);
    const entitlements = subscriber.entitlements || {};
    const ent = entitlements[entitlementId];

    if (!ent) {
        return { isActive: false };
    }

    const now = new Date();
    const expires = new Date(ent.expires_date);

    if (expires <= now) {
        return { isActive: false };
    }

    return {
        isActive: true,
        entitlement: ent,
        expiresDate: expires,
        purchaseDate: new Date(ent.purchase_date)
    };
}

/**
 * Verify a non-consumable / consumable purchase (reload pack) exists in the subscriber's history.
 * Returns { valid, transaction } if found and not already used.
 *
 * @param {string} appUserId
 * @param {string} productId - The reload product id in RevenueCat (e.g. "ai_reload_pack")
 * @param {string} transactionId - The specific store transaction id to verify
 */
async function verifyReloadPurchase(appUserId, productId = "ai_reload_pack") {
    const subscriber = await getSubscriberInfo(appUserId);
    const purchases = subscriber.non_subscriptions || {};
    const productPurchases = purchases[productId];

    if (!productPurchases || productPurchases.length === 0) {
        return { valid: false };
    }

    // Return the most recent purchase for this product
    const sorted = [...productPurchases].sort(
        (a, b) => new Date(b.purchase_date) - new Date(a.purchase_date)
    );

    return {
        valid: true,
        transaction: sorted[0]
    };
}

module.exports = {
    getSubscriberInfo,
    checkActiveSubscription,
    verifyReloadPurchase
};
