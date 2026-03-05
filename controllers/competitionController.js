const Board = require("../models/Board");
const Competition = require("../models/Competition");
const User = require("../models/User");
const mongoose = require("mongoose");
const sendNotificationToUsers = require("../utils/sendNotification");

// ─── Helper ───
// Builds day entries for a competition board starting from startDate
const buildCompetitionDays = (days, startDate) => {
    const entries = [];
    const start = new Date(startDate);
    for (let i = 1; i <= days; i++) {
        entries.push({
            day: i,
            smoked: null,
            date: new Date(start.getTime() + (i - 1) * 24 * 60 * 60 * 1000),
        });
    }
    return entries;
};

/**
 * Internal: called when a competition fills up.
 * Creates boards for each player, sends push notifications.
 */
const activateFullCompetition = async (competition) => {
    const dayEntries = buildCompetitionDays(competition.days, competition.startDate);

    // Create one board per player
    const boardDocs = await Board.create(
        competition.players.map((p) => ({
            userId: p.user,
            boardSize: competition.days, // board tracks `days` number of day-entries
            days: dayEntries.map((d) => ({ ...d, date: new Date(d.date) })),
            competition: competition._id,
        }))
    );

    // Link each board to its player
    competition.players.forEach((p, i) => {
        p.board = boardDocs[i]._id;
    });

    await competition.save();

    // Notify all participants
    const playerIds = competition.players.map((p) => p.user.toString());
    const formattedDate = competition.startDate.toISOString().split("T")[0];

    await sendNotificationToUsers(
        playerIds,
        "Competition Starting Soon! 🏆",
        `Your ${competition.numberOfPlayers}-player competition starts on ${formattedDate}. Be ready!`,
        {
            type: "competition_starting",
            competitionId: competition._id.toString(),
            startDate: formattedDate,
        }
    );
};

// ═══════════════════════════════════════════
// POST /competitions/create
// ═══════════════════════════════════════════
exports.createCompetition = async (req, res) => {
    try {
        const creatorId = req.user.id;
        const { numberOfPlayers, days, boardSize, startDate } = req.body;

        // --- Validation ---
        if (!numberOfPlayers || !days || !boardSize || !startDate) {
            return res.status(400).json({
                success: false,
                message: "numberOfPlayers, days, boardSize, and startDate are required",
            });
        }

        if (![2, 4].includes(Number(numberOfPlayers))) {
            return res.status(400).json({
                success: false,
                message: "numberOfPlayers must be 2 or 4",
            });
        }

        if (Number(days) <= 0) {
            return res.status(400).json({
                success: false,
                message: "days must be a positive number",
            });
        }

        if (Number(boardSize) <= 0) {
            return res.status(400).json({
                success: false,
                message: "boardSize must be a positive number",
            });
        }

        const parsedStartDate = new Date(startDate);
        if (isNaN(parsedStartDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: "startDate must be a valid date",
            });
        }

        // startDate must be in the future (at least tomorrow)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startDay = new Date(parsedStartDate);
        startDay.setHours(0, 0, 0, 0);
        if (startDay <= today) {
            return res.status(400).json({
                success: false,
                message: "startDate must be a future date (at least tomorrow)",
            });
        }

        // Check if creator already has a pending/active competition
        const existingCompetition = await Competition.findOne({
            "players.user": creatorId,
            status: { $in: ["pending", "active"] },
        });
        if (existingCompetition) {
            return res.status(400).json({
                success: false,
                message: "You already have an active or pending competition",
            });
        }

        const competition = await Competition.create({
            numberOfPlayers: Number(numberOfPlayers),
            days: Number(days),
            boardSize: Number(boardSize),
            startDate: parsedStartDate,
            createdBy: creatorId,
            status: "pending",
            players: [{ user: creatorId }],
        });

        await competition.populate("createdBy", "name email profile_picture");
        await competition.populate("players.user", "name email profile_picture");

        res.status(201).json({
            success: true,
            message: `Competition created! ${
                Number(numberOfPlayers) === 2
                    ? "Share the competition ID with your friend to join."
                    : "Waiting for players to join from the competition list."
            }`,
            competition,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ═══════════════════════════════════════════
// POST /competitions/:id/join
// ═══════════════════════════════════════════
exports.joinCompetition = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid competition ID" });
        }

        const competition = await Competition.findById(id);
        if (!competition) {
            return res.status(404).json({ success: false, message: "Competition not found" });
        }

        if (competition.status !== "pending") {
            return res.status(400).json({
                success: false,
                message: "This competition is no longer accepting players",
            });
        }

        // Check if already joined
        const alreadyJoined = competition.players.some(
            (p) => p.user.toString() === userId
        );
        if (alreadyJoined) {
            return res.status(400).json({
                success: false,
                message: "You have already joined this competition",
            });
        }

        // Check if competition is already full
        if (competition.players.length >= competition.numberOfPlayers) {
            return res.status(400).json({
                success: false,
                message: "This competition is already full",
            });
        }

        // Check if user already has a pending/active competition
        const existingCompetition = await Competition.findOne({
            _id: { $ne: competition._id },
            "players.user": userId,
            status: { $in: ["pending", "active"] },
        });
        if (existingCompetition) {
            return res.status(400).json({
                success: false,
                message: "You already have an active or pending competition",
            });
        }

        // Add user to players
        competition.players.push({ user: userId });

        // If competition is now full, activate it
        if (competition.players.length === competition.numberOfPlayers) {
            await competition.save(); // save first so activateFullCompetition can read all players
            await activateFullCompetition(competition);

            await competition.populate("createdBy", "name email profile_picture");
            await competition.populate("players.user", "name email profile_picture");

            return res.status(200).json({
                success: true,
                message: `Competition is now full! All ${competition.numberOfPlayers} players joined. Competition starts on ${competition.startDate.toISOString().split("T")[0]}.`,
                competition,
            });
        }

        await competition.save();
        await competition.populate("createdBy", "name email profile_picture");
        await competition.populate("players.user", "name email profile_picture");

        res.status(200).json({
            success: true,
            message: `Joined successfully! ${competition.players.length}/${competition.numberOfPlayers} players.`,
            competition,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ═══════════════════════════════════════════
// GET /competitions/list
// Lists pending competitions with open slots (for 4-player discovery)
// ═══════════════════════════════════════════
exports.listAvailableCompetitions = async (req, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Find pending competitions that are NOT full and user has NOT joined
        const competitions = await Competition.find({
            status: "pending",
            "players.user": { $ne: userId },
            $expr: { $lt: [{ $size: "$players" }, "$numberOfPlayers"] },
        })
            .populate("createdBy", "name email profile_picture")
            .populate("players.user", "name email profile_picture")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Competition.countDocuments({
            status: "pending",
            "players.user": { $ne: userId },
            $expr: { $lt: [{ $size: "$players" }, "$numberOfPlayers"] },
        });

        res.status(200).json({
            success: true,
            competitions,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit)),
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ═══════════════════════════════════════════
// GET /competitions/my
// Get current user's competitions (pending, active, completed)
// ═══════════════════════════════════════════
exports.getMyCompetitions = async (req, res) => {
    try {
        const userId = req.user.id;
        const { status } = req.query; // optional filter: pending, active, completed

        const filter = { "players.user": userId };
        if (status) filter.status = status;

        const competitions = await Competition.find(filter)
            .populate("createdBy", "name email profile_picture")
            .populate("players.user", "name email profile_picture")
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, competitions });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ═══════════════════════════════════════════
// GET /competitions/active
// Check if user is in an active competition right now.
// Returns the active competition (with boardSize) or null.
// App uses this to decide: show competition board vs personal board.
// ═══════════════════════════════════════════
exports.getActiveCompetition = async (req, res) => {
    try {
        const userId = req.user.id;
        const now = new Date();

        // Find competition where user is a player, status = active, and within date range
        let competition = await Competition.findOne({
            "players.user": userId,
            status: "active",
            startDate: { $lte: now },
            endDate: { $gte: now },
        })
            .populate("createdBy", "name email profile_picture")
            .populate("players.user", "name email profile_picture");

        if (!competition) {
            // Also check: competition is pending but full, and startDate has arrived → auto-activate
            competition = await Competition.findOne({
                "players.user": userId,
                status: "pending",
                startDate: { $lte: now },
                $expr: { $eq: [{ $size: "$players" }, "$numberOfPlayers"] },
            });

            if (competition) {
                competition.status = "active";
                await competition.save();
                await competition.populate("createdBy", "name email profile_picture");
                await competition.populate("players.user", "name email profile_picture");
            }
        }

        // Auto-complete if endDate has passed
        if (competition && competition.endDate && now > competition.endDate) {
            competition.status = "completed";
            await competition.save();
            competition = null;
        }

        if (!competition) {
            return res.status(200).json({
                success: true,
                hasActiveCompetition: false,
                competition: null,
            });
        }

        // Find this user's board in the competition
        const playerEntry = competition.players.find(
            (p) => p.user._id.toString() === userId
        );

        let boardProgress = null;
        if (playerEntry && playerEntry.board) {
            const board = await Board.findById(playerEntry.board).select(
                "days isCompleted boardSize"
            );
            if (board) {
                const totalDays = board.days.length;
                const smokedCount = board.days.filter((d) => d.smoked === true).length;
                const cleanCount = board.days.filter((d) => d.smoked === false).length;
                const markedCount = board.days.filter((d) => d.smoked !== null).length;

                boardProgress = {
                    _id: board._id,
                    boardSize: board.boardSize,
                    isCompleted: board.isCompleted,
                    totalDays,
                    markedDays: markedCount,
                    smokedDays: smokedCount,
                    cleanDays: cleanCount,
                    progressPercent: Math.round((markedCount / totalDays) * 100),
                    days: board.days,
                };
            }
        }

        res.status(200).json({
            success: true,
            hasActiveCompetition: true,
            competition: {
                _id: competition._id,
                numberOfPlayers: competition.numberOfPlayers,
                days: competition.days,
                boardSize: competition.boardSize, // cigarettes per day for competition
                startDate: competition.startDate,
                endDate: competition.endDate,
                status: competition.status,
                createdBy: competition.createdBy,
                players: competition.players,
                createdAt: competition.createdAt,
            },
            myBoard: boardProgress,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ═══════════════════════════════════════════
// GET /competitions/:id
// Get competition details with all players' progress
// ═══════════════════════════════════════════
exports.getCompetition = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid competition ID" });
        }

        const competition = await Competition.findById(id)
            .populate("createdBy", "name email profile_picture")
            .populate("players.user", "name email profile_picture");

        if (!competition) {
            return res.status(404).json({ success: false, message: "Competition not found" });
        }

        // Auto-update status if needed
        const now = new Date();
        if (
            competition.status === "pending" &&
            competition.players.length === competition.numberOfPlayers &&
            now >= competition.startDate
        ) {
            competition.status = "active";
            await competition.save();
        }
        if (competition.status === "active" && competition.endDate && now > competition.endDate) {
            competition.status = "completed";
            await competition.save();
        }

        // Build player progress (only if boards are assigned)
        const playersProgress = await Promise.all(
            competition.players.map(async (p) => {
                if (!p.board) {
                    return { user: p.user, board: null };
                }
                const board = await Board.findById(p.board).select("days isCompleted boardSize");
                if (!board) return { user: p.user, board: null };

                const totalDays = board.days.length;
                const smokedCount = board.days.filter((d) => d.smoked === true).length;
                const cleanCount = board.days.filter((d) => d.smoked === false).length;
                const markedCount = board.days.filter((d) => d.smoked !== null).length;

                return {
                    user: p.user,
                    board: {
                        _id: board._id,
                        boardSize: board.boardSize,
                        isCompleted: board.isCompleted,
                        totalDays,
                        markedDays: markedCount,
                        smokedDays: smokedCount,
                        cleanDays: cleanCount,
                        progressPercent: Math.round((markedCount / totalDays) * 100),
                        days: board.days,
                    },
                };
            })
        );

        res.status(200).json({
            success: true,
            competition: {
                _id: competition._id,
                numberOfPlayers: competition.numberOfPlayers,
                days: competition.days,
                boardSize: competition.boardSize,
                startDate: competition.startDate,
                endDate: competition.endDate,
                status: competition.status,
                createdBy: competition.createdBy,
                createdAt: competition.createdAt,
                slotsRemaining: competition.numberOfPlayers - competition.players.length,
                players: playersProgress,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ═══════════════════════════════════════════
// DELETE /competitions/:id/cancel
// Only the creator can cancel a pending competition
// ═══════════════════════════════════════════
exports.cancelCompetition = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid competition ID" });
        }

        const competition = await Competition.findById(id);
        if (!competition) {
            return res.status(404).json({ success: false, message: "Competition not found" });
        }

        if (competition.createdBy.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: "Only the creator can cancel a competition",
            });
        }

        if (competition.status !== "pending") {
            return res.status(400).json({
                success: false,
                message: "Only pending competitions can be cancelled",
            });
        }

        competition.status = "cancelled";
        await competition.save();

        // Notify other players (if any joined before cancellation)
        const otherPlayerIds = competition.players
            .filter((p) => p.user.toString() !== userId)
            .map((p) => p.user.toString());

        if (otherPlayerIds.length > 0) {
            await sendNotificationToUsers(
                otherPlayerIds,
                "Competition Cancelled",
                "A competition you joined has been cancelled by the creator.",
                {
                    type: "competition_cancelled",
                    competitionId: competition._id.toString(),
                }
            );
        }

        res.status(200).json({
            success: true,
            message: "Competition cancelled successfully",
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
