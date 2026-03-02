const User = require("../models/User");
const bcrypt = require("bcryptjs");
const otpGenerator = require("otp-generator");
const sgMail = require("@sendgrid/mail");
const Otp = require("../models/Otp");
const generateToken = require("../utils/jwt");

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const sendOTPEmail = async (email, otp) => {
    const msg = {
        to: email,
        from: process.env.SENDGRID_FROM_EMAIL, // Must be a verified sender in SendGrid
        subject: "Your OTP for verification",
        text: `Your OTP is ${otp}`,
        html: `<p>Your OTP is <strong>${otp}</strong></p>`,
    };

    try {
        await sgMail.send(msg);
        console.log("Email sent to:", email);
    } catch (error) {
        console.error("Failed to send OTP email:", error.response?.body?.errors || error.message);
        // Don't throw — let the registration/flow continue even if email fails
    }
};

exports.registerUser = async (req, res) => {
    let { name, email, phone, password } = req.body;
    try {

        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        if (!phone) {
            return res.status(400).json({ message: "Phone is required" });
        }

        email = email.trim().toLowerCase();

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "User already exists with this email" });
        }

        const existingPhone = await User.findOne({ phone });
        if (existingPhone) {
            return res.status(400).json({ message: "User already exists with this phone number" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({ name, email, phone, password: hashedPassword });

        await newUser.save();

        const otp = otpGenerator.generate(6, { digits: true, upperCaseAlphabets: false, lowerCaseAlphabets: false, specialChars: false });

        const expiresAt = new Date(Date.now() + 300000);

        const otpEntry = new Otp({ userId: newUser._id, otp, expiresAt });

        await otpEntry.save();

        await sendOTPEmail(email, otp);

        // Generate token for immediate authentication
        const token = generateToken(newUser._id);

        res.status(201).json({
            message: "User registered successfully",
            token,
            user: {
                id: newUser._id,
                name: newUser.name,
                email: newUser.email,
                phone: newUser.phone,
                is_verified: newUser.is_verified
            }
        });

    } catch (error) {
        // Handle MongoDB duplicate key errors gracefully
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(400).json({ message: `A user with this ${field} already exists` });
        }
        console.error(error);
        res.status(500).json({ message: "Internal server error", error });
    }
};

exports.verifyOtp = async (req, res) => {
    const { email, otp } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const otpEntry = await Otp.findOne({ userId: user._id });
        if (!otpEntry) {
            return res.status(404).json({ message: "OTP not found" });
        }

        if (otpEntry.otp !== otp || otpEntry.expiresAt < Date.now()) {
            return res.status(400).json({ message: "Invalid or expired OTP" });
        }

        user.is_verified = true;
        await user.save();

        await Otp.deleteOne({ userId: user._id });

        res.status(200).json({ message: "OTP verified successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error", error });
    }
};

// Resend OTP (for unverified users whose OTP expired)
exports.resendOtp = async (req, res) => {
    const { email } = req.body;
    try {
        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        const user = await User.findOne({ email: email.trim().toLowerCase() });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // If already verified, no need to resend
        if (user.is_verified) {
            return res.status(400).json({ message: "Account is already verified. Please login." });
        }

        // Delete any existing OTP for this user
        await Otp.deleteMany({ userId: user._id });

        // Generate new OTP
        const otp = otpGenerator.generate(6, { digits: true, upperCaseAlphabets: false, lowerCaseAlphabets: false, specialChars: false });
        const expiresAt = new Date(Date.now() + 300000); // 5 minutes

        // Save new OTP
        const otpEntry = new Otp({ userId: user._id, otp, expiresAt });
        await otpEntry.save();

        // Send email
        await sendOTPEmail(email, otp);

        res.status(200).json({ message: "OTP resent successfully. Please check your email." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error", error });
    }
};

// Forgot Password - Request OTP
exports.forgotPassword = async (req, res) => {
    const { email } = req.body;
    try {
        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Delete any existing OTP for this user
        await Otp.deleteMany({ userId: user._id });

        // Generate new OTP
        const otp = otpGenerator.generate(6, { digits: true, upperCaseAlphabets: false, lowerCaseAlphabets: false, specialChars: false });
        const expiresAt = new Date(Date.now() + 300000); // 5 minutes

        // Save OTP
        const otpEntry = new Otp({ userId: user._id, otp, expiresAt });
        await otpEntry.save();

        // Send OTP email
        await sendOTPEmail(email, otp);

        res.status(200).json({ message: "OTP sent to your email" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error", error });
    }
};


// Verify Reset OTP
exports.verifyResetOTP = async (req, res) => {
    const { email, otp } = req.body;
    try {
        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Find OTP
        const otpEntry = await Otp.findOne({ userId: user._id });
        if (!otpEntry) {
            return res.status(404).json({ message: "OTP not found or expired" });
        }

        // Verify OTP
        if (otpEntry.otp !== otp || otpEntry.expiresAt < Date.now()) {
            return res.status(400).json({ message: "Invalid or expired OTP" });
        }

        // OTP is valid - don't delete, keep it for password reset
        res.status(200).json({
            message: "OTP verified successfully. You can now reset your password.",
            resetToken: user._id
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error", error });
    }
};

// Reset Password
exports.resetPassword = async (req, res) => {
    const { email, password, confirmPassword } = req.body;
    try {
        // Validate password match
        if (password !== confirmPassword) {
            return res.status(400).json({ message: "Passwords do not match" });
        }

        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Check if OTP exists and is still valid (user must have verified OTP in step 2)
        const otpEntry = await Otp.findOne({ userId: user._id });
        if (!otpEntry) {
            return res.status(400).json({ message: "Please verify OTP first before resetting password" });
        }

        // Check OTP hasn't expired
        if (otpEntry.expiresAt < Date.now()) {
            await Otp.deleteOne({ userId: user._id });
            return res.status(400).json({ message: "OTP expired. Please request a new one." });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Update password
        user.password = hashedPassword;
        user.updated_at = Date.now();
        await user.save();

        // Delete OTP (cleanup - only deleted once here)
        await Otp.deleteOne({ userId: user._id });

        res.status(200).json({ message: "Password reset successfully. You can now login with your new password." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error", error });
    }
};

// Login user
exports.loginUser = async (req, res) => {
    const { email, password } = req.body;
    try {
        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        // Check if user is verified
        if (!user.is_verified) {
            return res.status(403).json({ message: "Please verify your email first" });
        }


        // Generate JWT token
        const token = generateToken(user._id);



        res.status(200).json({
            message: "Login successful",
            token,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Complete user profile
exports.completeProfile = async (req, res) => {
    const { id } = req.user; // JWT token provides 'id'
    const {
        cigarettes_per_day,
        cost,
        per,
        amount_of_cigarettes_per_pack,
        health_goal,
        about_me,
        profile_picture // Simple URL string from frontend (they handle Cloudinary upload)
    } = req.body;

    try {
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Update profile fields (only if provided)
        if (cigarettes_per_day !== undefined) user.cigarettes_per_day = cigarettes_per_day;
        if (cost !== undefined) user.cost = cost;
        if (per !== undefined) user.per = per;
        if (amount_of_cigarettes_per_pack !== undefined) user.amount_of_cigarettes_per_pack = amount_of_cigarettes_per_pack;
        if (health_goal !== undefined) user.health_goal = health_goal;
        if (about_me !== undefined) user.about_me = about_me;

        // Accept profile picture URL from frontend (they handle Cloudinary upload)
        if (profile_picture) {
            user.profile_picture = profile_picture;
        }

        user.updated_at = Date.now();
        await user.save();

        res.status(200).json({
            message: "Profile updated successfully",
            user
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Get user profile
exports.getUserProfile = async (req, res) => {
    const { id } = req.user; // From JWT token

    try {
        const user = await User.findById(id).select("-password");
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.status(200).json({ user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Update user (admin function - be careful with this)
exports.updateUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Only update provided fields
        if (req.body.name) user.name = req.body.name;
        if (req.body.email) user.email = req.body.email;
        if (req.body.phone) user.phone = req.body.phone;
        if (req.body.profile_picture) user.profile_picture = req.body.profile_picture;
        if (req.body.cigarettes_per_day) user.cigarettes_per_day = req.body.cigarettes_per_day;
        if (req.body.cost) user.cost = req.body.cost;
        if (req.body.per) user.per = req.body.per;
        if (req.body.amount_of_cigarettes_per_pack) user.amount_of_cigarettes_per_pack = req.body.amount_of_cigarettes_per_pack;
        if (req.body.health_goal) user.health_goal = req.body.health_goal;
        if (req.body.about_me) user.about_me = req.body.about_me;
        if (req.body.fcm_token) {
            // Add to the tokens array without duplicates
            if (!user.fcm_tokens.includes(req.body.fcm_token)) {
                user.fcm_tokens.push(req.body.fcm_token);
            }
        }

        user.updated_at = Date.now();
        await user.save();

        res.json({ message: "User updated successfully", user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Change Password (authenticated user changes their own password)
exports.changePassword = async (req, res) => {
    const { id } = req.user; // From JWT token
    const { currentPassword, newPassword, confirmPassword } = req.body;

    try {
        // Validate required fields
        if (!currentPassword) {
            return res.status(400).json({ message: "Current password is required" });
        }
        if (!newPassword) {
            return res.status(400).json({ message: "New password is required" });
        }
        if (!confirmPassword) {
            return res.status(400).json({ message: "Please confirm your new password" });
        }

        // Validate new password matches confirm password
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ message: "New password and confirm password do not match" });
        }

        // Find user
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Verify current password is correct
        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isCurrentPasswordValid) {
            return res.status(401).json({ message: "Current password is incorrect" });
        }

        // Check new password is not the same as the current password
        const isSamePassword = await bcrypt.compare(newPassword, user.password);
        if (isSamePassword) {
            return res.status(400).json({ message: "New password cannot be the same as your current password" });
        }

        // Hash and save the new password
        user.password = await bcrypt.hash(newPassword, 10);
        user.updated_at = Date.now();
        await user.save();

        res.status(200).json({ message: "Password changed successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Delete user
exports.deleteUser = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        if (user.id != userId) {
            return res.status(403).json({ message: "You are not authorized to delete this user" });
        }

        await User.findByIdAndDelete(req.params.id);

        res.json({ message: "User deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error" });
    }
};
