/**
 * @file crons/index.js
 * @description Scheduled background jobs (cron tasks) for the application.
 *              All intervals are registered here and exported via startCronJobs().
 */

const Challenge            = require("../models/Challenges");
const ChallengeParticipant = require("../models/ChallengeParticipant");
const DailyBoard           = require("../models/DailyBoard");
const Competition          = require("../models/Competition");
const { recordChallengeCompletion } = require("../utils/xpSystem");
const { checkAndAssignBadge } = require("../services/badgeService");
const sendNotificationToUsers = require("../utils/sendNotification");
const { resolveChallengeOutcome } = require("../utils/challengeOutcome");

// ─── Constants ───────────────────────────────────────────────────────────────

const FIVE_MINUTES = 5 * 60 * 1000;

// ─── Helpers (mirrors challengesController — kept here to avoid circular deps) ─

const getEndOfDay = (date) => {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    d.setUTCHours(23, 59, 59, 999);
    return d;
};

const createBoardsForAccepted = async (challengeId, boardSize) => {
    const accepted = await ChallengeParticipant.find({
        challengeId,
        inviteStatus: "accepted",
    }).select("userId");

    const today = new Date();
    const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const smokes = new Array(boardSize).fill(null);

    for (const p of accepted) {
        await DailyBoard.findOneAndUpdate(
            { challengeId, userId: p.userId, date: todayUTC },
            { $setOnInsert: { challengeId, userId: p.userId, day: 1, date: todayUTC, smokes } },
            { upsert: true, new: true }
        );
    }
};

// ─── Challenge Auto-Start ─────────────────────────────────────────────────────

async function autoStartChallenges() {
    try {
        const now = new Date();

        const toStart = await Challenge.find({
            status: "waiting",
            scheduledDate: { $lte: now },
        }).lean();

        for (const challenge of toStart) {
            try {
                const acceptedCount = await ChallengeParticipant.countDocuments({
                    challengeId: challenge._id,
                    inviteStatus: "accepted",
                });

                // Need at least 2 (creator + 1 invitee) to run a meaningful challenge
                if (acceptedCount < 2) {
                    await Challenge.findByIdAndUpdate(challenge._id, { status: "cancelled" });
                    console.log(`[Cron] Cancelled challenge ${challenge._id} — not enough accepted participants`);
                    continue;
                }

                const startAt = now;
                const endsAt = getEndOfDay(startAt);

                await Challenge.findByIdAndUpdate(challenge._id, {
                    status: "active",
                    startAt,
                    endsAt,
                });

                await createBoardsForAccepted(challenge._id, challenge.boardSize || 50);

                const accepted = await ChallengeParticipant.find({
                    challengeId: challenge._id,
                    inviteStatus: "accepted",
                }).select("userId");

                await sendNotificationToUsers(
                    accepted.map((p) => p.userId.toString()),
                    "Challenge Started! 🚀",
                    "Your scheduled challenge has started. Give it your best!",
                    { type: "challenge_started", challengeId: challenge._id.toString() }
                );

                console.log(`[Cron] Auto-started challenge ${challenge._id}`);
            } catch (err) {
                console.error(`[Cron] Failed to start challenge ${challenge._id}:`, err.message);
            }
        }
    } catch (error) {
        console.error("[Cron] Challenge auto-start error:", error);
    }
}

// ─── Challenge Auto-Complete ──────────────────────────────────────────────────

/**
 * Finds all active challenges whose end date has passed, determines the
 * winner (or voids the challenge if fewer than 2 participants engaged),
 * records completion stats / badges, and notifies participants.
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
            const { isVoid, winnerId, allParticipants } = await resolveChallengeOutcome(challenge._id);

            if (isVoid) {
                console.log(`[Cron] Voided challenge ${challenge._id} — fewer than 2 participants engaged`);
                continue;
            }

            // Record completion stats and badges for each participant (skip already-recorded ones)
            for (const participant of allParticipants) {
                if (participant.resultRecorded) continue;

                try {
                    const isWinner = winnerId?.toString() === participant.userId.toString();

                    participant.resultRecorded = true;
                    await participant.save();

                    const updatedProgress = await recordChallengeCompletion(participant.userId.toString(), isWinner);
                    await checkAndAssignBadge(
                        participant.userId.toString(),
                        "completion",
                        updatedProgress.challengesCompleted
                    );
                } catch (participantError) {
                    console.error(`[Cron] Failed to record result for participant ${participant.userId}:`, participantError.message);
                }
            }

            // Notify all participants
            const playerIds = allParticipants.map((p) => p.userId.toString());
            await sendNotificationToUsers(
                playerIds,
                "Challenge Ended! 🏆",
                "Your challenge has completed. Check your results!",
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
    setInterval(autoStartChallenges,     FIVE_MINUTES);
    setInterval(autoCompleteChallenges,  FIVE_MINUTES);
    setInterval(autoManageCompetitions,  FIVE_MINUTES);
    console.log("[Cron] All scheduled jobs started (interval: 5 min)");
}

module.exports = { startCronJobs };