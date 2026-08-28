/**
 * Shared "who won" logic for a challenge whose time is up — used by both the
 * manual completeChallenge controller and the auto-complete cron, so the two
 * can't drift out of sync.
 *
 * A challenge only produces a real winner/loser if at least 2 participants
 * actually engaged with their board (challengeBoardStats.totalDaysFilled > 0).
 * If 0 or 1 participants ever touched their board, there's no real contest —
 * the challenge is voided (status: "cancelled", no winner) instead of
 * rewarding someone by default for their opponent's silence.
 */

const Challenge = require("../models/Challenges");
const ChallengeParticipant = require("../models/ChallengeParticipant");
const sendNotificationToUsers = require("./sendNotification");

/**
 * Determines and applies the outcome for a challenge that just ended.
 * @param {String|ObjectId} challengeId
 * @returns {{ isVoid: Boolean, winnerId: ObjectId|null, allParticipants: Array }}
 *          allParticipants is the accepted-participant list, sorted by
 *          totalCigarettesAvoided descending, for the caller to reuse.
 */
const resolveChallengeOutcome = async (challengeId) => {
    const allParticipants = await ChallengeParticipant.find({
        challengeId,
        inviteStatus: "accepted",
    }).sort({ "challengeBoardStats.totalCigarettesAvoided": -1 });

    const engaged = allParticipants.filter((p) => p.challengeBoardStats.totalDaysFilled > 0);

    if (engaged.length <= 1) {
        await Challenge.findByIdAndUpdate(challengeId, { status: "cancelled", winner: null });

        if (engaged.length === 1) {
            await sendNotificationToUsers(
                [engaged[0].userId.toString()],
                "Challenge Removed",
                "Your opponent didn't respond, so this challenge has been removed. No winner or loser.",
                { type: "challenge_voided", challengeId: challengeId.toString() }
            );
        }

        return { isVoid: true, winnerId: null, allParticipants };
    }

    const winnerId = allParticipants[0]?.userId ?? null;
    await Challenge.findByIdAndUpdate(challengeId, { status: "completed", winner: winnerId });

    return { isVoid: false, winnerId, allParticipants };
};

module.exports = { resolveChallengeOutcome };
