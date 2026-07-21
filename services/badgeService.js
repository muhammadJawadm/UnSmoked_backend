const BadgeTemplate = require("../models/BadgeTemplate");
const Badges = require("../models/Badges");
const User = require("../models/User");

/**
 * Check and auto-assign badges to a user based on milestone type and current value.
 *
 * @param {String} userId        - The user's ObjectId
 * @param {String} milestoneType - One of: "streak", "completion", "competition", "milestone"
 * @param {Number} currentValue  - The user's current progress value for this type
 * @returns {Array}              - Array of newly assigned badge documents (empty if none)
 */
const checkAndAssignBadge = async (userId, milestoneType, currentValue) => {
    try {
        const eligibleTemplates = await BadgeTemplate.find({
            type: milestoneType,
            conditionValue: { $lte: currentValue },
            isActive: true,
        });

        if (!eligibleTemplates.length) return [];

        const existingBadges = await Badges.find({
            userId,
            badge: { $in: eligibleTemplates.map((t) => t._id) },
        }).select("badge");

        const existingBadgeIds = new Set(
            existingBadges.map((b) => b.badge.toString())
        );

        const newTemplates = eligibleTemplates.filter(
            (t) => !existingBadgeIds.has(t._id.toString())
        );

        if (!newTemplates.length) return [];

        const badgeDocs = newTemplates.map((t) => ({
            userId,
            badge: t._id,
            earnedAt: new Date(),
        }));

        const assignedBadges = await Badges.insertMany(badgeDocs);

        // 5. Also push badge template IDs into User.badges for quick access
        const newBadgeTemplateIds = newTemplates.map((t) => t._id);
        await User.findByIdAndUpdate(userId, {
            $addToSet: { badges: { $each: newBadgeTemplateIds } },
        });

        // 6. Return the populated assignments
        const populated = await Badges.find({
            _id: { $in: assignedBadges.map((b) => b._id) },
        }).populate("badge", "title description imageUrl type conditionValue");

        return populated;
    } catch (error) {
        console.error("Badge auto-assignment error:", error.message);
        return [];
    }
};

/**
 * Get all badges earned by a specific user.
 *
 * @param {String} userId - The user's ObjectId
 * @returns {Array}       - Populated badge assignment documents
 */
const getUserBadges = async (userId) => {
    return Badges.find({ userId })
        .populate("badge", "title description imageUrl type conditionValue")
        .sort({ earnedAt: -1 });
};

module.exports = {
    checkAndAssignBadge,
    getUserBadges,
};
