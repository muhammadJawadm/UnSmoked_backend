const crypto = require("crypto");
const mongoose = require("mongoose");

const Challenge = require("../models/Challenges");
const ChallengeParticipant = require("../models/ChallengeParticipant");
const Template = require("../models/Template");
const Category = require("../models/Category");
const User = require("../models/User");
const { addXP } = require("../utils/xpSystem");
const { checkAndAssignBadge } = require("../services/badgeService");
const sendNotificationToUsers = require("../utils/sendNotification");

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

    challenge.status = "active";
    challenge.startAt = new Date();
    challenge.endsAt = new Date(Date.now() + challenge.durationDays * 24 * 60 * 60 * 1000);
    await challenge.save();
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

        const updatedProgress = await addXP(p.userId.toString(), xp);
        await checkAndAssignBadge(p.userId.toString(), "completion", updatedProgress.challengesCompleted);
        await checkAndAssignBadge(p.userId.toString(), "milestone", updatedProgress.level);

        await sendNotificationToUsers(
            [p.userId.toString()],
            "Challenge Complete! 🏆",
            `${challenge.title} has ended. +${xp} XP earned!`,
            { type: "challenge_completed", challengeId: challenge._id.toString() }
        );
    }
};

// ─── 1. Create Challenge ────────────────────────────────────────────────────
// POST /challenges/create
exports.createChallenge = async (req, res) => {
    try {
        const createdBy = req.user.id;
        const {
            mode,
            sourceType,
            templateId,
            title,
            category,
            durationDays,
            boardSize,
            xpReward,
            description,
            rules,
        } = req.body;

        // Validate mode
        if (!mode || !["1v1", "4-player", "open"].includes(mode)) {
            return res.status(400).json({
                success: false,
                message: "mode must be '1v1', '4-player', or 'open'",
            });
        }

        // Validate sourceType
        if (!sourceType || !["preset", "custom"].includes(sourceType)) {
            return res.status(400).json({
                success: false,
                message: "sourceType must be 'preset' or 'custom'",
            });
        }

        let challengeData = { createdBy, mode, sourceType };

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

            challengeData = {
                ...challengeData,
                templateId: template._id,
                title: template.title,
                category: template.category,
                durationDays: template.durationDays,
                boardSize: template.boardSize || 50,
                // Creator can override XP from the template default
                xpReward: xpReward !== undefined ? Number(xpReward) : template.xpReward,
                description: template.description || "",
                rules: template.rules || "",
            };

            if (template.category) {
                const templateCategoryExists = await Category.exists({ _id: template.category });
                if (!templateCategoryExists) {
                    return res.status(400).json({
                        success: false,
                        message: "Template category is invalid or has been deleted",
                    });
                }
            }
        }

        // ── Custom: use fields from request body ───────────────────────────
        if (sourceType === "custom") {
            if (!title || !title.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "title is required for custom challenges",
                });
            }
            if (!durationDays || isNaN(durationDays) || Number(durationDays) < 1) {
                return res.status(400).json({
                    success: false,
                    message: "durationDays must be a number >= 1",
                });
            }

            const categoryValidation = await ensureValidCategory(category);
            if (!categoryValidation.valid) {
                return res.status(400).json({
                    success: false,
                    message: categoryValidation.message,
                });
            }

            challengeData = {
                ...challengeData,
                title: title.trim(),
                category,
                durationDays: Number(durationDays),
                boardSize: boardSize ? Number(boardSize) : 50,
                xpReward: xpReward ? Number(xpReward) : 50,
                description: description || "",
                rules: rules || "",
            };
        }

        // ── Open challenges are immediately active ─────────────────────────
        if (mode === "open") {
            challengeData.inviteToken = generateInviteToken();
            challengeData.status = "active";
            challengeData.startAt = new Date();
            challengeData.endsAt = new Date(
                Date.now() + challengeData.durationDays * 24 * 60 * 60 * 1000
            );
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
            .populate("createdBy", "name profile_picture")
            .populate("category", "name");

        return res.status(201).json({
            success: true,
            message:
                mode === "open"
                    ? "Open challenge created and is now active"
                    : "Challenge created successfully",
            challenge: populated,
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
        if (challenge.status !== "waiting") {
            return res.status(400).json({
                success: false,
                message: "Cannot invite to a challenge that is not in waiting status",
            });
        }
        if (challenge.mode === "open") {
            return res.status(400).json({
                success: false,
                message: "Open challenges use share links, not direct invites",
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

        // Skip already-invited users
        const existing = await ChallengeParticipant.find({
            challengeId: id,
            userId: { $in: userIds },
        }).select("userId");
        const alreadyInvitedIds = existing.map((p) => p.userId.toString());
        const toInvite = userIds.filter((uid) => !alreadyInvitedIds.includes(uid));

        if (toInvite.length === 0) {
            return res.status(400).json({
                success: false,
                message: "All specified users have already been invited",
            });
        }

        const participants = await ChallengeParticipant.insertMany(
            toInvite.map((userId) => ({
                challengeId: challenge._id,
                userId,
                role: "invitee",
                inviteStatus: "pending",
            }))
        );

        // Push notification
        const creator = await User.findById(creatorId).select("name");
        await sendNotificationToUsers(
            toInvite,
            "You've been challenged! 🏆",
            `${creator?.name || "Someone"} challenged you: ${challenge.title}`,
            { type: "challenge_invite", challengeId: challenge._id.toString() }
        );

        return res.status(201).json({
            success: true,
            message: `${toInvite.length} invite(s) sent`,
            participants,
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

        const filter = { userId, role: "invitee" };
        if (status && ["pending", "accepted", "declined"].includes(status)) {
            filter.inviteStatus = status;
        }

        const invites = await ChallengeParticipant.find(filter)
            .populate({
                path: "challengeId",
                populate: { path: "createdBy", select: "name profile_picture" },
            })
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, invites });
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
            .populate("category", "name")
            .populate("winner", "name profile_picture");

        if (!challenge) {
            return res.status(404).json({ success: false, message: "Challenge not found" });
        }
        if (challenge.moderationStatus === "removed") {
            return res.status(404).json({ success: false, message: "Challenge not found" });
        }

        // Verify the requesting user is a participant (except open challenges)
        const myParticipant = await ChallengeParticipant.findOne({ challengeId: id, userId });
        if (!myParticipant && challenge.mode !== "open") {
            return res.status(403).json({
                success: false,
                message: "You have not been invited to this challenge",
            });
        }

        const acceptedCount = await ChallengeParticipant.countDocuments({
            challengeId: id,
            inviteStatus: "accepted",
        });

        res.status(200).json({
            success: true,
            challenge,
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

        let challengeActivated = false;

        if (action === "accept") {
            challengeActivated = await tryAutoActivate(challenge);

            if (challengeActivated) {
                // Notify all accepted participants that challenge is starting
                const accepted = await ChallengeParticipant.find({
                    challengeId: id,
                    inviteStatus: "accepted",
                }).select("userId");

                await sendNotificationToUsers(
                    accepted.map((p) => p.userId.toString()),
                    "Challenge Started! 🚀",
                    `${challenge.title} is now active. Give it your best!`,
                    { type: "challenge_started", challengeId: challenge._id.toString() }
                );
            }
        }

        res.status(200).json({
            success: true,
            message: action === "accept" ? "Challenge accepted!" : "Challenge declined",
            participant,
            challengeActivated,
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
            .populate("createdBy", "name profile_picture")
            .populate("category", "name");
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
            challenge,
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

        const challenge = await Challenge.findById(id).populate("category", "name");
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
// POST /challenges/:id/remind   body: { userId }
exports.remindInvitee = async (req, res) => {
    try {
        const { id } = req.params;
        const { userId: targetUserId } = req.body;
        const creatorId = req.user.id;

        if (!targetUserId) {
            return res.status(400).json({ success: false, message: "userId is required" });
        }

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

        const participant = await ChallengeParticipant.findOne({
            challengeId: id,
            userId: targetUserId,
            inviteStatus: "pending",
        });
        if (!participant) {
            return res.status(404).json({
                success: false,
                message: "No pending invite found for this user",
            });
        }

        const creator = await User.findById(creatorId).select("name");
        await sendNotificationToUsers(
            [targetUserId],
            "Challenge Reminder 🔔",
            `${creator?.name || "Your friend"} is waiting: ${challenge.title}`,
            { type: "challenge_reminder", challengeId: id }
        );

        res.status(200).json({ success: true, message: "Reminder sent successfully" });
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
                message: `Challenge is already ${challenge.status}`,
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

        challenge.status = "active";
        challenge.startAt = new Date();
        challenge.endsAt = new Date(
            Date.now() + challenge.durationDays * 24 * 60 * 60 * 1000
        );
        await challenge.save();

        // Notify all accepted participants
        const accepted = await ChallengeParticipant.find({
            challengeId: id,
            inviteStatus: "accepted",
        }).select("userId");

        await sendNotificationToUsers(
            accepted.map((p) => p.userId.toString()),
            "Challenge Started! 🚀",
            `${challenge.title} has started. Give it your best!`,
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
        if (challenge.status !== "waiting") {
            return res.status(400).json({
                success: false,
                message: "Can only cancel challenges in waiting status",
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
                `The challenge "${challenge.title}" has been cancelled.`,
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
// GET /challenges/my
exports.getMyChallenges = async (req, res) => {
    try {
        const userId = req.user.id;

        // Find all challenge IDs where I'm an accepted participant
        const myParticipations = await ChallengeParticipant.find({
            userId,
            inviteStatus: "accepted",
        }).select("challengeId");
        const myChallengeIds = myParticipations.map((p) => p.challengeId);

        // Ongoing: active challenges I'm in (as any role)
        const ongoing = await Challenge.find({
            _id: { $in: myChallengeIds },
            status: "active",
            moderationStatus: "ok",
        })
            .populate("createdBy", "name profile_picture")
            .populate("category", "name")
            .populate("winner", "name profile_picture")
            .sort({ startAt: -1 });

        // Created by me (waiting or active)
        const createdByMe = await Challenge.find({
            createdBy: userId,
            status: { $in: ["waiting", "active"] },
            moderationStatus: "ok",
        })
            .populate("createdBy", "name profile_picture")
            .populate("category", "name")
            .sort({ createdAt: -1 });

        // Completed challenges I was in
        const completed = await Challenge.find({
            _id: { $in: myChallengeIds },
            status: "completed",
            moderationStatus: "ok",
        })
            .populate("createdBy", "name profile_picture")
            .populate("category", "name")
            .populate("winner", "name profile_picture")
            .sort({ updatedAt: -1 });

        // Pending invites count (for badge/tab indicator)
        const pendingInvitesCount = await ChallengeParticipant.countDocuments({
            userId,
            role: "invitee",
            inviteStatus: "pending",
        });

        res.status(200).json({
            success: true,
            ongoing,
            createdByMe,
            completed,
            pendingInvitesCount,
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

        const challenge = await Challenge.findById(id).populate("category", "name");
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

        const leaderboard = await ChallengeParticipant.find({
            challengeId: id,
            inviteStatus: "accepted",
        })
            .populate("userId", "name profile_picture")
            .sort({ progressValue: -1 });

        const topValue = leaderboard[0]?.progressValue || 1;

        const ranked = leaderboard.map((p, index) => ({
            rank: index + 1,
            user: p.userId,
            progressValue: p.progressValue,
            percentage: topValue > 0 ? Math.round((p.progressValue / topValue) * 100) : 0,
            isMe: p.userId._id.toString() === userId,
            xpEarned: p.xpEarned,
        }));

        const timeLeftMs =
            challenge.endsAt ? Math.max(0, new Date(challenge.endsAt) - new Date()) : null;

        res.status(200).json({
            success: true,
            challenge,
            leaderboard: ranked,
            timeLeftMs,
            myProgressValue: myParticipant.progressValue,
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
            .populate("createdBy", "name profile_picture")
            .populate("category", "name");
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

            // Determine winner: highest progress value
            const allParticipants = await ChallengeParticipant.find({
                challengeId: id,
                inviteStatus: "accepted",
            }).sort({ progressValue: -1 });

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
            .populate("category", "name")
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

        res.status(200).json({
            success: true,
            message: "Challenge completed",
            challenge: populated,
            leaderboard: finalLeaderboard,
            myResult: updatedMyParticipant,
            isWinner: populated.winner?._id.toString() === userId,
            xpEarned: updatedMyParticipant?.xpEarned || 0,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── 15. Discover Preset Challenges — S4 ──────────────────────────────────
// GET /challenges/discover?category=Health
exports.discoverChallenges = async (req, res) => {
    try {
        const { category } = req.query;
        const categoryQuery = typeof category === "string" ? category.trim() : "";

        const filter = { isActive: true, isCustom: false };
        if (categoryQuery && categoryQuery.toLowerCase() !== "all") {
            if (mongoose.Types.ObjectId.isValid(categoryQuery)) {
                const categoryExists = await Category.exists({ _id: categoryQuery });
                if (!categoryExists) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid category. Category not found",
                    });
                }
                filter.category = categoryQuery;
            } else {
                const categoryDoc = await Category.findOne({
                    name: { $regex: `^${escapeRegex(categoryQuery)}$`, $options: "i" },
                }).select("_id");

                if (!categoryDoc) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid category. Category not found",
                    });
                }

                filter.category = categoryDoc._id;
            }
        }

        const templates = await Template.find(filter)
            .populate("category", "name")
            .sort({ createdAt: -1 });

        const categories = await Category.find().select("name").sort({ name: 1 });

        res.status(200).json({
            success: true,
            templates,
            categories: ["All", ...categories.map((c) => c.name)],
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
        if (["active", "waiting"].includes(challenge.status)) {
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
