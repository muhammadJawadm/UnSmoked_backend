const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { createContact, getContacts, getContact, updateContact, deleteContact } = require("../controllers/contactController");

// User routes
router.post("/", verifyToken, createContact); // User submits issue

// Admin routes
router.get("/", verifyToken, getContacts); // Get all contacts
router.get("/:id", verifyToken, getContact); // Get single contact
router.put("/:id", verifyToken, updateContact); // Admin responds to issue
router.delete("/:id", verifyToken, deleteContact); // Delete contact

module.exports = router;
