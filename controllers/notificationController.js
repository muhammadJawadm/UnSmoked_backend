const admin = require("../utils/firebase");
const Notification = require("../models/Notifications");
const User = require("../models/User");
const mongoose = require("mongoose");

// Helper: check if a value is a valid MongoDB ObjectId
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// Unified send notification function - handles single user, specific users, and broadcast
exports.sendNotification = async (req, res) => {
    try {
        const { userIds: rawUserIds, title, body, data, sendToAll } = req.body;

        // Validation
        if (!title || !body) {
            return res.status(400).json({ success: false, message: "title and body are required" });
        }
        if (!sendToAll && !rawUserIds) {
            return res.status(400).json({ success: false, message: "Provide sendToAll or userIds (a single ID string or array of IDs)" });
        }

        let mode, userId, userIds;
        if (sendToAll) {
            mode = "broadcast";
        } else if (Array.isArray(rawUserIds)) {
            if (rawUserIds.length === 0) {
                return res.status(400).json({ success: false, message: "userIds array must not be empty" });
            }
            const invalidIds = rawUserIds.filter(id => !isValidId(id));
            if (invalidIds.length > 0) {
                return res.status(400).json({ success: false, message: `Invalid user ID(s): ${invalidIds.join(", ")}` });
            }
            mode = "multi";
            userIds = rawUserIds;
        } else {
            if (!isValidId(rawUserIds)) {
                return res.status(400).json({ success: false, message: `Invalid user ID: ${rawUserIds}` });
            }
            mode = "single";
            userId = rawUserIds;
        }

        let fcmTokens = [];
        let users = [];
        let savedNotifications = [];

        if (mode === "broadcast") {
            // BROADCAST MODE: Send to all users
            users = await User.find({
                fcm_token: { $exists: true, $ne: "" }
            }).select('fcm_token');

            if (users.length === 0) {
                return res.status(404).json({ success: false, message: "No users with registered FCM tokens found" });
            }

            users.forEach(user => {
                if (user.fcm_token) fcmTokens.push(user.fcm_token);
            });

            if (fcmTokens.length === 0) {
                return res.status(400).json({ success: false, message: "No valid FCM tokens found" });
            }

            savedNotifications = await Notification.insertMany(
                users.map(user => ({ userId: user._id, title, body, data: data || {} }))
            );

        } else if (mode === "multi") {
            // MULTI-USER MODE: Send to a specific list of users
            users = await User.find({
                _id: { $in: userIds },
                fcm_token: { $exists: true, $ne: "" }
            }).select('fcm_token');

            if (users.length === 0) {
                return res.status(404).json({ success: false, message: "None of the specified users have registered FCM tokens" });
            }

            users.forEach(user => {
                if (user.fcm_token) fcmTokens.push(user.fcm_token);
            });

            if (fcmTokens.length === 0) {
                return res.status(400).json({ success: false, message: "No valid FCM tokens found for specified users" });
            }

            savedNotifications = await Notification.insertMany(
                users.map(user => ({ userId: user._id, title, body, data: data || {} }))
            );

        } else {
            // SINGLE USER MODE: Send to one specific user
            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({ success: false, message: "User not found" });
            }

            fcmTokens = user.fcm_token ? [user.fcm_token] : [];

            if (fcmTokens.length === 0) {
                return res.status(400).json({ success: false, message: "User has no registered FCM tokens" });
            }

            const notification = new Notification({ userId, title, body, data: data || {} });
            await notification.save();
            savedNotifications = [notification];
        }

        // Prepare FCM message (updated for Firebase Admin SDK v13+)
        const message = {
            notification: {
                title: title,
                body: body,
            },
            data: {
                ...(mode === "single"
                    ? { notificationId: savedNotifications[0]._id.toString() }
                    : { broadcastId: Date.now().toString() }
                ),
                clickAction: "FLUTTER_NOTIFICATION_CLICK",
                // Convert all data values to strings (required by FCM)
                ...(data && Object.keys(data).length > 0
                    ? Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]))
                    : {})
            },
            tokens: fcmTokens
        };

        // Send notification via FCM
        try {
            const response = await admin.messaging().sendEachForMulticast(message);

            console.log("FCM Response:", JSON.stringify(response, null, 2));

            // Check for any failures and log them
            if (response.failureCount > 0) {
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        console.error(`Failed to send to token ${idx}:`, resp.error);
                        console.error(`Error code: ${resp.error.code}`);
                        console.error(`Error message: ${resp.error.message}`);
                    }
                });
            }

            // Update notification status
            if (mode === "single") {
                const notification = savedNotifications[0];
                notification.status = response.successCount > 0 ? "sent" : "failed";
                notification.sentAt = new Date();
                if (response.failureCount > 0) {
                    notification.failureReason = `${response.failureCount} device(s) failed.`;
                }
                await notification.save();
            } else {
                await Notification.updateMany(
                    { _id: { $in: savedNotifications.map(n => n._id) } },
                    {
                        status: response.successCount > 0 ? "sent" : "failed",
                        sentAt: new Date(),
                        ...(response.failureCount > 0 && {
                            failureReason: `${response.failureCount} device(s) failed.`
                        })
                    }
                );
            }

            console.log(`Successfully sent [${mode}] notification:`, response);

            // Send appropriate response
            if (mode === "single") {
                res.status(201).json({
                    success: true,
                    message: response.successCount > 0 ? "Notification sent successfully" : "Failed to send notification",
                    notification: savedNotifications[0],
                    successCount: response.successCount,
                    failureCount: response.failureCount,
                    devicesSent: fcmTokens.length
                });
            } else {
                res.status(201).json({
                    success: true,
                    message: `${mode === "broadcast" ? "Broadcast" : "Multi-user"} notification sent successfully`,
                    usersTargeted: users.length,
                    devicesTargeted: fcmTokens.length,
                    successCount: response.successCount,
                    failureCount: response.failureCount
                });
            }
        } catch (fcmError) {
            // Update all saved notifications as failed
            await Notification.updateMany(
                { _id: { $in: savedNotifications.map(n => n._id) } },
                { status: "failed", failureReason: fcmError.message }
            );

            console.error("FCM Error:", fcmError);
            res.status(500).json({
                success: false,
                message: `Failed to send [${mode}] notification via FCM`
            });
        }
    } catch (error) {
        console.error("Error processing notification:", error);
        res.status(500).json({ success: false, message: "Error processing notification" });
    }
};


// Get notifications for the logged-in user
exports.getNotifications = async (req, res) => {
    try {
        const userId = req.user.id; // Using consistent field name from JWT
        const { limit = 20, page = 1 } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const notifications = await Notification.find({ userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Notification.countDocuments({ userId });

        res.status(200).json({
            success: true,
            notifications,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error("Error fetching notifications:", error);
        res.status(500).json({ success: false, message: "Error fetching notifications" });
    }
};


// Delete notification
exports.deleteNotification = async (req, res) => {
    try {
        const { notificationId } = req.params;
        const userId = req.user.id;

        const notification = await Notification.findOneAndDelete({
            _id: notificationId,
            userId: userId
        });

        if (!notification) {
            return res.status(404).json({ success: false, message: "Notification not found" });
        }

        res.status(200).json({ success: true, message: "Notification deleted successfully" });
    } catch (error) {
        console.error("Error deleting notification:", error);
        res.status(500).json({ success: false, message: "Error deleting notification" });
    }
};
