const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const {
    initializeQuota,
    purchaseReload,
    getQuotaStatus,
    revenueCatWebhook
} = require("../controllers/aiQuotaController");

// Authenticated user routes
router.post("/initialize", verifyToken, initializeQuota);
router.post("/reload", verifyToken, purchaseReload);
router.get("/status", verifyToken, getQuotaStatus);

// RevenueCat webhook (server-to-server, no JWT — uses its own auth header)
router.post("/webhook/revenuecat", revenueCatWebhook);

module.exports = router;
