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
    getUserById,
    completeProfile,
    updateUser,
    deleteUser,
    loginUser,
    changePassword,
    getAllUsers,
    googleLogin,
    updateNotificationPreferences
} = require("../controllers/authController");

const verifyToken = require("../middleware/verifyToken");
// Authentication routes
router.post("/register", registerUser);
router.post("/verify-otp", verifyOtp);
router.post("/resend-otp", resendOtp);
router.post("/login", loginUser);
router.post("/google", googleLogin);

// Forgot password routes
router.post("/forgot-password", forgotPassword);
router.post("/verify-reset-otp", verifyResetOTP);
router.post("/reset-password", resetPassword);

router.get("/profile", verifyToken, getUserProfile);
router.get("/user/:id", verifyToken, getUserById);
router.post("/complete-profile", verifyToken, completeProfile);
router.put("/change-password", verifyToken, changePassword);
router.put("/settings/notifications", verifyToken, updateNotificationPreferences);

// Admin routes (optional - add authentication middleware if needed)
router.get("/users", verifyToken, getAllUsers);
router.put("/:id", updateUser);
router.delete("/:id", deleteUser);



module.exports = router;