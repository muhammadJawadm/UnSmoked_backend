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

    // Fetch users (we need them to check preferences and tokens)
    const users = await User.find({
        _id: { $in: userIds },
    }).select("fcm_token notification_preferences");

    if (users.length === 0) return { successCount: 0, failureCount: 0 };

    // Save notification records for ALL users (so it shows in the app bell)
    const savedNotifications = await Notification.insertMany(
        users.map((user) => ({
            userId: user._id,
            title,
            body,
            data: data || {},
        }))
    );

    // Determine if this is a challenge alert based on the data.type
    const isChallengeAlert = data && typeof data.type === 'string' && data.type.startsWith('challenge_');

    // Collect FCM tokens only for users who have pushes enabled for this type
    const fcmTokens = [];
    users.forEach((user) => {
        if (!user.fcm_token) return;

        // Check preferences
        if (isChallengeAlert) {
            if (user.notification_preferences && user.notification_preferences.challenge_alerts === false) {
                return; // Skip push
            }
        }
        
        fcmTokens.push(user.fcm_token);
    });

    if (fcmTokens.length === 0) {
        return { successCount: 0, failureCount: 0 };
    }

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
