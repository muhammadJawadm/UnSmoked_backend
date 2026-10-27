const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { getPrivacyPolicy, updatePrivacyPolicy } = require("../controllers/privacyPolicyController");

router.get("/", getPrivacyPolicy); // public — no login required to view
router.put("/", verifyToken, updatePrivacyPolicy); // admin only

module.exports = router;
