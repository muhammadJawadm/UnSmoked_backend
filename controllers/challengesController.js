const crypto = require("crypto");
const mongoose = require("mongoose");

const Challenge = require("../models/Challenges");
const ChallengeParticipant = require("../models/ChallengeParticipant");
const DailyBoard = require("../models/DailyBoard");
const Template = require("../models/Template");
const Category = require("../models/Category");
const User = require("../models/User");
const UserProgress = require("../models/UserProgress");
const ChallengeTaskAssignment = require("../models/ChallengeTaskAssignment");
const { addXP } = require("../utils/xpSystem");
const { checkAndAssignBadge } = require("../services/badgeService");
const sendNotificationToUsers = require("../utils/sendNotification");
const { enrichChallengeCreatorXp, enrichChallengesCreatorXp } = require("../utils/challengeUtils");

const TEST_CHALLENGE_DURATION_MS = 10 * 60 * 1000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const generateInviteToken = () => crypto.randomBytes(20).toString("hex");

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const ensureValidCategory = async (categoryId) => {
    if (!categoryId) {
        return { valid: false, message: "category is required" };
    }
    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
        return { valid: false, message: "Invalid category ID format" };
    }

    const exists = await Category.exists({ _id: categoryId });
    if (!exists) {
        return { valid: false, message: "Invalid category. Category not found" };
    }

    return { valid: true };
};

/**
 * Helper: Get today's date at midnight UTC (shared with board helpers)
 */
const getTodayUTC = () => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

/**
 * Helper: Calculate the end of the last calendar day of a challenge.
 * A 1-day challenge starting at 5 PM ends at 23:59:59 UTC that same night.
 * A 3-day challenge starting June 11 ends at 23:59:59 UTC on June 13.
 */
const getEndOfLastDay = (startAt, durationDays) => {
    const d = new Date(Date.UTC(
        startAt.getUTCFullYear(),
        startAt.getUTCMonth(),
        startAt.getUTCDate()
    ));
    d.setUTCDate(d.getUTCDate() + durationDays - 1);
    d.setUTCHours(23, 59, 59, 999);
    return d;
};

/**
 * Helper: Check if a user is already an accepted participant in any active challenge.
 */
const hasActiveChallenge = async (userId) => {
    // Find all challenges where user is accepted participant
    const participations = await ChallengeParticipant.find({
        userId,
        inviteStatus: "accepted",
    }).select("challengeId");

    if (!participations.length) return false;

    const challengeIds = participations.map((p) => p.challengeId);
    const activeChallenge = await Challenge.findOne({
        _id: { $in: challengeIds },
        status: "active",
        moderationStatus: "ok",
    }).select("_id");

    return activeChallenge || null;
};

/**
 * Helper: Create day-1 DailyBoard (challengeId=<id>) for all accepted participants.
 * Called whenever a challenge transitions to "active".
 */
const createChallengeBoardsForParticipants = async (challenge) => {
    const accepted = await ChallengeParticipant.find({
        challengeId: challenge._id,
        inviteStatus: "accepted",
    }).select("userId");
 console.log("Board creation — accepted participants found:", accepted.length);
    const today = getTodayUTC();

    for (const p of accepted) {
        const smokes = new Array(challenge.boardSize).fill(null);

        // upsert — safe to call multiple times
        await DailyBoard.findOneAndUpdate(
            { challengeId: challenge._id, userId: p.userId, date: today },
            {
                $setOnInsert: {
                    challengeId: challenge._id,
                    userId: p.userId,
                    day: 1,
                    date: today,
                    smokes,
                },
            },
            { upsert: true, new: true }
        );
    }
};

/**
 * Check whether a challenge should auto-activate based on accepted participant count.
 * 1v1  → activates when 1 invitee accepts
 * 4-player → activates when 3 invitees accept
 * Returns true if the challenge was activated.
 */
const tryAutoActivate = async (challenge) => {
    const acceptedCount = await ChallengeParticipant.countDocuments({
        challengeId: challenge._id,
        role: "invitee",
        inviteStatus: "accepted",
    });

    const threshold = challenge.mode === "1v1" ? 1 : 3;
    if (acceptedCount < threshold) return false;

    // ── Guard: duration must be a valid positive number ──────────────────
    const duration = Number(challenge.durationDays);
    if (!duration || isNaN(duration) || duration <= 0) {
        throw new Error(
            `Challenge is missing a valid duration (got: ${challenge.durationDays}). Cannot activate.`
        );
    }

    const now = new Date();
    challenge.status = "active";
    challenge.startAt = now;
    challenge.endsAt = getEndOfLastDay(now, duration);
    await challenge.save();

    await createChallengeBoardsForParticipants(challenge);

    return true;
};
/**
 * Award XP + badges to all accepted participants of a completed challenge.
 * Safe to call multiple times — skips participants where xpEarned > 0.
 */
const awardXPToParticipants = async (challenge) => {
    const participants = await ChallengeParticipant.find({
        challengeId: challenge._id,
        inviteStatus: "accepted",
    }).sort({ progressValue: -1 });

    for (const p of participants) {
        if (p.xpEarned > 0) continue; // already awarded

        const isWinner = challenge.winner?.toString() === p.userId.toString();
        const xp = isWinner ? challenge.xpReward : Math.floor(challenge.xpReward / 2);

        p.xpEarned = xp;
        await p.save();

        const updatedProgress = await addXP(p.userId.toString(), xp, isWinner);
        await checkAndAssignBadge(p.userId.toString(), "completion", updatedProgress.challengesCompleted);
        await checkAndAssignBadge(p.userId.toString(), "milestone", updatedProgress.level);

        await sendNotificationToUsers(
            [p.userId.toString()],
            "Challenge Complete! 🏆",
            `Your challenge has ended. +${xp} XP earned!`,
            { type: "challenge_completed", challengeId: challenge._id.toString() }
        );
    }
};

// ─── Get Challenge By ID ───────────────────────────────────────────────────
// GET /challenges/:id
exports.getChallengeById = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid challenge ID format" });
        }

        const challenge = await Challenge.findById(id)
            .populate("createdBy", "name profile_picture")
            .populate("winner", "name profile_picture");

        if (!challenge || challenge.moderationStatus === "removed") {
            return res.status(404).json({ success: false, message: "Challenge not found" });
        }

        const myParticipant = await ChallengeParticipant.findOne({ challengeId: id, userId })
            .populate("userId", "name profile_picture");

        const isCreator = challenge.createdBy?._id?.toString() === userId;

        if (!isCreator && !myParticipant) {
            return res.status(403).json({
                success: false,
                message: "You are not allowed to view this challenge",
            });
        }

        const [acceptedCount, enrichedChallenge] = await Promise.all([
            ChallengeParticipant.countDocuments({ challengeId: id, inviteStatus: "accepted" }),
            enrichChallengeCreatorXp(challenge),
        ]);

        return res.status(200).json({
            success: true,
            challenge: enrichedChallenge,
            myParticipant: myParticipant || null,
            acceptedCount,
            isCreator,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─── 1. Create Challenge ────────────────────────────────────────────────────
// POST /challenges/create
exports.createChallenge = async (req, res) => {
    try {
        const createdBy = req.user.id;

        // ── Block if user already has an active challenge ──────────────────
        const existingActive = await hasActiveChallenge(createdBy);
        if (existingActive) {
            return res.status(400).json({
                success: false,
                message: "You already have an active challenge. Please complete or wait for it to end before creating a new one.",
                activeChallengeId: existingActive._id,
            });
        }
        const {
            mode,
            sourceType,
            templateId,
            boardSize,
            scheduledDate,
        } = req.body;

        // Validate mode
        if (!mode || !["1v1", "4-player"].includes(mode)) {
            return res.status(400).json({
                success: false,
                message: "mode must be '1v1' or '4-player'",
            });
        }

        // Validate sourceType
        if (!sourceType || !["preset", "custom"].includes(sourceType)) {
            return res.status(400).json({
                success: false,
                message: "sourceType must be 'preset' or 'custom'",
            });
        }

        // Validate scheduledDate — required and must be in the future
        if (!scheduledDate) {
            return res.status(400).json({ success: false, message: "scheduledDate is required" });
        }
        const parsedDate = new Date(scheduledDate);
        if (isNaN(parsedDate.getTime())) {
            return res.status(400).json({ success: false, message: "scheduledDate is not a valid date" });
        }
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        if (parsedDate < todayStart) {
            return res.status(400).json({ success: false, message: "scheduledDate must be today or a future date" });
        }

        // durationDays is always 1
        const durationDays = 1;

        let challengeData = { createdBy, mode, sourceType, durationDays, scheduledDate: parsedDate };

        // ── Preset: copy fields from template ──────────────────────────────
        if (sourceType === "preset") {
            if (!templateId) {
                return res.status(400).json({
                    success: false,
                    message: "templateId is required for preset challenges",
                });
            }
            const template = await Template.findById(templateId);
            if (!template) {
                return res.status(404).json({ success: false, message: "Template not found" });
            }
            if (!template.isActive) {
                return res.status(400).json({
                    success: false,
                    message: "Cannot use an inactive template",
                });
            }

            const resolvedBoardSize = template.boardSize || 50;
            challengeData = {
                ...challengeData,
                templateId: template._id,
                boardSize: resolvedBoardSize,
                xpReward: resolvedBoardSize * 2,
            };
        }

        // ── Custom: use fields from request body ───────────────────────────
        if (sourceType === "custom") {
            const resolvedBoardSize = boardSize ? Number(boardSize) : 50;
            challengeData = {
                ...challengeData,
                boardSize: resolvedBoardSize,
                xpReward: resolvedBoardSize * 2,
            };
        }

        const challenge = await Challenge.create(challengeData);

        // Creator is always participant #1, auto-accepted
        await ChallengeParticipant.create({
            challengeId: challenge._id,
            userId: createdBy,
            role: "creator",
            inviteStatus: "accepted",
            respondedAt: new Date(),
        });

        const populated = await Challenge.findById(challenge._id)
            .populate("createdBy", "name profile_picture");

        return res.status(201).json({
            success: true,
            message: "Challenge created. Invite players — challenge will auto-start on the scheduled date.",
            challenge: await enrichChallengeCreatorXp(populated),
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── 2. Invite Players ──────────────────────────────────────────────────────
// POST /challenges/:id/invite
exports.invitePlayers = async (req, res) => {
    try {
        const { id } = req.params;
        const { userIds } = req.body;
        const creatorId = req.user.id;

        if (!Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: "userIds must be a non-empty array",
            });
        }

        const challenge = await Challenge.findById(id);
        if (!challenge) {
            return res.status(404).json({ success: false, message: "Challenge not found" });
        }
        if (challenge.createdBy.toString() !== creatorId) {
            return res.status(403).json({
                success: false,
                message: "Only the challenge creator can invite players",
            });
        }
        if (!["pending", "waiting"].includes(challenge.status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot invite to a challenge with status '${challenge.status}'`,
            });
        }
        // Mode-based invite cap
        const maxInvites = challenge.mode === "1v1" ? 1 : 3;
        if (userIds.length > maxInvites) {
            return res.status(400).json({
                success: false,
                message: `Mode '${challenge.mode}' allows a maximum of ${maxInvites} invitee(s)`,
            });
        }
        if (userIds.includes(creatorId)) {
            return res.status(400).json({ success: false, message: "Cannot invite yourself" });
        }
        const unique = new Set(userIds);
        if (unique.size !== userIds.length) {
            return res.status(400).json({
                success: false,
                message: "Duplicate user IDs are not allowed",
            });
        }

        // Separate existing participants by their current invite status
        const existing = await ChallengeParticipant.find({
            challengeId: id,
            userId: { $in: userIds },
        }).select("userId inviteStatus");

        const declinedIds    = existing.filter((p) => p.inviteStatus === "declined").map((p) => p.userId.toString());
        const alreadyActiveIds = existing.filter((p) => p.inviteStatus !== "declined").map((p) => p.userId.toString());

        // Only skip users who are already pending or accepted — not those who declined
        const toInviteNew    = userIds.filter((uid) => !alreadyActiveIds.includes(uid) && !declinedIds.includes(uid));
        const toReinvite     = userIds.filter((uid) => declinedIds.includes(uid));

        if (toInviteNew.length === 0 && toReinvite.length === 0) {
            return res.status(400).json({
                success: false,
                message: "All specified users have already been invited and are pending or accepted",
            });
        }

        // Reset declined participants back to pending
        if (toReinvite.length > 0) {
            await ChallengeParticipant.updateMany(
                { challengeId: id, userId: { $in: toReinvite } },
                { inviteStatus: "pending", respondedAt: null }
            );
        }

        // Insert brand-new participants
        let newParticipants = [];
        if (toInviteNew.length > 0) {
            newParticipants = await ChallengeParticipant.insertMany(
                toInviteNew.map((userId) => ({
                    challengeId: challenge._id,
                    userId,
                    role: "invitee",
                    inviteStatus: "pending",
                }))
            );
        }

        const allInvited = [...toInviteNew, ...toReinvite];

        // Push notification
        const creator = await User.findById(creatorId).select("name");
        await sendNotificationToUsers(
            allInvited,
            "You've been challenged! 🏆",
            `${creator?.name || "Someone"} has challenged you!`,
            { type: "challenge_invite", challengeId: challenge._id.toString() }
        );

        // Transition to "waiting" if still pending
        if (challenge.status === "pending") {
            challenge.status = "waiting";
            await challenge.save();
        }

        return res.status(201).json({
            success: true,
            message: `${allInvited.length} invite(s) sent${toReinvite.length > 0 ? ` (${toReinvite.length} re-invited after decline)` : ""}`,
            newParticipants,
            reinvitedCount: toReinvite.length,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── 3. Get My Invites — S8 ────────────────────────────────────────────────
// GET /challenges/invites?status=pending|accepted|declined
exports.getMyInvites = async (req, res) => {
    try {
        const userId = req.user.id;
        const { status } = req.query;
        const currentPage = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.limit) || 10;
        const skip = (currentPage - 1) * pageSize;

        const filter = { userId, role: "invitee" };
        if (status && ["pending", "accepted", "declined"].includes(status)) {
            filter.inviteStatus = status;
        }

        const totalItems = await ChallengeParticipant.countDocuments(filter);

        const invites = await ChallengeParticipant.find(filter)
            .populate({
                path: "challengeId",
                populate: { path: "createdBy", select: "name profile_picture" },
            })
            .skip(skip)
            .limit(pageSize)
            .sort({ createdAt: -1 });

        const totalPages = Math.ceil(totalItems / pageSize);

        // ── Enrich each invite with accepted-participant info for that challenge ──
        const enrichedInvites = await Promise.all(
            invites.map(async (invite) => {
                const challengeId = invite.challengeId?._id || invite.challengeId;

                // Find all participants who accepted this challenge
                const acceptedParticipants = await ChallengeParticipant.find({
                    challengeId,
                    inviteStatus: "accepted",
                }).populate("userId", "name profile_picture");

                const inviteObj = invite.toObject();
                inviteObj.acceptedCount = acceptedParticipants.length;
                inviteObj.acceptedParticipants = acceptedParticipants.map((p) => ({
                    userId: p.userId?._id,
                    name: p.userId?.name || null,
                    profilePicture: p.userId?.profile_picture || null,
                }));

                if (inviteObj.challengeId && typeof inviteObj.challengeId === "object") {
                    inviteObj.challengeId = await enrichChallengeCreatorXp(inviteObj.challengeId);
                }

                return inviteObj;
            })
        );

        res.status(200).json({
            success: true,
            pagination: {
                currentPage,
                totalPages,
                totalItems,
                pageSize,
                itemsCount: enrichedInvites.length,
                results: enrichedInvites,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── 4. Get Challenge Detail (before accepting) — S9 ──────────────────────
// GET /challenges/:id/detail
exports.getChallengeDetail = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const challenge = await Challenge.findById(id)
            .populate("createdBy", "name profile_picture")
            .populate("winner", "name profile_picture");

        if (!challenge) {
            return res.status(404).json({ success: false, message: "Challenge not found" });
        }
        if (challenge.moderationStatus === "removed") {
            return res.status(404).json({ success: false, message: "Challenge not found" });
        }

        const myParticipant = await ChallengeParticipant.findOne({ challengeId: id, userId });
        if (!myParticipant) {
            return res.status(403).json({
                success: false,
                message: "You have not been invited to this challenge",
            });
        }

        const [acceptedCount, enrichedChallenge] = await Promise.all([
            ChallengeParticipant.countDocuments({ challengeId: id, inviteStatus: "accepted" }),
            enrichChallengeCreatorXp(challenge),
        ]);

        res.status(200).json({
            success: true,
            challenge: enrichedChallenge,
            myParticipant: myParticipant || null,
            acceptedCount,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── 5. Respond to Invite (Accept / Decline) — S10 ────────────────────────
// POST /challenges/:id/respond   body: { action: "accept" | "decline" }
exports.respondToInvite = async (req, res) => {
    try {
        const { id } = req.params;
        const { action } = req.body;
        const userId = req.user.id;

        if (!["accept", "decline"].includes(action)) {
            return res.status(400).json({
                success: false,
                message: "action must be 'accept' or 'decline'",
            });
        }

        const challenge = await Challenge.findById(id);
        if (!challenge) {
            return res.status(404).json({ success: false, message: "Challenge not found" });
        }
        if (challenge.status === "cancelled") {
            return res.status(400).json({
                success: false,
                message: "This challenge has been cancelled",
            });
        }
        if (challenge.status === "active") {
            return res.status(400).json({
                success: false,
                message: "Challenge has already started",
            });
        }

        const participant = await ChallengeParticipant.findOne({
            challengeId: id,
            userId,
            role: "invitee",
        });
        if (!participant) {
            return res.status(404).json({
                success: false,
                message: "You have not been invited to this challenge",
            });
        }
        if (participant.inviteStatus !== "pending") {
            return res.status(400).json({
                success: false,
                message: `You have already ${participant.inviteStatus} this challenge`,
            });
        }

        participant.inviteStatus = action === "accept" ? "accepted" : "declined";
        participant.respondedAt = new Date();
        await participant.save();

        if (action === "accept") {
            // ── Block if user already has an active challenge ──────────────
            const existingActive = await hasActiveChallenge(userId);
            if (existingActive) {
                // Roll back the accept we just saved
                participant.inviteStatus = "pending";
                participant.respondedAt = null;
                await participant.save();

                return res.status(400).json({
                    success: false,
                    message: "You already have an active challenge. You cannot join another until it ends.",
                    activeChallengeId: existingActive._id,
                });
            }
        }

        res.status(200).json({
            success: true,
            message: action === "accept"
                ? "Challenge accepted! It will start automatically on the scheduled date."
                : "Challenge declined",
            participant,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── 6. Waiting Room — Player View — S11 ──────────────────────────────────
// GET /challenges/:id/waiting-room
exports.getWaitingRoom = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const challenge = await Challenge.findById(id)
            .populate("createdBy", "name profile_picture");
        if (!challenge) {
            return res.status(404).json({ success: false, message: "Challenge not found" });
        }

        // Verify user is a participant
        const myParticipant = await ChallengeParticipant.findOne({ challengeId: id, userId });
        if (!myParticipant) {
            return res.status(403).json({
                success: false,
                message: "You are not part of this challenge",
            });
        }

        const participants = await ChallengeParticipant.find({ challengeId: id })
            .populate("userId", "name profile_picture")
            .sort({ createdAt: 1 });

        const acceptedCount = participants.filter((p) => p.inviteStatus === "accepted").length;
        const totalSlots = challenge.mode === "1v1" ? 2 : 4; // includes creator

        res.status(200).json({
            success: true,
            challenge: await enrichChallengeCreatorXp(challenge),
            participants,
            acceptedCount,
            totalSlots,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── 7. Creator Monitor — S12 ─────────────────────────────────────────────
// GET /challenges/:id/monitor
exports.getCreatorMonitor = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const challenge = await Challenge.findById(id);
        if (!challenge) {
            return res.status(404).json({ success: false, message: "Challenge not found" });
        }
        if (challenge.createdBy.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: "Only the challenge creator can access this view",
            });
        }

        const all = await ChallengeParticipant.find({ challengeId: id, role: "invitee" })
            .populate("userId", "name profile_picture")
            .sort({ createdAt: 1 });

        const waiting = all.filter((p) => p.inviteStatus === "pending");
        const joined = all.filter((p) => p.inviteStatus === "accepted");
        const declined = all.filter((p) => p.inviteStatus === "declined");

        res.status(200).json({
            success: true,
            challenge,
            waiting,
            joined,
            declined,
            counts: {
                waiting: waiting.length,
                joined: joined.length,
                declined: declined.length,
                total: all.length,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── 8. Remind a Pending Invitee ──────────────────────────────────────────
// POST /challenges/:id/remind
exports.remindInvitee = async (req, res) => {
    try {
        const { id } = req.params;
        const creatorId = req.user.id;

        const challenge = await Challenge.findById(id);
        if (!challenge) {
            return res.status(404).json({ success: false, message: "Challenge not found" });
        }
        if (challenge.createdBy.toString() !== creatorId) {
            return res.status(403).json({
                success: false,
                message: "Only the challenge creator can send reminders",
            });
        }

        const pendingParticipants = await ChallengeParticipant.find({
            challengeId: id,
            role: "invitee",
            inviteStatus: "pending",
        }).select("userId");
        if (!pendingParticipants.length) {
            return res.status(404).json({
                success: false,
                message: "No pending invites found for this challenge",
            });
        }

        const targetUserIds = pendingParticipants.map((p) => p.userId.toString());

        const creator = await User.findById(creatorId).select("name");
        await sendNotificationToUsers(
            targetUserIds,
            "Challenge Reminder 🔔",
            `${creator?.name || "Your friend"} is waiting for you to respond to the challenge!`,
            { type: "challenge_reminder", challengeId: id }
        );

        res.status(200).json({
            success: true,
            message: "Reminders sent successfully",
            sentCount: targetUserIds.length,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── 9. Force-Start Challenge — S13 ───────────────────────────────────────
// POST /challenges/:id/start
exports.startChallenge = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const challenge = await Challenge.findById(id);
        if (!challenge) {
            return res.status(404).json({ success: false, message: "Challenge not found" });
        }
        if (challenge.createdBy.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: "Only the challenge creator can start the challenge",
            });
        }
        if (challenge.status !== "waiting") {
            return res.status(400).json({
                success: false,
                message:
                    challenge.status === "pending"
                        ? "Challenge is still pending — invite players first"
                        : `Challenge is already ${challenge.status}`,
            });
        }

        // At least 1 invitee must have accepted
        const acceptedCount = await ChallengeParticipant.countDocuments({
            challengeId: id,
            role: "invitee",
            inviteStatus: "accepted",
        });
        if (acceptedCount === 0) {
            return res.status(400).json({
                success: false,
                message: "At least 1 player must accept before you can start",
            });
        }

        const now = new Date();
        challenge.status = "active";
        challenge.startAt = now;
        challenge.endsAt = getEndOfLastDay(now, challenge.durationDays);
        await challenge.save();

        // Create day-1 challenge boards for all accepted participants
        await createChallengeBoardsForParticipants(challenge);

        // Notify all accepted participants
        const accepted = await ChallengeParticipant.find({
            challengeId: id,
            inviteStatus: "accepted",
        }).select("userId");

        await sendNotificationToUsers(
            accepted.map((p) => p.userId.toString()),
            "Challenge Started! 🚀",
            "Your challenge has started. Give it your best!",
            { type: "challenge_started", challengeId: challenge._id.toString() }
        );

        res.status(200).json({
            success: true,
            message: "Challenge started successfully",
            challenge,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── 10. Cancel Challenge ──────────────────────────────────────────────────
// POST /challenges/:id/cancel
exports.cancelChallenge = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const challenge = await Challenge.findById(id);
        if (!challenge) {
            return res.status(404).json({ success: false, message: "Challenge not found" });
        }
        if (challenge.createdBy.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: "Only the challenge creator can cancel",
            });
        }
        if (!["pending", "waiting"].includes(challenge.status)) {
            return res.status(400).json({
                success: false,
                message: "Can only cancel challenges that are in 'pending' or 'waiting' status",
            });
        }

        challenge.status = "cancelled";
        await challenge.save();

        // Notify all invitees
        const invitees = await ChallengeParticipant.find({
            challengeId: id,
            role: "invitee",
        }).select("userId");

        if (invitees.length) {
            await sendNotificationToUsers(
                invitees.map((p) => p.userId.toString()),
                "Challenge Cancelled",
                "The challenge has been cancelled.",
                { type: "challenge_cancelled", challengeId: id }
            );
        }

        res.status(200).json({
            success: true,
            message: "Challenge cancelled successfully",
            challenge,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── 11. My Challenges Hub — S1 (Ongoing / Created / Completed) ───────────
// GET /challenges/my?page=1&limit=10&status=all|ongoing|created|joined|completed|pending|waiting|cancelled
exports.getMyChallenges = async (req, res) => {
    try {
        const userId = req.user.id;

        const currentPage = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.limit) || 10;
        const skip = (currentPage - 1) * pageSize;

        // Allowed status values (default → "all")
        const VALID_STATUSES = ["all", "ongoing", "created", "joined", "completed", "pending", "waiting", "cancelled"];
        const status = VALID_STATUSES.includes(req.query.status) ? req.query.status : "all";

        // Find all challenge IDs where I'm an accepted participant
        const myParticipations = await ChallengeParticipant.find({
            userId,
            inviteStatus: "accepted",
        }).select("challengeId");
        const myChallengeIds = myParticipations.map((p) => p.challengeId);

        const populateOpts = [
            { path: "createdBy", select: "name profile_picture" },
            { path: "winner", select: "name profile_picture" },
        ];

        // ── Helper: run a DB query only when needed ──────────────────────────
        const fetchOngoing = () =>
            Challenge.find({
                _id: { $in: myChallengeIds },
                status: "active",
                moderationStatus: "ok",
            }).populate(populateOpts).sort({ startAt: -1 });

        const fetchCreated = () =>
            Challenge.find({
                createdBy: userId,
                status: { $in: ["pending", "waiting", "active"] },
                moderationStatus: "ok",
            }).populate(populateOpts).sort({ createdAt: -1 });

        const fetchJoined = () =>
            Challenge.find({
                _id: { $in: myChallengeIds },
                createdBy: { $ne: userId },
                status: { $in: ["waiting", "active"] },
                moderationStatus: "ok",
            }).populate(populateOpts).sort({ updatedAt: -1 });

        const fetchCompleted = () =>
            Challenge.find({
                _id: { $in: myChallengeIds },
                status: "completed",
                moderationStatus: "ok",
            }).populate(populateOpts).sort({ updatedAt: -1 });

        const fetchPending = () =>
            Challenge.find({
                createdBy: userId,
                status: "pending",
                moderationStatus: "ok",
            }).populate(populateOpts).sort({ createdAt: -1 });

        const fetchWaiting = () =>
            Challenge.find({
                createdBy: userId,
                status: "waiting",
                moderationStatus: "ok",
            }).populate(populateOpts).sort({ createdAt: -1 });

        const fetchCancelled = () =>
            Challenge.find({
                $or: [
                    { createdBy: userId },
                    { _id: { $in: myChallengeIds } },
                ],
                status: "cancelled",
                moderationStatus: "ok",
            }).populate(populateOpts).sort({ updatedAt: -1 });

        // ── Fetch counts for all tabs (always, for UI badge display) ─────────
        const [
            ongoingCount,
            createdCount,
            joinedCount,
            completedCount,
            pendingCount,
            waitingCount,
            cancelledCount,
        ] = await Promise.all([
            Challenge.countDocuments({ _id: { $in: myChallengeIds }, status: "active", moderationStatus: "ok" }),
            Challenge.countDocuments({ createdBy: userId, status: { $in: ["pending", "waiting", "active"] }, moderationStatus: "ok" }),
            Challenge.countDocuments({ _id: { $in: myChallengeIds }, createdBy: { $ne: userId }, status: { $in: ["waiting", "active"] }, moderationStatus: "ok" }),
            Challenge.countDocuments({ _id: { $in: myChallengeIds }, status: "completed", moderationStatus: "ok" }),
            Challenge.countDocuments({ createdBy: userId, status: "pending", moderationStatus: "ok" }),
            Challenge.countDocuments({ createdBy: userId, status: "waiting", moderationStatus: "ok" }),
            Challenge.countDocuments({
                $or: [{ createdBy: userId }, { _id: { $in: myChallengeIds } }],
                status: "cancelled",
                moderationStatus: "ok",
            }),
        ]);

        // ── Fetch the list matching the requested status ─────────────────────
        let resultList = [];

        switch (status) {
            case "ongoing":
                resultList = await fetchOngoing();
                break;
            case "created":
                resultList = await fetchCreated();
                break;
            case "joined":
                resultList = await fetchJoined();
                break;
            case "completed":
                resultList = await fetchCompleted();
                break;
            case "pending":
                resultList = await fetchPending();
                break;
            case "waiting":
                resultList = await fetchWaiting();
                break;
            case "cancelled":
                resultList = await fetchCancelled();
                break;
            case "all":
            default: {
                const [ongoing, createdByMe, completed] = await Promise.all([
                    fetchOngoing(),
                    fetchCreated(),
                    fetchCompleted(),
                ]);
                resultList = [...ongoing, ...createdByMe, ...completed];
                break;
            }
        }

        // ── Enrich creator XP then paginate ──────────────────────────────────
        resultList = await enrichChallengesCreatorXp(resultList);
        const totalItems = resultList.length;
        const totalPages = Math.ceil(totalItems / pageSize) || 1;
        const items = resultList.slice(skip, skip + pageSize);

        // Pending invites count (for notification badge)
        const pendingInvitesCount = await ChallengeParticipant.countDocuments({
            userId,
            role: "invitee",
            inviteStatus: "pending",
        });

        res.status(200).json({
            success: true,
            activeStatus: status,
            pendingInvitesCount,
            tabCounts: {
                all: ongoingCount + createdCount + completedCount,
                ongoing: ongoingCount,
                created: createdCount,
                joined: joinedCount,
                completed: completedCount,
                pending: pendingCount,
                waiting: waitingCount,
                cancelled: cancelledCount,
            },
            pagination: {
                currentPage,
                totalPages,
                totalItems,
                pageSize,
                itemsCount: items.length,
                results: items,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── 12. Log Progress — S14 / S15 ─────────────────────────────────────────
// POST /challenges/:id/log-progress   body: { value }
exports.logProgress = async (req, res) => {
    try {
        const { id } = req.params;
        const { value } = req.body;
        const userId = req.user.id;

        if (value === undefined || value === null || isNaN(Number(value))) {
            return res.status(400).json({
                success: false,
                message: "value is required and must be a number",
            });
        }

        const challenge = await Challenge.findById(id);
        if (!challenge) {
            return res.status(404).json({ success: false, message: "Challenge not found" });
        }
        if (challenge.status !== "active") {
            return res.status(400).json({
                success: false,
                message: `Challenge is not active (current status: ${challenge.status})`,
            });
        }

        const participant = await ChallengeParticipant.findOne({
            challengeId: id,
            userId,
            inviteStatus: "accepted",
        });
        if (!participant) {
            return res.status(403).json({
                success: false,
                message: "You are not an active participant in this challenge",
            });
        }

        participant.progressValue += Number(value);
        participant.progressLog.push({ value: Number(value), loggedAt: new Date() });
        await participant.save();

        res.status(200).json({
            success: true,
            message: "Progress logged successfully",
            progressValue: participant.progressValue,
            progressLog: participant.progressLog,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── 13. Live Leaderboard — S15 ───────────────────────────────────────────
// GET /challenges/:id/leaderboard
exports.getLeaderboard = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const challenge = await Challenge.findById(id);
        if (!challenge) {
            return res.status(404).json({ success: false, message: "Challenge not found" });
        }
        if (!["active", "completed"].includes(challenge.status)) {
            return res.status(400).json({
                success: false,
                message: "Leaderboard is only available for active or completed challenges",
            });
        }

        // Verify user is a participant
        const myParticipant = await ChallengeParticipant.findOne({
            challengeId: id,
            userId,
            inviteStatus: "accepted",
        });
        if (!myParticipant) {
            return res.status(403).json({
                success: false,
                message: "You are not a participant in this challenge",
            });
        }

        const participants = await ChallengeParticipant.find({
            challengeId: id,
            inviteStatus: "accepted",
        }).populate("userId", "name profile_picture");

        // Fetch personal smoke-free days for each participant in parallel
        const smokeFreePerParticipant = await Promise.all(
            participants.map((p) =>
                DailyBoard.countDocuments({
                    userId: p.userId._id,
                    challengeId: null,
                    cigarettesSmoked: 0,
                    cigarettesAvoided: { $gt: 0 },
                })
            )
        );

        // Build entries with smokeFreeDay then sort descending
        const withData = participants.map((p, i) => ({
            p,
            smokeFreeDay: smokeFreePerParticipant[i],
        }));

        withData.sort((a, b) => b.smokeFreeDay - a.smokeFreeDay);

        const ranked = withData.map(({ p, smokeFreeDay }, index) => ({
            rank: index + 1,
            user: p.userId,
            smokeFreeDay,
            cigarettesAvoided: p.challengeBoardStats.totalCigarettesAvoided,
            cigarettesSmoked:  p.challengeBoardStats.totalCigarettesSmoked,
            isMe: p.userId._id.toString() === userId,
            xpEarned: p.xpEarned,
        }));

        const mySmokeFreeDay = await DailyBoard.countDocuments({
            userId,
            challengeId: null,
            cigarettesSmoked: 0,
            cigarettesAvoided: { $gt: 0 },
        });

        const timeLeftMs =
            challenge.endsAt ? Math.max(0, new Date(challenge.endsAt) - new Date()) : null;

        res.status(200).json({
            success: true,
            challenge,
            leaderboard: ranked,
            timeLeftMs,
            myStats: {
                smokeFreeDay: mySmokeFreeDay,
                cigarettesAvoided: myParticipant.challengeBoardStats.totalCigarettesAvoided,
                cigarettesSmoked:  myParticipant.challengeBoardStats.totalCigarettesSmoked,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── 14. Get Results / Complete Challenge — S17 / S18 ─────────────────────
// POST /challenges/:id/complete
// Called when the user wants to see final results after the challenge ends.
// Safe to call multiple times — XP is awarded only once per participant.
exports.completeChallenge = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const challenge = await Challenge.findById(id)
            .populate("createdBy", "name profile_picture");
        if (!challenge) {
            return res.status(404).json({ success: false, message: "Challenge not found" });
        }

        const myParticipant = await ChallengeParticipant.findOne({
            challengeId: id,
            userId,
            inviteStatus: "accepted",
        });
        if (!myParticipant) {
            return res.status(403).json({
                success: false,
                message: "You are not a participant in this challenge",
            });
        }

        // Only active challenges past endsAt (or already completed) can be finalized
        if (challenge.status === "active") {
            if (challenge.endsAt && challenge.endsAt > new Date()) {
                return res.status(400).json({
                    success: false,
                    message: "Challenge is still ongoing — it hasn't ended yet",
                });
            }

            // Determine winner: highest cigarettesAvoided on the challenge board
            const allParticipants = await ChallengeParticipant.find({
                challengeId: id,
                inviteStatus: "accepted",
            }).sort({ "challengeBoardStats.totalCigarettesAvoided": -1 });

            challenge.winner = allParticipants[0]?.userId || null;
            challenge.status = "completed";
            await challenge.save();

            // Award XP to everyone (idempotent helper — skips already-awarded)
            await awardXPToParticipants(challenge);
        } else if (challenge.status === "completed") {
            // Re-award anyone who missed XP (re-entrant safety)
            await awardXPToParticipants(challenge);
        } else {
            return res.status(400).json({
                success: false,
                message: `Challenge cannot be completed from status '${challenge.status}'`,
            });
        }

        // Return final results
        const populated = await Challenge.findById(id)
            .populate("createdBy", "name profile_picture")
            .populate("winner", "name profile_picture");

        const finalLeaderboard = await ChallengeParticipant.find({
            challengeId: id,
            inviteStatus: "accepted",
        })
            .populate("userId", "name profile_picture")
            .sort({ progressValue: -1 });

        // Refresh my participant record
        const updatedMyParticipant = await ChallengeParticipant.findOne({
            challengeId: id,
            userId,
        });

        const enrichedPopulated = await enrichChallengeCreatorXp(populated);

        res.status(200).json({
            success: true,
            message: "Challenge completed",
            challenge: enrichedPopulated,
            leaderboard: finalLeaderboard,
            myResult: updatedMyParticipant,
            isWinner: enrichedPopulated.winner?._id.toString() === userId,
            xpEarned: updatedMyParticipant?.xpEarned || 0,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── 16. My Active Challenge — full detail + board ─────────────────────────
// GET /challenges/my-active
// User just passes their token — returns the single active challenge they're in
// (challenge info + leaderboard + today's DailyBoard + all days filled).
exports.getMyActiveChallenge = async (req, res) => {
    try {
        const userId = req.user.id;

        // ── Find the user's active challenge participation ─────────────────
        const myParticipations = await ChallengeParticipant.find({
            userId,
            inviteStatus: "accepted",
        }).select("challengeId");

        if (!myParticipations.length) {
            return res.status(404).json({
                success: false,
                message: "You don't have any active challenge right now",
            });
        }

        const challengeIds = myParticipations.map((p) => p.challengeId);

        const challenge = await Challenge.findOne({
            _id: { $in: challengeIds },
            status: "active",
            moderationStatus: "ok",
        })
            .populate("createdBy", "name profile_picture")
            .populate("winner", "name profile_picture");

        if (!challenge) {
            return res.status(404).json({
                success: false,
                message: "You don't have any active challenge right now",
            });
        }

        // ── My participant record ──────────────────────────────────────────
        const myParticipant = await ChallengeParticipant.findOne({
            challengeId: challenge._id,
            userId,
            inviteStatus: "accepted",
        });

        // ── Live standings (all accepted participants, ranked by board stats) ─
        const allParticipants = await ChallengeParticipant.find({
            challengeId: challenge._id,
            inviteStatus: "accepted",
        })
            .populate("userId", "name profile_picture")
            .sort({ "challengeBoardStats.totalCigarettesAvoided": -1 });

        const standings = allParticipants.map((p, i) => ({
            rank: i + 1,
            user: p.userId,
            challengeBoardStats: p.challengeBoardStats,
            isMe: p.userId?._id?.toString() === userId,
            xpEarned: p.xpEarned,
        }));

        const todayUTC = getTodayUTC();

        // ── Time remaining ────────────────────────────────────────────────
        const timeLeftMs = challenge.endsAt
            ? Math.max(0, new Date(challenge.endsAt) - new Date())
            : null;

        // Day number within the challenge (day 1 = first day)
        const currentDay = challenge.startAt
            ? Math.floor((todayUTC - new Date(challenge.startAt)) / (24 * 60 * 60 * 1000)) + 1
            : 1;

        res.status(200).json({
            success: true,
            challenge: await enrichChallengeCreatorXp(challenge),
            myParticipant,
            myStats: myParticipant?.challengeBoardStats || {
                totalCigarettesAvoided: 0,
                totalCigarettesSmoked: 0,
                totalDaysFilled: 0,
            },
            standings,
            timeLeftMs,
            currentDay,
            totalDays: challenge.durationDays,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Admin: Remove a Challenge ─────────────────────────────────────────────
// POST /challenges/admin/:id/remove
exports.adminRemoveChallenge = async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({ success: false, message: "Admin access required" });
        }

        const { id } = req.params;
        const challenge = await Challenge.findById(id);
        if (!challenge) {
            return res.status(404).json({ success: false, message: "Challenge not found" });
        }

        challenge.moderationStatus = "removed";
        if (["pending", "waiting", "active"].includes(challenge.status)) {
            challenge.status = "cancelled";
        }
        await challenge.save();

        res.status(200).json({
            success: true,
            message: "Challenge removed successfully",
            challenge,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Match History API ──────────────────────────────────────────────────────
exports.getMatchHistory = async (req, res) => {
    try {
        const userId = req.user.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Fetch User Progress for stats
        let progress = await UserProgress.findOne({ userId });
        if (!progress) {
            progress = { totalWins: 0, totalLosses: 0, challengesCompleted: 0 };
        }

        // Find all completed challenge participations
        const participations = await ChallengeParticipant.find({
            userId,
            inviteStatus: "accepted"
        })
            .populate({
                path: "challengeId",
                match: { status: "completed" }
            })
            .sort({ updatedAt: -1 });

        // Filter out unmatched challenges
        const completedParticipations = participations.filter(p => p.challengeId);

        // Manual pagination
        const paginatedParticipations = completedParticipations.slice(skip, skip + limit);

        const matches = await Promise.all(paginatedParticipations.map(async (p) => {
            const challenge = p.challengeId;
            const isWinner = challenge.winner && challenge.winner.toString() === userId;

            const allParticipants = await ChallengeParticipant.find({
                challengeId: challenge._id,
                inviteStatus: "accepted"
            }).populate("userId", "name profile_picture");

            let assignedTask = null;
            if (isWinner) {
                assignedTask = await ChallengeTaskAssignment.findOne({
                    challengeId: challenge._id,
                    assignedBy: userId
                }).populate("taskId");
            } else {
                assignedTask = await ChallengeTaskAssignment.findOne({
                    challengeId: challenge._id,
                    assignedTo: userId
                }).populate("taskId");
            }

            let taskDetail = null;
            if (assignedTask) {
                if (assignedTask.taskId) {
                    taskDetail = {
                        title: assignedTask.taskId.title,
                        description: assignedTask.taskId.description,
                        status: assignedTask.status
                    };
                } else if (assignedTask.customTask) {
                    taskDetail = {
                        title: assignedTask.customTask.title,
                        description: assignedTask.customTask.description,
                        status: assignedTask.status
                    };
                }
            }

            return {
                challengeId: challenge._id,
                mode: challenge.mode,
                createdAt: challenge.createdAt,
                startAt: challenge.startAt,
                endsAt: challenge.endsAt,
                xpReward: p.xpEarned, // Send actual XP earned
                isWinner,
                status: isWinner ? "won" : "lost",
                participants: allParticipants.map(ap => ({
                    userId: ap.userId._id,
                    name: ap.userId.name,
                    profilePicture: ap.userId.profile_picture,
                    totalCigarettesAvoided: ap.challengeBoardStats?.totalCigarettesAvoided || 0,
                    totalCigarettesSmoked: ap.challengeBoardStats?.totalCigarettesSmoked || 0,
                    isWinner: challenge.winner && challenge.winner.toString() === ap.userId._id.toString()
                })),
                assignedTask: taskDetail
            };
        }));

        res.status(200).json({
            success: true,
            stats: {
                totalWins: progress.totalWins || 0,
                totalLosses: progress.totalLosses || 0,
                totalChallengesCompleted: progress.challengesCompleted || 0
            },
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(completedParticipations.length / limit),
                totalItems: completedParticipations.length,
                pageSize: limit,
                itemsCount: matches.length,
                results: matches,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
