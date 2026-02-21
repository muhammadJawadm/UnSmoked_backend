const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const { addLike, countLikes, unlike, checkLikeStatus } = require("../controllers/likeController");

router.post("/", verifyToken, addLike);
router.get("/count", verifyToken, countLikes);
router.delete("/", verifyToken, unlike);
router.get("/check", verifyToken, checkLikeStatus);

module.exports = router;