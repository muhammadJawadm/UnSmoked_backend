const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { createFaq, getAllFaqs, getFaqById, updateFaq, deleteFaq } = require("../controllers/faqController");

router.post("/", verifyToken, createFaq);
router.get("/", getAllFaqs); // Public access to view FAQs
router.get("/:id", getFaqById);
router.put("/:id", verifyToken, updateFaq);
router.delete("/:id", verifyToken, deleteFaq);

module.exports = router;
