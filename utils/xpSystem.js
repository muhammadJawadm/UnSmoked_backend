const UserProgress = require("../models/UserProgress");

/**
 * Record a challenge result for a user — increments challengesCompleted and
 * totalWins/totalLosses. Creates UserProgress if it doesn't exist.
 * @param {String} userId - User's ObjectId
 * @param {Boolean} isWinner - Whether the user won the challenge
 * @returns {Object} - Updated UserProgress document
 */
const recordChallengeCompletion = async (userId, isWinner = false) => {
    // Find or create user progress
    let progress = await UserProgress.findOne({ userId });

    if (!progress) {
        progress = new UserProgress({ userId, challengesCompleted: 0 });
    }

    // Increment challenges completed
    progress.challengesCompleted += 1;
    if (isWinner) {
        progress.totalWins += 1;
    } else {
        progress.totalLosses += 1;
    }

    // Save and return
    await progress.save();
    return progress;
};

module.exports = {
    recordChallengeCompletion,
};
