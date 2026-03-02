const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { reportPost, getMyReportedPosts } = require("../controllers/postReportController");

router.post("/", verifyToken, reportPost);
router.get("/", verifyToken, getMyReportedPosts);

module.exports = router;
