const UserProgress = require("../models/UserProgress");

/**
 * Calculate level based on XP
 * Level = floor(xp / 500) + 1
 * @param {Number} xp - Total XP
 * @returns {Number} - Calculated level
 */
const calculateLevel = (xp) => {
    return Math.floor(xp / 500) + 1;
};

/**
 * Add XP to user, recalculate level, and increment challenges completed
 * Creates UserProgress if it doesn't exist
 * @param {String} userId - User's ObjectId
 * @param {Number} xpAmount - XP to add
 * @returns {Object} - Updated UserProgress document
 */
const addXP = async (userId, xpAmount) => {
    // Find or create user progress
    let progress = await UserProgress.findOne({ userId });

    if (!progress) {
        progress = new UserProgress({ userId, xp: 0, level: 1, challengesCompleted: 0 });
    }

    // Add XP (ensure it doesn't go negative)
    progress.xp = Math.max(0, progress.xp + xpAmount);

    // Recalculate level
    progress.level = calculateLevel(progress.xp);

    // Increment challenges completed
    progress.challengesCompleted += 1;

    // Save and return
    await progress.save();
    return progress;
};

module.exports = {
    calculateLevel,
    addXP
};
