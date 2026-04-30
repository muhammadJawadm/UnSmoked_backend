const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { 
    createMilestone, 
    getAllMilestones, 
    getMilestoneById, 
    updateMilestone, 
    deleteMilestone, 
    getUserAchievedMilestones,
    createUserMilestone
} = require("../controllers/milestoneController");

router.post("/", verifyToken, createMilestone);
router.get("/", verifyToken, getAllMilestones);

// User Milestones
router.get("/achieved", verifyToken, getUserAchievedMilestones);
router.post("/achieved", verifyToken, createUserMilestone);

router.get("/:id", verifyToken, getMilestoneById);
router.put("/:id", verifyToken, updateMilestone);
router.delete("/:id", verifyToken, deleteMilestone);

module.exports = router;
