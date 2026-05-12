/**
 * @file crons/index.js
 * @description Scheduled background jobs (cron tasks) for the application.
 *              All intervals are registered here and exported via startCronJobs().
 */

const Challenge          = require("../models/Challenges");
const ChallengeParticipant = require("../models/ChallengeParticipant");
const Competition        = require("../models/Competition");
const { addXP }          = require("../utils/xpSystem");
const { checkAndAssignBadge } = require("../services/badgeService");
const sendNotificationToUsers = require("../utils/sendNotification");

// ─── Constants ───────────────────────────────────────────────────────────────

const FIVE_MINUTES = 5 * 60 * 1000;

// ─── Challenge Auto-Complete ──────────────────────────────────────────────────

/**
 * Finds all active challenges whose end date has passed, marks them completed,
 * determines the winner, awards XP / badges, and notifies participants.
 */
async function autoCompleteChallenges() {
    try {
        const now = new Date();

        // lean() avoids Mongoose re-validating legacy docs that have category stored
        // as a plain string instead of an ObjectId.
        const expiredChallenges = await Challenge
            .find({ status: "active", endsAt: { $lte: now } })
            .lean();

        for (const challenge of expiredChallenges) {
            // Rank participants by cigarettes avoided (descending)
            const participants = await ChallengeParticipant.find({
                challengeId:  challenge._id,
                inviteStatus: "accepted",
            }).sort({ "challengeBoardStats.totalCigarettesAvoided": -1 });

            const winnerId = participants[0]?.userId ?? null;

            // Use findByIdAndUpdate to avoid re-validating stale legacy docs
            await Challenge.findByIdAndUpdate(challenge._id, {
                status: "completed",
                winner: winnerId,
            });

            // Award XP and badges to each participant (skip already-awarded ones)
            for (const participant of participants) {
                if (participant.xpEarned > 0) continue;

                const isWinner  = winnerId?.toString() === participant.userId.toString();
                const xpAmount  = isWinner
                    ? challenge.xpReward
                    : Math.floor(challenge.xpReward / 2);

                participant.xpEarned = xpAmount;
                await participant.save();

                const updatedProgress = await addXP(participant.userId.toString(), xpAmount);
                await checkAndAssignBadge(
                    participant.userId.toString(),
                    "completion",
                    updatedProgress.challengesCompleted
                );
                await checkAndAssignBadge(
                    participant.userId.toString(),
                    "milestone",
                    updatedProgress.level
                );
            }

            // Notify all participants
            const playerIds = participants.map((p) => p.userId.toString());
            await sendNotificationToUsers(
                playerIds,
                "Challenge Ended! 🏆",
                `${challenge.title} has completed. Check your results!`,
                { type: "challenge_completed", challengeId: challenge._id.toString() }
            );

            console.log(`[Cron] Auto-completed challenge ${challenge._id}`);
        }
    } catch (error) {
        console.error("[Cron] Challenge auto-complete error:", error);
    }
}

// ─── Competition Auto-Activate & Auto-Complete ────────────────────────────────

/**
 * 1) Activates pending competitions that are full and whose start date has arrived.
 * 2) Completes active competitions whose end date has passed.
 */
async function autoManageCompetitions() {
    try {
        const now = new Date();

        // --- Auto-activate ---------------------------------------------------
        const toActivate = await Competition.find({
            status:    "pending",
            startDate: { $lte: now },
            $expr:     { $eq: [{ $size: "$players" }, "$numberOfPlayers"] },
        });

        for (const competition of toActivate) {
            competition.status = "active";
            await competition.save();

            const playerIds = competition.players.map((p) => p.user.toString());
            await sendNotificationToUsers(
                playerIds,
                "Competition Started! 🏆",
                "Your competition is now active. Good luck!",
                { type: "competition_active", competitionId: competition._id.toString() }
            );

            console.log(`[Cron] Auto-activated competition ${competition._id}`);
        }

        // --- Auto-complete ---------------------------------------------------
        const toComplete = await Competition.find({
            status:  "active",
            endDate: { $lte: now },
        });

        for (const competition of toComplete) {
            competition.status = "completed";
            await competition.save();

            const playerIds = competition.players.map((p) => p.user.toString());
            await sendNotificationToUsers(
                playerIds,
                "Competition Completed! 🎉",
                "Your competition has ended. Check your results!",
                { type: "competition_completed", competitionId: competition._id.toString() }
            );

            console.log(`[Cron] Auto-completed competition ${competition._id}`);
        }
    } catch (error) {
        console.error("[Cron] Competition auto-manage error:", error);
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Registers and starts all application cron jobs.
 * Call this once after the server has started listening.
 */
function startCronJobs() {
    setInterval(autoCompleteChallenges,  FIVE_MINUTES);
    setInterval(autoManageCompetitions,  FIVE_MINUTES);
    console.log("[Cron] All scheduled jobs started (interval: 5 min)");
}

module.exports = { startCronJobs };