const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { createTask, getAllTasks, getTaskById, updateTask, deleteTask } = require("../controllers/taskController");
router.post("/", verifyToken, createTask);
router.get("/", verifyToken, getAllTasks);
router.get("/:id", verifyToken, getTaskById);
router.put("/:id", verifyToken, updateTask);
router.delete("/:id", verifyToken, deleteTask);

module.exports = router;
