const Board = require("../models/Board");
const Competition = require("../models/Competition");

// ─── createBoard disabled — boards are created via POST /competitions/create only ───
// exports.createBoard = async (req, res) => {
//     try {
//         const userId = req.user.id;
//         const { boardSize } = req.body;
//         if (!boardSize || boardSize <= 0) {
//             return res.status(400).json({ message: "valid Board size is required" });
//         }
//         const existingBoard = await Board.findOne({ userId });
//         if (existingBoard) {
//             return res.status(400).json({ success: false, message: "Board already exists" });
//         }
//         const days = [];
//         for (let i = 1; i <= boardSize; i++) {
//             days.push({ day: i, smoked: null, date: new Date(Date.now() + (i - 1) * 24 * 60 * 60 * 1000) });
//         }
//         const board = await Board.create({ userId, boardSize, days });
//         res.status(201).json({ success: true, message: "Board created successfully", board });
//     } catch (error) {
//         res.status(500).json({ success: false, message: error.message });
//     }
// }

exports.getBoard = async (req, res) => {
    try {
        const userId = req.user.id;
        const board = await Board.findOne({ userId });
        if (!board) {
            return res.status(404).json({ success: false, message: "Board not found" });
        }
        res.status(200).json({ success: true, message: "Board fetched successfully", board });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}

exports.markTodayStatus = async (req, res) => {
    try {
        const userId = req.user.id;
        const { smoked } = req.body;

        if (typeof smoked !== "boolean") {
            return res.status(400).json({ message: "valid smoked status is required" });
        }

        const board = await Board.findOne({ userId });
        if (!board) {
            return res.status(404).json({ success: false, message: "Board not found" });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayDay = board.days.find(day => {
            const dayDate = new Date(day.date);
            dayDate.setHours(0, 0, 0, 0);
            return dayDate.getTime() === today.getTime();
        });

        if (!todayDay) {
            return res.status(404).json({ success: false, message: "No board entry found for today" });
        }

        if (todayDay.smoked !== null) {
            return res.status(404).json({ success: false, message: "Day already marked" });
        }

        todayDay.smoked = smoked;
        const allmarked = board.days.every(day => day.smoked !== null);
        if (allmarked) {
            board.isCompleted = true;
        }

        await board.save();

        // Auto-complete competition if board belongs to one and all boards are done
        if (board.isCompleted && board.competition) {
            const competition = await Competition.findById(board.competition);
            if (competition && competition.status === "active") {
                const boardIds = competition.players.map((p) => p.board);
                const allBoards = await Board.find({ _id: { $in: boardIds } });
                const allDone = allBoards.every((b) => b.isCompleted);
                if (allDone) {
                    competition.status = "completed";
                    await competition.save();
                }
            }
        }

        res.status(200).json({ success: true, message: "Board updated successfully", board });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
}
