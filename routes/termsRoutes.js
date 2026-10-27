const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { getTerms, updateTerms } = require("../controllers/termsController");

router.get("/", getTerms); // public — no login required to view
router.put("/", verifyToken, updateTerms); // admin only

module.exports = router;
