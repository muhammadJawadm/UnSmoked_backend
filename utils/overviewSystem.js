const UserOverview = require("../models/UserOverview");

/**
 * Get user overview data
 * Creates a default overview if one doesn't exist
 * @param {String} userId - User's ObjectId
 * @returns {Object} - UserOverview document
 */
const getUserOverview = async (userId) => {
    let overview = await UserOverview.findOne({ userId });

    if (!overview) {
        overview = await UserOverview.create({ userId });
    }

    return overview;
};

module.exports = {
    getUserOverview,
};
