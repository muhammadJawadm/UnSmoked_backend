const express = require("express");
const router = express.Router();
const { createCompetitionWithFriend, getCompetition } = require("../controllers/competitionController");
const verifyToken = require("../middleware/verifyToken");

router.post("/create", verifyToken, createCompetitionWithFriend);
router.get("/:id", verifyToken, getCompetition);

module.exports = router;
