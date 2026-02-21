const Board = require("../models/Board");
const Competition = require("../models/Competition");
const mongoose = require("mongoose");

//  Shared Helper 
// Builds day entries starting from today
const buildDays = (boardSize) => {
    const days = [];
    for (let i = 1; i <= boardSize; i++) {
        days.push({
            day: i,
            smoked: null,
            date: new Date(Date.now() + (i - 1) * 24 * 60 * 60 * 1000),
        });
    }
    return days;
};

//  post /competitions/create 
exports.createCompetitionWithFriend = async (req, res) => {
    try {
        const creatorId = req.user.id;
        const { opponentIds, boardSize } = req.body;

        // opponentIds must be an array of 1 (2-player) or 3 (4-player)
        if (!opponentIds || !Array.isArray(opponentIds) || !boardSize) {
            return res.status(400).json({ success: false, message: "opponentIds (array) and boardSize are required" });
        }

        if (![1, 3].includes(opponentIds.length)) {
            return res.status(400).json({ success: false, message: "opponentIds must contain 1 opponent (2-player) or 3 opponents (4-player)" });
        }

        const validSizes = [7, 14, 30, 60, 90];
        if (!validSizes.includes(Number(boardSize))) {
            return res.status(400).json({ success: false, message: `boardSize must be one of ${validSizes.join(", ")}` });
        }

        // Validate all opponentIds
        for (const id of opponentIds) {
            if (id === creatorId) {
                return res.status(400).json({ success: false, message: "You cannot compete with yourself" });
            }
            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({ success: false, message: `Invalid opponentId: ${id}` });
            }
        }

        // Ensure no duplicate opponents
        const uniqueIds = new Set(opponentIds);
        if (uniqueIds.size !== opponentIds.length) {
            return res.status(400).json({ success: false, message: "Duplicate opponentIds are not allowed" });
        }

        // All participant user IDs (creator first, then opponents)
        const allUserIds = [creatorId, ...opponentIds];
        const days = buildDays(boardSize);

        // Create one board per participant
        const boardDocs = await Board.create(
            allUserIds.map((uid) => ({
                userId: uid,
                boardSize,
                days: days.map((d) => ({ ...d, date: new Date(d.date) })),
            }))
        );

        // Build players array linking each user to their board
        const players = allUserIds.map((uid, i) => ({
            user: uid,
            board: boardDocs[i]._id,
        }));

        const competition = await Competition.create({
            boardSize,
            createdBy: creatorId,
            status: "active",
            players,
        });

        // Link each board back to the competition
        await Promise.all(
            boardDocs.map((b) => {
                b.competition = competition._id;
                return b.save();
            })
        );

        res.status(201).json({
            success: true,
            message: `${allUserIds.length}-player competition created successfully`,
            competition,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};


// get /competitions/:id 
exports.getCompetition = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid competition ID" });
        }

        const competition = await Competition.findById(id)
            .populate("createdBy", "name email")
            .populate("players.user", "name email");

        if (!competition) {
            return res.status(404).json({ success: false, message: "Competition not found" });
        }

        // Only participants can view the competition
        const isParticipant = competition.players.some(
            (p) => p.user._id.toString() === userId
        );
        if (!isParticipant) {
            return res.status(403).json({ success: false, message: "Access denied" });
        }

        // Fetch each player's board progress (read-only)
        const playersProgress = await Promise.all(
            competition.players.map(async (p) => {
                const board = await Board.findById(p.board).select("days isCompleted boardSize");
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
                boardSize: competition.boardSize,
                status: competition.status,
                createdBy: competition.createdBy,
                createdAt: competition.createdAt,
                players: playersProgress,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
