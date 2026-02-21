const express = require("express");
const router = express.Router();
const {
    sendNotification,
    getNotifications,
    deleteNotification
} = require("../controllers/notificationController");
const verifyToken = require("../middleware/verifyToken");

// Send Notifications
router.post("/send", verifyToken, sendNotification);

// Get & Manage Notifications
router.get("/", verifyToken, getNotifications);
router.delete("/:notificationId", verifyToken, deleteNotification);

module.exports = router;