const Challenges = require("../models/Challenges");
const Template = require("../models/Template");
const { addXP } = require("../utils/xpSystem");
const { checkAndAssignBadge } = require("../services/badgeService");
const mongoose = require("mongoose");

// Assign challenge from template — supports type 2 (1-on-1) and type 4 (1 vs 3)
exports.assignChallenge = async (req, res) => {
    try {
        const { templateId, assignedTo, type } = req.body;
        const assignedBy = req.user.id;

        // Basic validation
        if (!templateId || !assignedTo) {
            return res.status(400).json({ success: false, message: "templateId and assignedTo are required" });
        }
        if (!type || (type !== 2 && type !== 4)) {
            return res.status(400).json({ success: false, message: "type must be 2 (1-on-1) or 4 (1 vs 3)" });
        }

        // type 2: assignedTo is a single user ID string
        if (type === 2) {
            if (typeof assignedTo !== "string" || !assignedTo) {
                return res.status(400).json({ success: false, message: "For type 2, assignedTo must be a single user ID string" });
            }
            if (assignedBy === assignedTo) {
                return res.status(400).json({ success: false, message: "Cannot assign challenge to yourself" });
            }
        }

        // type 4: assignedTo must be an array of exactly 3 user IDs
        if (type === 4) {
            if (!Array.isArray(assignedTo) || assignedTo.length !== 3) {
                return res.status(400).json({ success: false, message: "For type 4, assignedTo must be an array of exactly 3 user IDs" });
            }
            if (assignedTo.includes(assignedBy)) {
                return res.status(400).json({ success: false, message: "Cannot assign challenge to yourself" });
            }
            const uniqueIds = new Set(assignedTo);
            if (uniqueIds.size !== assignedTo.length) {
                return res.status(400).json({ success: false, message: "Duplicate user IDs in assignedTo are not allowed" });
            }
        }

        // Fetch template
        const template = await Template.findById(templateId);
        if (!template) {
            return res.status(404).json({ success: false, message: "Template not found" });
        }
        if (!template.isActive) {
            return res.status(400).json({ success: false, message: "Cannot assign inactive template" });
        }

        const startAt = new Date();
        const dueAt = new Date(startAt.getTime() + template.durationDays * 24 * 60 * 60 * 1000);

        const assignmentData = {
            assignedBy,
            sourceType: template.isCustom ? "custom" : "template",
            templateId: template._id,
            startAt,
            dueAt,
            ...(template.isCustom && { moderationStatus: "ok" }),
        };

        // ── TYPE 2: single 1-on-1 challenge (no groupId needed) ──────────────
        if (type === 2) {
            const assignment = await Challenges.create({ ...assignmentData, assignedTo });
            const populated = await Challenges.findById(assignment._id)
                .populate("assignedBy", "name profile_picture")
                .populate("assignedTo", "name profile_picture");

            return res.status(201).json({
                success: true,
                message: "Challenge assigned successfully",
                assignment: populated,
            });
        }

        // ── TYPE 4: one challenge sent to 3 users — grouped by a shared groupId ─
        if (type === 4) {
            // Generate a shared groupId so we can later find all 3 assignments together
            const groupId = new mongoose.Types.ObjectId();

            const createdAssignments = await Challenges.insertMany(
                assignedTo.map((userId) => ({ ...assignmentData, assignedTo: userId, groupId }))
            );

            const populated = await Challenges.find({
                _id: { $in: createdAssignments.map((a) => a._id) },
            })
                .populate("assignedBy", "name profile_picture")
                .populate("assignedTo", "name profile_picture");

            return res.status(201).json({
                success: true,
                message: "Challenge assigned to 3 users successfully",
                groupId,
                assignments: populated,
            });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get my ongoing challenges (with auto-expire)
exports.getMyOngoing = async (req, res) => {
    try {
        const userId = req.user.id;

        // Auto-expire overdue challenges
        await Challenges.updateMany(
            { assignedTo: userId, status: "pending", dueAt: { $lte: new Date() } },
            { status: "expired" }
        );

        const challenges = await Challenges.find({
            assignedTo: userId,
            status: "pending",
            moderationStatus: { $ne: "removed" },
        })
            .populate("assignedBy", "name profile_picture")
            .populate("winner", "name profile_picture")
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, challenges });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get my challenge history
exports.getMyHistory = async (req, res) => {
    try {
        const userId = req.user.id;
        const { status } = req.query;
        const limit = parseInt(req.query.limit) || 100;

        const filter = {
            assignedTo: userId,
            status: { $in: ["completed", "expired", "failed", "removed"] },
        };

        if (status) filter.status = status;

        const challenges = await Challenges.find(filter)
            .populate("assignedBy", "name profile_picture")
            .populate("winner", "name profile_picture")
            .sort({ createdAt: -1 })
            .limit(limit);

        res.status(200).json({ success: true, challenges });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Complete a challenge — detects first finisher and sets winner across the group
exports.completeChallenge = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // Populate template for xpReward
        const challenge = await Challenges.findById(id).populate("templateId");
        if (!challenge) {
            return res.status(404).json({ success: false, message: "Challenge not found" });
        }

        // Ownership check
        if (challenge.assignedTo.toString() !== userId) {
            return res.status(403).json({ success: false, message: "You are not authorized to complete this challenge" });
        }

        if (challenge.status !== "pending") {
            return res.status(400).json({ success: false, message: `Challenge is already ${challenge.status}` });
        }

        // Check expiry
        if (challenge.dueAt <= new Date()) {
            challenge.status = "expired";
            await challenge.save();
            return res.status(400).json({ success: false, message: "Challenge has expired" });
        }

        // Mark this assignment as completed
        challenge.status = "completed";
        challenge.completedAt = new Date();

        // ── Winner detection (only applies to grouped / type-4 challenges) ────
        if (challenge.groupId) {
            // Check if any sibling in the group is already completed (= someone won first)
            const existingWinner = await Challenges.findOne({
                groupId: challenge.groupId,
                status: "completed",
                winner: { $ne: null },
            });

            if (existingWinner) {
                // A winner already exists — propagate winner to this record too
                challenge.winner = existingWinner.winner;
            } else {
                // This user is the FIRST to complete — they are the winner
                challenge.winner = userId;

                // Mark all other siblings with this winner as well so every record shows it
                await Challenges.updateMany(
                    { groupId: challenge.groupId, _id: { $ne: challenge._id } },
                    { winner: userId }
                );
            }
        }

        await challenge.save();

        // Award XP
        const xpReward = challenge.templateId?.xpReward ?? 0;
        const updatedProgress = await addXP(userId, xpReward);

        // ── Auto-assign badges based on updated progress ────────────────────
        const newBadges = [];

        // Check completion-based badges (e.g. "Complete 5 challenges")
        const completionBadges = await checkAndAssignBadge(
            userId,
            "completion",
            updatedProgress.challengesCompleted
        );
        newBadges.push(...completionBadges);

        // Check milestone-based badges (e.g. "Reach level 10")
        const milestoneBadges = await checkAndAssignBadge(
            userId,
            "milestone",
            updatedProgress.level
        );
        newBadges.push(...milestoneBadges);

        const populated = await Challenges.findById(challenge._id)
            .populate("assignedBy", "name profile_picture")
            .populate("winner", "name profile_picture");

        res.status(200).json({
            success: true,
            message: "Challenge completed successfully",
            challenge: populated,
            progress: updatedProgress,
            isWinner: challenge.winner?.toString() === userId,
            newBadges: newBadges.length ? newBadges : undefined,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get full group challenge results (all 3 opponents + winner)
exports.getGroupChallenge = async (req, res) => {
    try {
        const { groupId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(groupId)) {
            return res.status(400).json({ success: false, message: "Invalid groupId" });
        }

        const assignments = await Challenges.find({ groupId })
            .populate("assignedBy", "name profile_picture")
            .populate("assignedTo", "name profile_picture")
            .populate("winner", "name profile_picture")
            .sort({ completedAt: 1 }); // earliest completed first

        if (!assignments.length) {
            return res.status(404).json({ success: false, message: "Group challenge not found" });
        }

        // Only participants (assignedTo) or the creator (assignedBy) can view
        const userId = req.user.id;
        const isParticipant = assignments.some(
            (a) =>
                a.assignedTo._id.toString() === userId ||
                a.assignedBy?._id.toString() === userId
        );
        if (!isParticipant) {
            return res.status(403).json({ success: false, message: "Access denied" });
        }

        const winner = assignments[0]?.winner ?? null;

        res.status(200).json({
            success: true,
            groupId,
            winner,
            assignments,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Admin: Remove a custom challenge
exports.removeChallenge = async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({ success: false, message: "Admin access required" });
        }

        const { id } = req.params;

        const challenge = await Challenges.findById(id);
        if (!challenge) {
            return res.status(404).json({ success: false, message: "Challenge not found" });
        }

        if (challenge.sourceType !== "custom") {
            return res.status(400).json({ success: false, message: "Can only moderate custom challenges" });
        }

        if (challenge.status === "pending") {
            challenge.status = "removed";
        }

        // Always mark moderationStatus so getMyOngoing filter hides it
        challenge.moderationStatus = "removed";

        await challenge.save();

        res.status(200).json({ success: true, message: "Challenge removed successfully", challenge });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
