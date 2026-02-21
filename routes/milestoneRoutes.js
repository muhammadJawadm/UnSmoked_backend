const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { createMilestone, getAllMilestones, getMilestoneById, updateMilestone, deleteMilestone } = require("../controllers/milestoneController");

router.post("/", verifyToken, createMilestone);
router.get("/", verifyToken, getAllMilestones);
router.get("/:id", verifyToken, getMilestoneById);
router.put("/:id", verifyToken, updateMilestone);
router.delete("/:id", verifyToken, deleteMilestone);

module.exports = router;
