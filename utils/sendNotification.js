const admin = require("./firebase");
const Notification = require("../models/Notifications");
const User = require("../models/User");

/**
 * Internal helper: send push notification to specific user IDs.
 * Does NOT require an HTTP request — can be called from any controller.
 *
 * @param {string[]} userIds   - Array of user ObjectId strings
 * @param {string}   title     - Notification title
 * @param {string}   body      - Notification body
 * @param {object}   [data={}] - Optional data payload
 * @returns {object} { successCount, failureCount }
 */
const sendNotificationToUsers = async (userIds, title, body, data = {}) => {
    if (!userIds || userIds.length === 0) return { successCount: 0, failureCount: 0 };

    // Fetch users with FCM tokens
    const users = await User.find({
        _id: { $in: userIds },
        fcm_tokens: { $exists: true, $ne: [] },
    }).select("fcm_tokens");

    if (users.length === 0) return { successCount: 0, failureCount: 0 };

    // Collect all FCM tokens
    const fcmTokens = [];
    users.forEach((user) => {
        user.fcm_tokens.forEach((token) => {
            if (token) fcmTokens.push(token);
        });
    });

    if (fcmTokens.length === 0) return { successCount: 0, failureCount: 0 };

    // Save notification records
    const savedNotifications = await Notification.insertMany(
        users.map((user) => ({
            userId: user._id,
            title,
            body,
            data: data || {},
        }))
    );

    // Build FCM message
    const message = {
        notification: { title, body },
        data: {
            clickAction: "FLUTTER_NOTIFICATION_CLICK",
            ...(data && Object.keys(data).length > 0
                ? Object.fromEntries(
                      Object.entries(data).map(([k, v]) => [k, String(v)])
                  )
                : {}),
        },
        tokens: fcmTokens,
    };

    try {
        const response = await admin.messaging().sendEachForMulticast(message);

        // Update notification statuses
        await Notification.updateMany(
            { _id: { $in: savedNotifications.map((n) => n._id) } },
            {
                status: response.successCount > 0 ? "sent" : "failed",
                sentAt: new Date(),
                ...(response.failureCount > 0 && {
                    failureReason: `${response.failureCount} device(s) failed.`,
                }),
            }
        );

        console.log(`[sendNotificationToUsers] Sent to ${userIds.length} users — success: ${response.successCount}, failed: ${response.failureCount}`);
        return {
            successCount: response.successCount,
            failureCount: response.failureCount,
        };
    } catch (fcmError) {
        await Notification.updateMany(
            { _id: { $in: savedNotifications.map((n) => n._id) } },
            { status: "failed", failureReason: fcmError.message }
        );
        console.error("[sendNotificationToUsers] FCM Error:", fcmError.message);
        return { successCount: 0, failureCount: fcmTokens.length };
    }
};

module.exports = sendNotificationToUsers;
