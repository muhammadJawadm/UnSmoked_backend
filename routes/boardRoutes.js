const express = require("express");
const router = express.Router();
const { /*createBoard,*/ getBoard, markTodayStatus } = require("../controllers/boardController");
const verifyToken = require("../middleware/verifyToken");

// router.post("/create", verifyToken, createBoard); // disabled — boards created via competition only
router.get("/", verifyToken, getBoard);
router.post("/mark-today", verifyToken, markTodayStatus);

module.exports = router;