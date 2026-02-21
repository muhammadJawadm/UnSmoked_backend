const express = require("express");
const router = express.Router();
const {
    registerUser,
    verifyOtp,
    resendOtp,
    forgotPassword,
    verifyResetOTP,
    resetPassword,
    getUserProfile,
    completeProfile,
    updateUser,
    deleteUser,
    loginUser
} = require("../controllers/authController");
const verifyToken = require("../middleware/verifyToken");
// Authentication routes
router.post("/register", registerUser);
router.post("/verify-otp", verifyOtp);
router.post("/resend-otp", resendOtp);
router.post("/login", loginUser);

// Forgot password routes
router.post("/forgot-password", forgotPassword);
router.post("/verify-reset-otp", verifyResetOTP);
router.post("/reset-password", resetPassword);

router.get("/profile", verifyToken, getUserProfile);
router.post("/complete-profile", verifyToken, completeProfile);

// Admin routes (optional - add authentication middleware if needed)
router.put("/:id", updateUser);
router.delete("/:id", deleteUser);


module.exports = router;