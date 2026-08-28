const UserProgress = require("../models/UserProgress");

// Attach creator stats fields to a single populated challenge object.
const enrichChallengeCreatorStats = async (challenge) => {
    if (!challenge) return challenge;

    const creatorId = challenge.createdBy?._id ?? challenge.createdBy;
    if (!creatorId) return challenge.toObject ? challenge.toObject() : challenge;

    const progress = await UserProgress.findOne({ userId: creatorId })
        .select("challengesCompleted totalWins totalLosses");

    const obj = challenge.toObject ? challenge.toObject() : { ...challenge };
    if (obj.createdBy && typeof obj.createdBy === "object") {
        obj.createdBy = {
            ...obj.createdBy,
            challengesCompleted: progress?.challengesCompleted ?? 0,
            totalWins:           progress?.totalWins           ?? 0,
            totalLosses:         progress?.totalLosses         ?? 0,
        };
    }
    return obj;
};

// Batch-attach creator stats to an array of populated challenge objects.
const enrichChallengesCreatorStats = async (challenges) => {
    if (!challenges || challenges.length === 0) return challenges;

    const creatorIds = [
        ...new Set(
            challenges
                .map((c) => {
                    const id = c.createdBy?._id ?? c.createdBy;
                    return id?.toString();
                })
                .filter(Boolean)
        ),
    ];

    const progressList = await UserProgress.find({ userId: { $in: creatorIds } })
        .select("userId challengesCompleted totalWins totalLosses");

    const progressMap = {};
    progressList.forEach((p) => { progressMap[p.userId.toString()] = p; });

    return challenges.map((c) => {
        const obj = c.toObject ? c.toObject() : { ...c };
        const creatorId = (obj.createdBy?._id ?? obj.createdBy)?.toString();
        const progress  = progressMap[creatorId];

        if (obj.createdBy && typeof obj.createdBy === "object" && progress) {
            obj.createdBy = {
                ...obj.createdBy,
                challengesCompleted: progress.challengesCompleted ?? 0,
                totalWins:           progress.totalWins           ?? 0,
                totalLosses:         progress.totalLosses         ?? 0,
            };
        }
        return obj;
    });
};

module.exports = { enrichChallengeCreatorStats, enrichChallengesCreatorStats };
