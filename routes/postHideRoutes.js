const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { hidePost, checkHiddenPosts } = require("../controllers/postHideController");

router.post("/", verifyToken, hidePost);
router.get("/", verifyToken, checkHiddenPosts);

module.exports = router;
