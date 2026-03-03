const UserOverview = require("../models/UserOverview");

/**
 * Get user overview data (cigarettes avoided, life regained, money saved, health statuses)
 * Creates a default overview if one doesn't exist
 * @param {String} userId - User's ObjectId
 * @returns {Object} - UserOverview document
 */
const getUserOverview = async (userId) => {
    let overview = await UserOverview.findOne({ userId });

    if (!overview) {
        overview = await UserOverview.create({
            userId,
            cigarettesAvoided: 0,
            lifeRegained: 0,
            moneySaved: 0,
            lungsHealth: "Fair",
            overallHealth: "Fair",
        });
    }

    return overview;
};

/**
 * Update user overview stats
 * @param {String} userId - User's ObjectId
 * @param {Object} data - Fields to update
 * @param {Number} [data.cigarettesAvoided] - New cigarettes avoided count
 * @param {Number} [data.lifeRegained] - New life regained in minutes
 * @param {Number} [data.moneySaved] - New money saved amount
 * @param {String} [data.lungsHealth] - Lungs health status
 * @param {String} [data.overallHealth] - Overall health status
 * @returns {Object} - Updated UserOverview document
 */
const updateUserOverview = async (userId, data) => {
    let overview = await UserOverview.findOne({ userId });

    if (!overview) {
        overview = new UserOverview({ userId });
    }

    if (data.cigarettesAvoided !== undefined) overview.cigarettesAvoided = data.cigarettesAvoided;
    if (data.lifeRegained !== undefined) overview.lifeRegained = data.lifeRegained;
    if (data.moneySaved !== undefined) overview.moneySaved = data.moneySaved;
    if (data.lungsHealth !== undefined) overview.lungsHealth = data.lungsHealth;
    if (data.overallHealth !== undefined) overview.overallHealth = data.overallHealth;

    await overview.save();
    return overview;
};

/**
 * Increment overview stats (e.g., when user logs a smoke-free period)
 * @param {String} userId - User's ObjectId
 * @param {Number} cigarettes - Number of cigarettes avoided to add
 * @param {Number} minutes - Minutes of life regained to add
 * @param {Number} money - Money saved to add
 * @returns {Object} - Updated UserOverview document
 */
const incrementOverviewStats = async (userId, cigarettes = 0, minutes = 0, money = 0) => {
    let overview = await UserOverview.findOne({ userId });

    if (!overview) {
        overview = new UserOverview({ userId });
    }

    overview.cigarettesAvoided += cigarettes;
    overview.lifeRegained += minutes;
    overview.moneySaved = parseFloat((overview.moneySaved + money).toFixed(2));

    await overview.save();
    return overview;
};

module.exports = {
    getUserOverview,
    updateUserOverview,
    incrementOverviewStats,
};
