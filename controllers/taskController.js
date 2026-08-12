const Task = require("../models/Task");
const ChallengeTaskAssignment = require("../models/ChallengeTaskAssignment");
const Challenge = require("../models/Challenges");
const ChallengeParticipant = require("../models/ChallengeParticipant");
const User = require("../models/User");
const sendNotificationToUsers = require("../utils/sendNotification");

exports.createTask = async (req, res) => {
    try {
        const { title, description, xps_points } = req.body;
        if (!title) return res.status(400).json({ success: false, message: "title is required" });
        if (!description) return res.status(400).json({ success: false, message: "description is required" });
        const task = await Task.create({
            title,
            description,
            xps_points: xps_points ?? 0,
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
            Task.find().sort({ createdAt: -1 }).skip(skip).limit(pageSize),
            Task.countDocuments(),
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
        const task = await Task.findById(req.params.id);
        if (!task) return res.status(404).json({ success: false, message: "Task not found" });
        res.status(200).json({ success: true, task });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateTask = async (req, res) => {
    try {
        const { title, description, xps_points } = req.body;

        const task = await Task.findByIdAndUpdate(
            req.params.id,
            { title, description, xps_points },
            { new: true, omitUndefined: true }
        );
        if (!task) return res.status(404).json({ success: false, message: "Task not found" });

        res.status(200).json({ success: true, message: "Task updated successfully", task });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteTask = async (req, res) => {
    try {
        const task = await Task.findByIdAndDelete(req.params.id);
        if (!task) return res.status(404).json({ success: false, message: "Task not found" });
        res.status(200).json({ success: true, message: "Task deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── Challenge Task Assignment APIs ──────────────────────────────────────────────

exports.assignChallengeTask = async (req, res) => {
    try {
        const assignedBy = req.user.id;
        const { challengeId, assignedTo, note, taskIds, title, description } = req.body;

        // ── Validate required fields ──────────────────────────────────
        if (!challengeId) {
            return res.status(400).json({ success: false, message: "challengeId is required" });
        }
        if (!Array.isArray(assignedTo) || assignedTo.length === 0) {
            return res.status(400).json({ success: false, message: "assignedTo (array of loser userIds) is required and must not be empty" });
        }

        // Either reference existing task(s) via taskIds, or provide a one-off
        // custom task via title + description — not both.
        const hasTaskIds = Array.isArray(taskIds) && taskIds.length > 0;
        const hasCustomTask = !!title && !!description;

        if (!hasTaskIds && !hasCustomTask) {
            return res.status(400).json({
                success: false,
                message: "Provide either taskIds (non-empty array of task IDs) or a custom task (title + description)",
            });
        }

        // ── Verify challenge exists and is completed ─────────────────────
        const challenge = await Challenge.findById(challengeId).populate("winner", "_id name");
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

        // ── Verify all assignedTo users were accepted participants ────────
        for (const loserId of assignedTo) {
            if (loserId === assignedBy) {
                return res.status(400).json({ success: false, message: "You cannot assign a task to yourself" });
            }
            const loserParticipant = await ChallengeParticipant.findOne({
                challengeId,
                userId: loserId,
                inviteStatus: "accepted",
            });
            if (!loserParticipant) {
                return res.status(404).json({
                    success: false,
                    message: `User (${loserId}) was not an accepted participant of this challenge`,
                });
            }
        }

        // ── Resolve the task(s) to assign ───────────────────────────────
        let resolvedTaskIds;

        if (hasTaskIds) {
            // ── Verify all taskIds exist ───────────────────────────────
            for (const [i, taskId] of taskIds.entries()) {
                const exists = await Task.exists({ _id: taskId });
                if (!exists) {
                    return res.status(404).json({ success: false, message: `taskIds[${i}]: Task "${taskId}" not found` });
                }
            }
            resolvedTaskIds = taskIds;
        } else {
            // ── Custom task: just title + description ──
            const customTask = await Task.create({ title, description });
            resolvedTaskIds = [customTask._id];
        }

        // ── Create one assignment per loser × per task ─────────────────
        const assignmentDocs = [];
        for (const loserId of assignedTo) {
            for (const taskId of resolvedTaskIds) {
                assignmentDocs.push({
                    challengeId,
                    assignedBy,
                    assignedTo: loserId,
                    taskId,
                    note: note || "",
                });
            }
        }

        const inserted = await ChallengeTaskAssignment.insertMany(assignmentDocs);
        const insertedIds = inserted.map(a => a._id);

        const savedAssignments = await ChallengeTaskAssignment.find({ _id: { $in: insertedIds } })
            .populate('assignedBy', 'name profile_picture')
            .populate('taskId', 'title description xps_points')
            .lean();

        const formattedAssignments = savedAssignments.map(a => ({
            _id:         a._id,
            challengeId: a.challengeId?.toString() ?? null,
            assignedBy:  a.assignedBy ? {
                _id:             a.assignedBy._id?.toString() ?? null,
                name:            a.assignedBy.name ?? null,
                profile_picture: a.assignedBy.profile_picture ?? null,
            } : { _id: assignedBy },
            assignedTo:  a.assignedTo?.toString() ?? null,
            task:        a.taskId ? {
                _id:         a.taskId._id?.toString() ?? null,
                title:       a.taskId.title       ?? null,
                description: a.taskId.description ?? null,
                xps_points:  a.taskId.xps_points  ?? 0,
            } : null,
            note:        a.note ?? "",
            status:      a.status ?? "pending",
            createdAt:   a.createdAt,
            updatedAt:   a.updatedAt,
        }));

        // ── Notify the losers ───────────────────────────────────────
        const winner = await User.findById(assignedBy).select("name");
        await sendNotificationToUsers(
            assignedTo,
            "New Task Assigned! 📋",
            `${winner?.name || "The winner"} assigned you task(s) from the challenge`,
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
const formatAssignment = (a) => ({
    _id:         a._id,
    challengeId: a.challengeId?.toString() ?? null,
    assignedBy:  a.assignedBy ? {
        _id:             a.assignedBy._id?.toString() ?? null,
        name:            a.assignedBy.name ?? null,
        profile_picture: a.assignedBy.profile_picture ?? null,
    } : null,
    assignedTo:  a.assignedTo?.toString() ?? null,
    task:        a.taskId ? {
        _id:         a.taskId._id?.toString() ?? null,
        title:       a.taskId.title       ?? null,
        description: a.taskId.description ?? null,
        xps_points:  a.taskId.xps_points  ?? 0,
    } : null,
    note:        a.note ?? "",
    status:      a.status ?? "pending",
    createdAt:   a.createdAt,
    updatedAt:   a.updatedAt,
});

exports.getMyAssignedTasks = async (req, res) => {
    try {
        const userId = req.user.id;
        const { challengeId, status } = req.query;

        const filter = { assignedTo: userId };
        if (challengeId) filter.challengeId = challengeId;
        if (status && ["pending", "completed"].includes(status)) filter.status = status;

        const raw = await ChallengeTaskAssignment.find(filter)
            .populate('assignedBy', 'name profile_picture')
            .populate('taskId', 'title description xps_points')
            .sort({ createdAt: -1 })
            .lean();

        const assignments = raw.map(formatAssignment);
        res.status(200).json({ success: true, count: assignments.length, assignments });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getTasksIAssigned = async (req, res) => {
    try {
        const userId = req.user.id;
        const { challengeId, status } = req.query;

        const filter = { assignedBy: userId };
        if (challengeId) filter.challengeId = challengeId;
        if (status && ["pending", "completed"].includes(status)) filter.status = status;

        const raw = await ChallengeTaskAssignment.find(filter)
            .populate('assignedBy', 'name profile_picture')
            .populate('taskId', 'title description xps_points')
            .sort({ createdAt: -1 })
            .lean();

        const assignments = raw.map(formatAssignment);
        res.status(200).json({ success: true, count: assignments.length, assignments });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.completeAssignedTask = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        const assignment = await ChallengeTaskAssignment.findById(id)
            .populate("assignedBy", "name");
        if (!assignment) {
            return res.status(404).json({ success: false, message: "Assignment not found" });
        }
        if (assignment.assignedTo.toString() !== userId) {
            return res.status(403).json({ success: false, message: "You can only complete tasks assigned to you" });
        }
        if (assignment.status === "completed") {
            return res.status(400).json({ success: false, message: "Task is already marked as completed" });
        }

        assignment.status      = "completed";
        assignment.completedAt = new Date();
        await assignment.save();

        const loser = await User.findById(userId).select("name");
        await sendNotificationToUsers(
            [assignment.assignedBy._id.toString()],
            "Task Completed! ✅",
            `${loser?.name || "The loser"} completed a task from the challenge`,
            { type: "challenge_task_completed", assignmentId: id }
        );

        res.status(200).json({ success: true, message: "Task marked as completed", assignment });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
