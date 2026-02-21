const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { createMotivationalTip, getAllMotivationalTips, getMotivationalTip, updateMotivationalTip, deleteMotivationalTip } = require("../controllers/motivationaltipController");

router.post("/", verifyToken, createMotivationalTip);
router.get("/", getAllMotivationalTips); // Public access to view tips
router.get("/:id", getMotivationalTip);
router.put("/:id", verifyToken, updateMotivationalTip);
router.delete("/:id", verifyToken, deleteMotivationalTip);

module.exports = router;
