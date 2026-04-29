const Task = require("../models/Task");
const ChallengeTaskAssignment = require("../models/ChallengeTaskAssignment");
const Challenge = require("../models/Challenges");
const ChallengeParticipant = require("../models/ChallengeParticipant");
const User = require("../models/User");
const sendNotificationToUsers = require("../utils/sendNotification");

exports.createTask = async (req, res) => {
    try {
        const { title, description, xps_points, is_custom } = req.body;
        const userId = req.user.id;
        const task = await Task.create({
            title,
            description,
            xps_points,
            is_custom,
            userId
        });
        res.status(201).json({ success: true, message: "Task created successfully", task });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getAllTasks = async (req, res) => {
    try {
        const currentPage = Math.max(parseInt(req.query.page) || 1, 1);
        const pageSize = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
        const skip = (currentPage - 1) * pageSize;

        const [results, totalItems] = await Promise.all([
            Task.find()
                .populate("userId", "name profile_picture")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(pageSize),
            Task.countDocuments()
        ]);

        const totalPages = Math.ceil(totalItems / pageSize);

        res.status(200).json({
            success: true,
            pagination: {
                currentPage,
                totalPages,
                totalItems,
                pageSize,
                itemsCount: results.length,
                results,
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getTaskById = async (req, res) => {
    try {
        const task = await Task.findById(req.params.id)
            .populate("userId", "name profile_picture");
        if (!task) {
            return res.status(404).json({ success: false, message: "Task not found" });
        }
        res.status(200).json({ success: true, task });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateTask = async (req, res) => {
    try {
        const { title, description, xps_points, is_custom } = req.body;
        const userId = req.user.id;

        // First, check if task exists and verify ownership
        const existingTask = await Task.findById(req.params.id);
        if (!existingTask) {
            return res.status(404).json({ success: false, message: "Task not found" });
        }
        if (existingTask.userId.toString() !== userId) {
            return res.status(403).json({ success: false, message: "You are not authorized to update this task" });
        }

        // Now perform the update
        const task = await Task.findByIdAndUpdate(
            req.params.id,
            { title, description, xps_points, is_custom },
            { new: true }
        );

        res.status(200).json({ success: true, message: "Task updated successfully", task });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteTask = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // First, check if task exists and verify ownership
        const task = await Task.findById(id);
        if (!task) {
            return res.status(404).json({ success: false, message: "Task not found" });
        }
        if (task.userId.toString() !== userId) {
            return res.status(403).json({ success: false, message: "You are not authorized to delete this task" });
        }

        // Now delete the task
        await Task.findByIdAndDelete(id);
        res.status(200).json({ success: true, message: "Task deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Challenge Task Assignment APIs ──────────────────────────────────────────────

/**
 * POST /tasks/challenge-assign
 * Winner assigns one or more tasks to the loser after a challenge completes.
 *
 * Body:
 * {
 *   challengeId: "...",
 *   assignedTo:  "<loser userId>",
 *   note:        "optional note",
 *   tasks: [
 *     // Option A — existing task
 *     { taskId: "<existingTaskId>" },
 *     // Option B — custom inline
 *     { customTask: { title: "...", description: "...", xps_points: 10 } }
 *   ]
 * }
 */
exports.assignChallengeTask = async (req, res) => {
    try {
        const assignedBy = req.user.id;
        const { challengeId, assignedTo, note, tasks } = req.body;

        // ── Validate required fields ──────────────────────────────────
        if (!challengeId) {
            return res.status(400).json({ success: false, message: "challengeId is required" });
        }
        if (!Array.isArray(assignedTo) || assignedTo.length === 0) {
            return res.status(400).json({ success: false, message: "assignedTo (array of loser userIds) is required and must not be empty" });
        }
        if (!Array.isArray(tasks) || tasks.length === 0) {
            return res.status(400).json({ success: false, message: "tasks must be a non-empty array" });
        }

        // ── Verify challenge exists and is completed ─────────────────────
        const challenge = await Challenge.findById(challengeId)
            .populate("winner", "_id name");
        if (!challenge) {
            return res.status(404).json({ success: false, message: "Challenge not found" });
        }
        if (challenge.status !== "completed") {
            return res.status(400).json({
                success: false,
                message: `Tasks can only be assigned after a challenge is completed (current status: ${challenge.status})`,
            });
        }

        // ── Verify the requesting user is the winner ────────────────────
        if (!challenge.winner || challenge.winner._id.toString() !== assignedBy) {
            return res.status(403).json({
                success: false,
                message: "Only the challenge winner can assign tasks to the loser",
            });
        }

        // ── Verify all assignedTo users were participants of this challenge ────────
        for (const loserId of assignedTo) {
            if (loserId === assignedBy) {
                return res.status(400).json({
                    success: false,
                    message: "You cannot assign a task to yourself",
                });
            }
            const loserParticipant = await ChallengeParticipant.findOne({
                challengeId,
                userId: loserId,
                inviteStatus: "accepted",
            });
            if (!loserParticipant) {
                return res.status(404).json({
                    success: false,
                    message: `The specified user (${loserId}) was not an accepted participant of this challenge`,
                });
            }
        }

        // ── Validate each task entry ───────────────────────────────
        for (const [i, t] of tasks.entries()) {
            const hasExisting = !!t.taskId;
            const hasCustom   = t.customTask && t.customTask.title && t.customTask.description;

            if (!hasExisting && !hasCustom) {
                return res.status(400).json({
                    success: false,
                    message: `tasks[${i}]: must have either taskId (existing) or customTask.title + customTask.description`,
                });
            }
            if (hasExisting) {
                const exists = await Task.exists({ _id: t.taskId });
                if (!exists) {
                    return res.status(404).json({
                        success: false,
                        message: `tasks[${i}]: Task with id "${t.taskId}" not found`,
                    });
                }
            }
        }

        // ── Create assignments ─────────────────────────────────────────
        const assignmentDocs = [];
        for (const loserId of assignedTo) {
            for (const t of tasks) {
                const doc = {
                    challengeId,
                    assignedBy,
                    assignedTo: loserId,
                    note: note || "",
                };
                if (t.taskId) {
                    doc.taskId = t.taskId;
                } else {
                    doc.taskId = null;
                    doc.customTask = t.customTask || {};
                }
                assignmentDocs.push(doc);
            }
        }
        
        const assignments = await ChallengeTaskAssignment.insertMany(assignmentDocs);

        // Re-query inserted assignments to control the response shape
        const insertedIds = assignments.map(a => a._id);
        const savedAssignments = await ChallengeTaskAssignment.find({ _id: { $in: insertedIds } })
            .populate('assignedBy', 'name profile_picture')
            .populate('taskId', 'title description xps_points')
            .lean();

        // Format assignments according to requirements:
        // - if taskId is provided, return customTask as null
        // - assignedBy should include name and profile_picture
        // - challengeId should be returned as the id only (no populated title/status)
        // - assignedTo should be returned as the user id only
        const formattedAssignments = savedAssignments.map(a => {
            const item = {
                _id: a._id,
                challengeId: a.challengeId ? a.challengeId.toString() : null,
                assignedBy: a.assignedBy ? {
                    _id: a.assignedBy._id ? a.assignedBy._id.toString() : null,
                    name: a.assignedBy.name || null,
                    profile_picture: a.assignedBy.profile_picture || null,
                } : { _id: assignedBy },
                assignedTo: a.assignedTo ? a.assignedTo.toString() : null,
                taskId: a.taskId ? (typeof a.taskId === 'object' ? {
                    _id: a.taskId._id ? a.taskId._id.toString() : null,
                    title: a.taskId.title || null,
                    description: a.taskId.description || null,
                    xps_points: a.taskId.xps_points || null,
                } : a.taskId.toString()) : null,
                note: a.note || "",
                status: a.status || "pending",
                createdAt: a.createdAt,
                updatedAt: a.updatedAt,
            };

            // Only include customTask when this assignment was created with a custom task
            if (!a.taskId) {
                const ct = a.customTask;
                const hasCustomValues = ct && (
                    (ct.title && String(ct.title).trim() !== '') ||
                    (ct.description && String(ct.description).trim() !== '') ||
                    (typeof ct.xps_points === 'number' && ct.xps_points > 0)
                );
                item.customTask = hasCustomValues ? ct : null;
            }

            return item;
        });

        // ── Notify the losers ───────────────────────────────────────
        const winner = await User.findById(assignedBy).select("name profile_picture");
        await sendNotificationToUsers(
            assignedTo,
            "New Task Assigned! 📋",
            `${winner?.name || "The winner"} assigned you task(s) from the challenge "${challenge.title}"`,
            { type: "challenge_task_assigned", challengeId: challengeId.toString() }
        );

        res.status(201).json({
            success: true,
            message: `${formattedAssignments.length} task(s) assigned successfully to ${assignedTo.length} user(s)`,
            assignments: formattedAssignments,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET /tasks/my-assigned
 * Loser sees all tasks assigned TO them (optionally filter by ?challengeId=... or ?status=pending|completed)
 */
exports.getMyAssignedTasks = async (req, res) => {
    try {
        const userId = req.user.id;
        const { challengeId, status } = req.query;

        const filter = { assignedTo: userId };
        if (challengeId) filter.challengeId = challengeId;
        if (status && ["pending", "completed"].includes(status)) filter.status = status;

        const assignmentsRaw = await ChallengeTaskAssignment.find(filter)
            .populate('assignedBy', 'name profile_picture')
            .populate('taskId', 'title description xps_points')
            .sort({ createdAt: -1 })
            .lean();

        const assignments = assignmentsRaw.map(a => {
            const item = {
                _id: a._id,
                challengeId: a.challengeId ? a.challengeId.toString() : null,
                assignedBy: a.assignedBy ? {
                    _id: a.assignedBy._id ? a.assignedBy._id.toString() : null,
                    name: a.assignedBy.name || null,
                    profile_picture: a.assignedBy.profile_picture || null,
                } : null,
                assignedTo: a.assignedTo ? a.assignedTo.toString() : null,
                taskId: a.taskId ? (typeof a.taskId === 'object' ? {
                    _id: a.taskId._id ? a.taskId._id.toString() : null,
                    title: a.taskId.title || null,
                    description: a.taskId.description || null,
                    xps_points: a.taskId.xps_points || null,
                } : a.taskId.toString()) : null,
                note: a.note || "",
                status: a.status || "pending",
                createdAt: a.createdAt,
                updatedAt: a.updatedAt,
            };

            if (!a.taskId) {
                const ct = a.customTask;
                const hasCustomValues = ct && (
                    (ct.title && String(ct.title).trim() !== '') ||
                    (ct.description && String(ct.description).trim() !== '') ||
                    (typeof ct.xps_points === 'number' && ct.xps_points > 0)
                );
                item.customTask = hasCustomValues ? ct : null;
            }

            return item;
        });

        res.status(200).json({ success: true, count: assignments.length, assignments });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET /tasks/i-assigned
 * Winner sees all tasks they assigned (optionally filter by ?challengeId=... or ?status=...)
 */
exports.getTasksIAssigned = async (req, res) => {
    try {
        const userId = req.user.id;
        const { challengeId, status } = req.query;

        const filter = { assignedBy: userId };
        if (challengeId) filter.challengeId = challengeId;
        if (status && ["pending", "completed"].includes(status)) filter.status = status;

        const assignmentsRaw = await ChallengeTaskAssignment.find(filter)
            .populate('assignedBy', 'name profile_picture')
            .populate('taskId', 'title description xps_points')
            .sort({ createdAt: -1 })
            .lean();

        const assignments = assignmentsRaw.map(a => {
            const item = {
                _id: a._id,
                challengeId: a.challengeId ? a.challengeId.toString() : null,
                assignedBy: a.assignedBy ? {
                    _id: a.assignedBy._id ? a.assignedBy._id.toString() : null,
                    name: a.assignedBy.name || null,
                    profile_picture: a.assignedBy.profile_picture || null,
                } : null,
                assignedTo: a.assignedTo ? a.assignedTo.toString() : null,
                taskId: a.taskId ? (typeof a.taskId === 'object' ? {
                    _id: a.taskId._id ? a.taskId._id.toString() : null,
                    title: a.taskId.title || null,
                    description: a.taskId.description || null,
                    xps_points: a.taskId.xps_points || null,
                } : a.taskId.toString()) : null,
                note: a.note || "",
                status: a.status || "pending",
                createdAt: a.createdAt,
                updatedAt: a.updatedAt,
            };

            if (!a.taskId) {
                const ct = a.customTask;
                const hasCustomValues = ct && (
                    (ct.title && String(ct.title).trim() !== '') ||
                    (ct.description && String(ct.description).trim() !== '') ||
                    (typeof ct.xps_points === 'number' && ct.xps_points > 0)
                );
                item.customTask = hasCustomValues ? ct : null;
            }

            return item;
        });

        res.status(200).json({ success: true, count: assignments.length, assignments });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * PATCH /tasks/challenge-assign/:id/complete
 * Loser marks an assigned task as completed.
 */
exports.completeAssignedTask = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        const assignment = await ChallengeTaskAssignment.findById(id)
            .populate("assignedBy", "name")
            .populate("challengeId", "title");
        if (!assignment) {
            return res.status(404).json({ success: false, message: "Assignment not found" });
        }
        if (assignment.assignedTo.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: "You can only complete tasks assigned to you",
            });
        }
        if (assignment.status === "completed") {
            return res.status(400).json({ success: false, message: "Task is already marked as completed" });
        }

        assignment.status      = "completed";
        assignment.completedAt = new Date();
        await assignment.save();

        // Notify the winner
        const loser = await User.findById(userId).select("name");
        await sendNotificationToUsers(
            [assignment.assignedBy._id.toString()],
            "Task Completed! ✅",
            `${loser?.name || "The loser"} completed a task from "${assignment.challengeId?.title || "the challenge"}"`,
            { type: "challenge_task_completed", assignmentId: id }
        );

        res.status(200).json({
            success: true,
            message: "Task marked as completed",
            assignment,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
