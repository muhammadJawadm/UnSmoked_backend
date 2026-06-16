const UserProgress = require("../models/UserProgress");

// Attach creator XP fields to a single populated challenge object.
const enrichChallengeCreatorXp = async (challenge) => {
    if (!challenge) return challenge;

    const creatorId = challenge.createdBy?._id ?? challenge.createdBy;
    if (!creatorId) return challenge.toObject ? challenge.toObject() : challenge;

    const progress = await UserProgress.findOne({ userId: creatorId })
        .select("xp level challengesCompleted totalWins totalLosses");

    const obj = challenge.toObject ? challenge.toObject() : { ...challenge };
    if (obj.createdBy && typeof obj.createdBy === "object") {
        obj.createdBy = {
            ...obj.createdBy,
            xp:                  progress?.xp                  ?? 0,
            level:               progress?.level               ?? 1,
            challengesCompleted: progress?.challengesCompleted ?? 0,
            totalWins:           progress?.totalWins           ?? 0,
            totalLosses:         progress?.totalLosses         ?? 0,
        };
    }
    return obj;
};

// Batch-attach creator XP to an array of populated challenge objects.
const enrichChallengesCreatorXp = async (challenges) => {
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
        .select("userId xp level challengesCompleted totalWins totalLosses");

    const progressMap = {};
    progressList.forEach((p) => { progressMap[p.userId.toString()] = p; });

    return challenges.map((c) => {
        const obj = c.toObject ? c.toObject() : { ...c };
        const creatorId = (obj.createdBy?._id ?? obj.createdBy)?.toString();
        const progress  = progressMap[creatorId];

        if (obj.createdBy && typeof obj.createdBy === "object" && progress) {
            obj.createdBy = {
                ...obj.createdBy,
                xp:                  progress.xp                  ?? 0,
                level:               progress.level               ?? 1,
                challengesCompleted: progress.challengesCompleted ?? 0,
                totalWins:           progress.totalWins           ?? 0,
                totalLosses:         progress.totalLosses         ?? 0,
            };
        }
        return obj;
    });
};

module.exports = { enrichChallengeCreatorXp, enrichChallengesCreatorXp };
