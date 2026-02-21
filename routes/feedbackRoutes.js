const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { createFeedback, getAllFeedback, getFeedbackById, updateFeedback, deleteFeedback } = require("../controllers/feedbackController");

router.post("/", verifyToken, createFeedback);
router.get("/", verifyToken, getAllFeedback);
router.get("/:id", verifyToken, getFeedbackById);
router.put("/:id", verifyToken, updateFeedback);
router.delete("/:id", verifyToken, deleteFeedback);

module.exports = router;
