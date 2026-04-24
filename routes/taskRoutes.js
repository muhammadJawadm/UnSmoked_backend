const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const {
    createTask,
    getAllTasks,
    getTaskById,
    updateTask,
    deleteTask,
    assignChallengeTask,
    getMyAssignedTasks,
    getTasksIAssigned,
    completeAssignedTask,
} = require("../controllers/taskController");

// ── Standard task CRUD ────────────────────────────────────────────────────────
router.post("/", verifyToken, createTask);
router.get("/", verifyToken, getAllTasks);

// ── Challenge task assignment (static routes must come BEFORE /:id) ───────────
// Winner assigns task(s) to the loser
router.post("/challenge-assign", verifyToken, assignChallengeTask);
// Loser: see tasks assigned to me  (?challengeId=...&status=pending|completed)
router.get("/my-assigned", verifyToken, getMyAssignedTasks);
// Winner: see tasks I assigned  (?challengeId=...&status=...)
router.get("/i-assigned", verifyToken, getTasksIAssigned);
// Loser: mark a specific assignment as done
router.patch("/challenge-assign/:id/complete", verifyToken, completeAssignedTask);

// ── Standard task CRUD (by id) ────────────────────────────────────────────────
router.get("/:id", verifyToken, getTaskById);
router.put("/:id", verifyToken, updateTask);
router.delete("/:id", verifyToken, deleteTask);

module.exports = router;
