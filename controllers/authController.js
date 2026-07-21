const mongoose = require("mongoose");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const otpGenerator = require("otp-generator");
const Otp = require("../models/Otp");
const generateToken = require("../utils/jwt");
const UserProgress = require("../models/UserProgress");
const { calculateLevel } = require("../utils/xpSystem");
const { getUserOverview } = require("../utils/overviewSystem");
const { OAuth2Client } = require("google-auth-library");
const Post = require("../models/Post");
const Blog = require("../models/Blog");
const Comment = require("../models/Comment");
const Like = require("../models/Like");
const PostHide = require("../models/PostHide");
const PostReport = require("../models/PostReport");
const Notification = require("../models/Notifications");
const Contact = require("../models/Contact");
const Feedback = require("../models/Feedback");
const Badges = require("../models/Badges");
const UserMilestone = require("../models/UserMilestone");
const UserOverview = require("../models/UserOverview");
const DailyBoard = require("../models/DailyBoard");
const MonthlyBoard = require("../models/MonthlyBoard");
const Challenge = require("../models/Challenges");
const ChallengeParticipant = require("../models/ChallengeParticipant");
const ChallengeTaskAssignment = require("../models/ChallengeTaskAssignment");
const Competition = require("../models/Competition");
const Board = require("../models/Board");
const Template = require("../models/Template");
const Chat = require("../models/Chat");
const Message = require("../models/Message");
const Task = require("../models/Task");
const sendEmail = require("../utils/sendEmail");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);


const deleteUserCascade = async (userId, session = null) => {
    const queryOptions = session ? { session } : {};

    const [
        postIds,
        blogIds,
        chatIds,
        createdChallengeIds,
        createdCompetitionIds,
    ] = await Promise.all([
        Post.distinct("_id", { userId }).session(session),
        Blog.distinct("_id", { userId }).session(session),
        Chat.distinct("_id", { user: userId }).session(session),
        Challenge.distinct("_id", { createdBy: userId }).session(session),
        Competition.distinct("_id", { createdBy: userId }).session(session),
    ]);

    await Otp.deleteMany({ userId }, queryOptions);
    await UserProgress.deleteMany({ userId }, queryOptions);
    await UserOverview.deleteMany({ userId }, queryOptions);
    await UserMilestone.deleteMany({ userId }, queryOptions);
    await Badges.deleteMany({ userId }, queryOptions);

    await PostHide.deleteMany({ userId }, queryOptions);
    await PostReport.deleteMany({ userId }, queryOptions);
    await Comment.deleteMany(
        {
            $or: [
                { userId },
                { targetType: "Post", targetId: { $in: postIds } },
                { targetType: "Blog", targetId: { $in: blogIds } },
            ],
        },
        queryOptions
    );
    await Like.deleteMany(
        {
            $or: [
                { userId },
                { targetType: "Post", targetId: { $in: postIds } },
                { targetType: "Blog", targetId: { $in: blogIds } },
            ],
        },
        queryOptions
    );
    await Post.deleteMany({ userId }, queryOptions);
    await Blog.deleteMany({ userId }, queryOptions);

    await Notification.deleteMany({ userId }, queryOptions);
    await Contact.deleteMany({ userId }, queryOptions);
    await Feedback.deleteMany({ userId }, queryOptions);
    await Task.deleteMany({ userId }, queryOptions);

    await DailyBoard.deleteMany(
        {
            $or: [
                { userId },
                { challengeId: { $in: createdChallengeIds } },
            ],
        },
        queryOptions
    );
    await MonthlyBoard.deleteMany({ userId }, queryOptions);

    await ChallengeParticipant.deleteMany(
        {
            $or: [
                { userId },
                { challengeId: { $in: createdChallengeIds } },
            ],
        },
        queryOptions
    );
    await ChallengeTaskAssignment.deleteMany(
        {
            $or: [
                { assignedBy: userId },
                { assignedTo: userId },
                { challengeId: { $in: createdChallengeIds } },
            ],
        },
        queryOptions
    );
    await Challenge.deleteMany({ createdBy: userId }, queryOptions);
    await Challenge.updateMany(
        { winner: userId },
        { $unset: { winner: "" } },
        queryOptions
    );

    await Board.deleteMany(
        {
            $or: [
                { userId },
                { competition: { $in: createdCompetitionIds } },
            ],
        },
        queryOptions
    );
    await Competition.deleteMany({ createdBy: userId }, queryOptions);
    await Competition.updateMany(
        { "players.user": userId },
        { $pull: { players: { user: userId } } },
        queryOptions
    );

    await Template.deleteMany({ createdBy: userId }, queryOptions);
    await Chat.deleteMany({ user: userId }, queryOptions);
    await Message.deleteMany({ chat: { $in: chatIds } }, queryOptions);
};

exports.registerUser = async (req, res) => {
    let { name, email, phone, password, currency } = req.body;
    try {

        if (!email) {
            return res.status(400).json({ success: false, message: "Email is required" });
        }

        if (!phone) {
            return res.status(400).json({ success: false, message: "Phone is required" });
        }

        email = email.trim().toLowerCase();

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: "User already exists with this email" });
        }

        const existingPhone = await User.findOne({ phone });
        if (existingPhone) {
            return res.status(400).json({ success: false, message: "User already exists with this phone number" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            name,
            email,
            phone,
            password: hashedPassword,
            currency: ["USD", "EUR"].includes(currency) ? currency : "USD",
        });

        await newUser.save();

        const otp = otpGenerator.generate(6, { digits: true, upperCaseAlphabets: false, lowerCaseAlphabets: false, specialChars: false });

        const expiresAt = new Date(Date.now() + 300000);

        const otpEntry = new Otp({ userId: newUser._id, otp, expiresAt });

        await otpEntry.save();

        await sendEmail(email, otp);

        // Generate token for immediate authentication
        const token = generateToken(newUser._id, newUser.role);

        res.status(201).json({
            success: true,
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
            return res.status(400).json({ success: false, message: `A user with this ${field} already exists` });
        }
        console.error(error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

exports.verifyOtp = async (req, res) => {
    const { email, otp } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const otpEntry = await Otp.findOne({ userId: user._id });
        if (!otpEntry) {
            return res.status(404).json({ success: false, message: "OTP not found" });
        }

        if (otpEntry.otp !== otp || otpEntry.expiresAt < Date.now()) {
            return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
        }

        user.is_verified = true;
        await user.save();

        await Otp.deleteOne({ userId: user._id });

        res.status(200).json({ success: true, message: "OTP verified successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

// Resend OTP (for unverified users whose OTP expired)
exports.resendOtp = async (req, res) => {
    const { email } = req.body;
    try {
        if (!email) {
            return res.status(400).json({ success: false, message: "Email is required" });
        }

        const user = await User.findOne({ email: email.trim().toLowerCase() });
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // If already verified, no need to resend
        if (user.is_verified) {
            return res.status(400).json({ success: false, message: "Account is already verified. Please login." });
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
        await sendEmail(email, otp);

        res.status(200).json({ success: true, message: "OTP resent successfully. Please check your email." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

// Forgot Password - Request OTP
exports.forgotPassword = async (req, res) => {
    const { email } = req.body;
    try {
        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
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
        await sendEmail(email, otp);

        res.status(200).json({ success: true, message: "OTP sent to your email" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};


// Verify Reset OTP
exports.verifyResetOTP = async (req, res) => {
    const { email, otp } = req.body;
    try {
        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Find OTP
        const otpEntry = await Otp.findOne({ userId: user._id });
        if (!otpEntry) {
            return res.status(404).json({ success: false, message: "OTP not found or expired" });
        }

        // Verify OTP
        if (otpEntry.otp !== otp || otpEntry.expiresAt < Date.now()) {
            return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
        }

        // OTP is valid - don't delete, keep it for password reset
        res.status(200).json({
            success: true,
            message: "OTP verified successfully. You can now reset your password.",
            resetToken: user._id
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

// Reset Password
exports.resetPassword = async (req, res) => {
    const { email, password, confirmPassword } = req.body;
    try {
        // Validate password match
        if (password !== confirmPassword) {
            return res.status(400).json({ success: false, message: "Passwords do not match" });
        }

        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Check if OTP exists and is still valid (user must have verified OTP in step 2)
        const otpEntry = await Otp.findOne({ userId: user._id });
        if (!otpEntry) {
            return res.status(400).json({ success: false, message: "Please verify OTP first before resetting password" });
        }

        // Check OTP hasn't expired
        if (otpEntry.expiresAt < Date.now()) {
            await Otp.deleteOne({ userId: user._id });
            return res.status(400).json({ success: false, message: "OTP expired. Please request a new one." });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Update password
        user.password = hashedPassword;
        user.updated_at = Date.now();
        await user.save();

        // Delete OTP (cleanup - only deleted once here)
        await Otp.deleteOne({ userId: user._id });

        res.status(200).json({ success: true, message: "Password reset successfully. You can now login with your new password." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

// Login user
exports.loginUser = async (req, res) => {
    const { email, password } = req.body;
    try {
        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        if (!user.password) {
            return res.status(400).json({
                success: false,
                message: "This account uses Google sign-in. Please continue with Google.",
            });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }

        // Check if user is verified
        if (!user.is_verified) {
            return res.status(403).json({ success: false, message: "Please verify your email first" });
        }


        // Generate JWT token
        const token = generateToken(user._id, user.role);



        res.status(200).json({
            success: true,
            message: "Login successful",
            token,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

exports.googleLogin = async (req, res) => {
    const { idToken } = req.body;

    try {
        if (!process.env.GOOGLE_CLIENT_ID) {
            return res.status(500).json({
                success: false,
                message: "Google sign-in is not configured",
            });
        }

        if (!idToken) {
            return res.status(400).json({ success: false, message: "Google token is required" });
        }

        const ticket = await googleClient.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        if (!payload?.email) {
            return res.status(400).json({ success: false, message: "Google account email is missing" });
        }

        const email = payload.email.trim().toLowerCase();
        const googleId = payload.sub;
        const name = payload.name || payload.given_name || email.split("@")[0];
        const profilePicture = payload.picture || "";

        let user = await User.findOne({ $or: [{ googleId }, { email }] });

        if (user) {
            if (user.googleId && user.googleId !== googleId) {
                return res.status(409).json({
                    success: false,
                    message: "This email is already linked to a different Google account",
                });
            }

            user.googleId = googleId;
            user.authProvider = "google";

            if (!user.name && name) {
                user.name = name;
            }

            if (!user.profile_picture && profilePicture) {
                user.profile_picture = profilePicture;
            }

            user.is_verified = true;
            await user.save();
        } else {
            user = new User({
                name,
                email,
                googleId,
                authProvider: "google",
                profile_picture: profilePicture,
                is_verified: true,
            });

            await user.save();
        }

        const token = generateToken(user._id, user.role);

        res.status(200).json({
            success: true,
            message: "Google sign-in successful",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                profile_picture: user.profile_picture,
                is_verified: user.is_verified,
                authProvider: user.authProvider,
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Google sign-in failed" });
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
            return res.status(404).json({ success: false, message: "User not found" });
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
            success: true,
            message: "Profile updated successfully",
            user
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

// Get user profile
exports.getUserProfile = async (req, res) => {
    const { id } = req.user; // From JWT token

    try {
        const user = await User.findById(id).select("-password").populate("badges");
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Fetch user progress (XP, level, challenges completed)
        let progress = await UserProgress.findOne({ userId: id });
        if (!progress) {
            progress = { xp: 0, level: 1, challengesCompleted: 0, totalWins: 0, totalLosses: 0 };
        }

        const xpForNextLevel = progress.level * 500;
        const xpProgress = progress.xp % 500;

        // Fetch user overview (cigarettes avoided, life regained, money saved, health)
        const overview = await getUserOverview(id);

        res.status(200).json({
            success: true,
            user: {
                ...user.toObject(),
                currency: user.currency === "EUR" ? "€" : "$",
                xp: progress.xp,
                level: progress.level,
                challengesCompleted: progress.challengesCompleted,
                totalWins: progress.totalWins || 0,
                totalLosses: progress.totalLosses || 0,
                xpForNextLevel,
                xpProgress,
                overview: {
                    daily: {
                        cigarettesAvoided: overview.dailyCigarettesAvoided,
                        lifeRegained: overview.dailyLifeRegained,
                        moneySaved: overview.dailyMoneySaved,
                    },
                    monthly: {
                        cigarettesAvoided: overview.monthlyCigarettesAvoided,
                        lifeRegained: overview.monthlyLifeRegained,
                        moneySaved: overview.monthlyMoneySaved,
                    },
                    lifetime: {
                        cigarettesAvoided: overview.totalCigarettesAvoided,
                        lifeRegained: overview.totalLifeRegained,
                        moneySaved: overview.totalMoneySaved,
                    },
                    lungsHealth: overview.lungsHealth,
                    overallHealth: overview.overallHealth,
                },
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

// Get any user's profile by ID
exports.getUserById = async (req, res) => {
    const { id } = req.params;

    try {
        const user = await User.findById(id)
            .select("name email phone profile_picture about_me cigarettes_per_day cost per amount_of_cigarettes_per_pack health_goal badges createdAt")
            .populate("badges");

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Fetch user progress (XP, level, challenges completed)
        let progress = await UserProgress.findOne({ userId: id });
        if (!progress) {
            progress = { xp: 0, level: 1, challengesCompleted: 0, totalWins: 0, totalLosses: 0 };
        }

        const xpForNextLevel = progress.level * 500;
        const xpProgress = progress.xp % 500;

        // Fetch user overview
        const overview = await getUserOverview(id);

        res.status(200).json({
            success: true,
            user: {
                ...user.toObject(),
                currency: user.currency === "EUR" ? "€" : "$",
                xp: progress.xp,
                level: progress.level,
                challengesCompleted: progress.challengesCompleted,
                totalWins: progress.totalWins || 0,
                totalLosses: progress.totalLosses || 0,
                xpForNextLevel,
                xpProgress,
                overview: {
                    daily: {
                        cigarettesAvoided: overview.dailyCigarettesAvoided,
                        lifeRegained: overview.dailyLifeRegained,
                        moneySaved: overview.dailyMoneySaved,
                    },
                    monthly: {
                        cigarettesAvoided: overview.monthlyCigarettesAvoided,
                        lifeRegained: overview.monthlyLifeRegained,
                        moneySaved: overview.monthlyMoneySaved,
                    },
                    lifetime: {
                        cigarettesAvoided: overview.totalCigarettesAvoided,
                        lifeRegained: overview.totalLifeRegained,
                        moneySaved: overview.totalMoneySaved,
                    },
                    lungsHealth: overview.lungsHealth,
                    overallHealth: overview.overallHealth,
                },
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

// Update user (admin function - be careful with this)
exports.updateUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        if (req.body.role === "admin") {
            return res.status(403).json({ success: false, message: "You are not authorized to perform this action" });
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
        if (req.body.currency) {
            if (!["USD", "EUR"].includes(req.body.currency)) {
                return res.status(400).json({ success: false, message: "currency must be USD or EUR" });
            }
            user.currency = req.body.currency;
        }
        if (req.body.fcm_token) {
            user.fcm_token = req.body.fcm_token;
        }

        user.updated_at = Date.now();
        await user.save();

        const userObj = user.toObject();
        userObj.currency = user.currency === "EUR" ? "€" : "$";
        res.json({ success: true, message: "User updated successfully", user: userObj });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

// Change Password (authenticated user changes their own password)
exports.changePassword = async (req, res) => {
    const { id } = req.user; // From JWT token
    const { currentPassword, newPassword, confirmPassword } = req.body;

    try {
        // Validate required fields
        if (!currentPassword) {
            return res.status(400).json({ success: false, message: "Current password is required" });
        }
        if (!newPassword) {
            return res.status(400).json({ success: false, message: "New password is required" });
        }
        if (!confirmPassword) {
            return res.status(400).json({ success: false, message: "Please confirm your new password" });
        }

        // Validate new password matches confirm password
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ success: false, message: "New password and confirm password do not match" });
        }

        // Find user
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Verify current password is correct
        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isCurrentPasswordValid) {
            return res.status(401).json({ success: false, message: "Current password is incorrect" });
        }

        // Check new password is not the same as the current password
        const isSamePassword = await bcrypt.compare(newPassword, user.password);
        if (isSamePassword) {
            return res.status(400).json({ success: false, message: "New password cannot be the same as your current password" });
        }

        // Hash and save the new password
        user.password = await bcrypt.hash(newPassword, 10);
        user.updated_at = Date.now();
        await user.save();

        res.status(200).json({ success: true, message: "Password changed successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

// Delete user
exports.deleteUser = async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const userId = req.user.id;
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        if (user.id != userId) {
            return res.status(403).json({ success: false, message: "You are not authorized to delete this user" });
        }

        const session = await mongoose.startSession();
        try {
            try {
                await session.withTransaction(async () => {
                    await deleteUserCascade(userId, session);
                    await User.deleteOne({ _id: req.params.id }, { session });
                });
            } catch (transactionError) {
                const message = transactionError?.message || "";

                if (
                    message.includes("Transaction numbers are only allowed") ||
                    message.includes("Transaction support is")
                ) {
                    await deleteUserCascade(userId);
                    await User.findByIdAndDelete(req.params.id);
                } else {
                    throw transactionError;
                }
            }
        } finally {
            session.endSession();
        }

        res.json({ success: true, message: "User deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

// Get all users (Admin) with pagination
// GET /auth/users?page=1&limit=10&search=john
exports.getAllUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search ? req.query.search.trim() : "";

        const skip = (page - 1) * limit;

        // Build search filter
        const filter = { role: "user", is_verified: true };
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
                { phone: { $regex: search, $options: "i" } },
            ];
        }

        const totalItems = await User.countDocuments(filter);
        const totalPages = Math.ceil(totalItems / limit);
        const currentPage = page;

        const users = await User.find(filter)
            .select("-password -fcm_token")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const userIds = users.map((u) => u._id);
        const progressList = await UserProgress.find({ userId: { $in: userIds } })
            .select("userId xp level challengesCompleted totalWins totalLosses");

        const progressMap = {};
        progressList.forEach((p) => { progressMap[p.userId.toString()] = p; });

        const results = users.map((u) => {
            const progress = progressMap[u._id.toString()];
            return {
                ...u.toObject(),
                xp:                  progress?.xp                  ?? 0,
                level:               progress?.level               ?? 1,
                challengesCompleted: progress?.challengesCompleted ?? 0,
                totalWins:           progress?.totalWins           ?? 0,
                totalLosses:         progress?.totalLosses         ?? 0,
            };
        });

        res.status(200).json({
            success: true,
            pagination: {
                currentPage,
                totalPages,
                totalItems,
                pageSize: limit,
                itemsCount: results.length,
                results,
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

// Update Notification Preferences
exports.updateNotificationPreferences = async (req, res) => {
    try {
        const userId = req.user.id;
        const { daily_motivation, challenge_alerts, morning_quote } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        if (daily_motivation !== undefined) {
            user.notification_preferences.daily_motivation = daily_motivation;
        }
        if (challenge_alerts !== undefined) {
            user.notification_preferences.challenge_alerts = challenge_alerts;
        }
        if (morning_quote !== undefined) {
            user.notification_preferences.morning_quote = morning_quote;
        }

        await user.save();

        res.status(200).json({
            success: true,
            message: "Notification preferences updated",
            notification_preferences: user.notification_preferences
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};
