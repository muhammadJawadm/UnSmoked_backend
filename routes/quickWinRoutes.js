const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const {
    createQuickWin,
    getAllQuickWins,
    getAllQuickWinsAdmin,
    getQuickWin,
    updateQuickWin,
    deleteQuickWin
} = require("../controllers/quickWinController");

// Admin: get all (including inactive)
router.get("/all", verifyToken, getAllQuickWinsAdmin);

// Standard CRUD
router.post("/", verifyToken, createQuickWin);
router.get("/", getAllQuickWins);           // Public: active only
router.get("/:id", getQuickWin);
router.put("/:id", verifyToken, updateQuickWin);
router.delete("/:id", verifyToken, deleteQuickWin);

module.exports = router;
