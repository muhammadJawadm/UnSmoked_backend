const Board = require("../models/Board");
const DailyBoard = require("../models/DailyBoard");
const MonthlyBoard = require("../models/MonthlyBoard");
const UserOverview = require("../models/UserOverview");
const User = require("../models/User");
const Competition = require("../models/Competition");

// ─── Constants ───
const LIFE_REGAINED_PER_CIGARETTE = 11; // minutes of life regained per cigarette avoided

/**
 * Helper: calculate cost per cigarette from user's profile
 */
const getCostPerCigarette = (user) => {
    if (!user.cost || !user.amount_of_cigarettes_per_pack) return 0;
    if (user.per === "cigarette") return user.cost;
    // per === "pack"
    return user.cost / user.amount_of_cigarettes_per_pack;
};

/**
 * Helper: get today's date at midnight UTC
 */
const getTodayDate = () => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

/**
 * Helper: get today's day number (day of the month in UTC: 1-31)
 */
const getDayNumber = () => {
    return new Date().getUTCDate();
};

/**
 * Helper: recalculate daily board stats from smokes array
 */
const recalculateDailyStats = (dailyBoard, costPerCigarette) => {
    const avoided = dailyBoard.smokes.filter((s) => s === "unsmoked").length;
    const smoked = dailyBoard.smokes.filter((s) => s === "smoked").length;

    dailyBoard.cigarettesAvoided = avoided;
    dailyBoard.cigarettesSmoked = smoked;
    dailyBoard.lifeRegained = avoided * LIFE_REGAINED_PER_CIGARETTE;
    dailyBoard.moneySaved = parseFloat((avoided * costPerCigarette).toFixed(2));
};

/**
 * Helper: recalculate monthly board totals from all its daily boards
 */
const recalculateMonthlyStats = async (monthlyBoard) => {
    const dailyBoards = await DailyBoard.find({
        _id: { $in: monthlyBoard.dailyBoards },
    });

    monthlyBoard.totalCigarettesAvoided = dailyBoards.reduce((sum, db) => sum + db.cigarettesAvoided, 0);
    monthlyBoard.totalCigarettesSmoked = dailyBoards.reduce((sum, db) => sum + db.cigarettesSmoked, 0);
    monthlyBoard.totalLifeRegained = dailyBoards.reduce((sum, db) => sum + db.lifeRegained, 0);
    monthlyBoard.totalMoneySaved = parseFloat(dailyBoards.reduce((sum, db) => sum + db.moneySaved, 0).toFixed(2));
};

/**
 * Helper: update user overview from daily board & monthly board data
 */
const updateOverview = async (userId, dailyBoard, monthlyBoard) => {
    let overview = await UserOverview.findOne({ userId });
    if (!overview) {
        overview = new UserOverview({ userId });
    }

    // Daily stats
    overview.dailyCigarettesAvoided = dailyBoard.cigarettesAvoided;
    overview.dailyLifeRegained = dailyBoard.lifeRegained;
    overview.dailyMoneySaved = dailyBoard.moneySaved;
    overview.dailyDate = dailyBoard.date;

    // Monthly stats
    overview.monthlyCigarettesAvoided = monthlyBoard.totalCigarettesAvoided;
    overview.monthlyLifeRegained = monthlyBoard.totalLifeRegained;
    overview.monthlyMoneySaved = monthlyBoard.totalMoneySaved;
    overview.monthlyMonth = monthlyBoard.month;
    overview.monthlyYear = monthlyBoard.year;

    // Lifetime totals (sum all monthly boards)
    const allMonthlyBoards = await MonthlyBoard.find({ userId });
    overview.totalCigarettesAvoided = allMonthlyBoards.reduce((sum, mb) => sum + mb.totalCigarettesAvoided, 0);
    overview.totalLifeRegained = allMonthlyBoards.reduce((sum, mb) => sum + mb.totalLifeRegained, 0);
    overview.totalMoneySaved = parseFloat(allMonthlyBoards.reduce((sum, mb) => sum + mb.totalMoneySaved, 0).toFixed(2));

    // Health indicators based on total avoided
    if (overview.totalCigarettesAvoided >= 500) {
        overview.lungsHealth = "Excellent";
        overview.overallHealth = "Excellent";
    } else if (overview.totalCigarettesAvoided >= 200) {
        overview.lungsHealth = "Healthy";
        overview.overallHealth = "Improved";
    } else if (overview.totalCigarettesAvoided >= 50) {
        overview.lungsHealth = "Improving";
        overview.overallHealth = "Improving";
    } else {
        overview.lungsHealth = "Fair";
        overview.overallHealth = "Fair";
    }

    await overview.save();
    return overview;
};

/**
 * Helper: ensure today's daily board exists, create if not
 */
const ensureTodayBoard = async (userId) => {
    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");

    const today = getTodayDate();
    const cigarettesPerDay = user.cigarettes_per_day || 0;

    if (cigarettesPerDay <= 0) {
        throw new Error("Please complete your profile with cigarettes per day first");
    }

    // Check if today's board already exists
    let dailyBoard = await DailyBoard.findOne({ userId, date: today });

    if (!dailyBoard) {
        // Calculate sequential day number (count existing boards + 1)
        const existingBoardsCount = await DailyBoard.countDocuments({ userId });
        const dayNumber = existingBoardsCount + 1;

        // Create smokes array with nulls (unlogged)
        const smokes = new Array(cigarettesPerDay).fill(null);

        dailyBoard = await DailyBoard.create({
            userId,
            day: dayNumber,
            date: today,
            smokes,
        });

        // Ensure monthly board exists and add this daily board
        const month = today.getUTCMonth() + 1;
        const year = today.getUTCFullYear();
        const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

        let monthlyBoard = await MonthlyBoard.findOne({ userId, month, year });
        if (!monthlyBoard) {
            monthlyBoard = await MonthlyBoard.create({
                userId,
                month,
                year,
                boardSize: daysInMonth,
                dailyBoards: [dailyBoard._id],
            });
        } else {
            monthlyBoard.dailyBoards.push(dailyBoard._id);
            await monthlyBoard.save();
        }
    }

    return { dailyBoard, user };
};

// ═══════════════════════════════════════════
// NEW BOARD SYSTEM APIs
// ═══════════════════════════════════════════

// ─── API: Get Today's Board ───
exports.getTodayBoard = async (req, res) => {
    try {
        const userId = req.user.id;
        const { dailyBoard, user } = await ensureTodayBoard(userId);

        const today = getTodayDate();
        const month = today.getMonth() + 1;
        const year = today.getFullYear();

        const monthlyBoard = await MonthlyBoard.findOne({ userId, month, year });

        res.status(200).json({
            success: true,
            dailyBoard,
            monthlyStats: monthlyBoard
                ? {
                    totalCigarettesAvoided: monthlyBoard.totalCigarettesAvoided,
                    totalCigarettesSmoked: monthlyBoard.totalCigarettesSmoked,
                    totalLifeRegained: monthlyBoard.totalLifeRegained,
                    totalMoneySaved: monthlyBoard.totalMoneySaved,
                }
                : null,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── API: Mark a Smoke Slot ───
// Body: { index: 0, status: "smoked" | "unsmoked" }
exports.markSlot = async (req, res) => {
    try {
        const userId = req.user.id;
        const { index, status } = req.body;

        if (typeof index !== "number" || index < 0) {
            return res.status(400).json({ success: false, message: "Valid slot index is required" });
        }
        if (!["smoked", "unsmoked"].includes(status)) {
            return res.status(400).json({ success: false, message: "Status must be 'smoked' or 'unsmoked'" });
        }

        const { dailyBoard, user } = await ensureTodayBoard(userId);

        if (index >= dailyBoard.smokes.length) {
            return res.status(400).json({ success: false, message: `Index out of range. Max index: ${dailyBoard.smokes.length - 1}` });
        }

        // Update the slot
        dailyBoard.smokes[index] = status;
        dailyBoard.markModified("smokes");

        // Recalculate daily stats
        const costPerCigarette = getCostPerCigarette(user);
        recalculateDailyStats(dailyBoard, costPerCigarette);

        await dailyBoard.save();

        // Update monthly board stats
        const today = getTodayDate();
        const month = today.getMonth() + 1;
        const year = today.getFullYear();

        const monthlyBoard = await MonthlyBoard.findOne({ userId, month, year });
        if (monthlyBoard) {
            await recalculateMonthlyStats(monthlyBoard);
            await monthlyBoard.save();

            // Update overview
            await updateOverview(userId, dailyBoard, monthlyBoard);
        }

        res.status(200).json({
            success: true,
            message: "Slot updated successfully",
            dailyBoard,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── API: Get Monthly Board (all daily boards for a month) ───
// Query: ?month=3&year=2026
exports.getMonthlyBoard = async (req, res) => {
    try {
        const userId = req.user.id;
        const month = parseInt(req.query.month) || new Date().getUTCMonth() + 1;
        const year = parseInt(req.query.year) || new Date().getUTCFullYear();

        const monthlyBoard = await MonthlyBoard.findOne({ userId, month, year }).populate("dailyBoards");

        if (!monthlyBoard) {
            return res.status(404).json({ success: false, message: "No board found for this month" });
        }

        res.status(200).json({
            success: true,
            monthlyBoard,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── API: Get Today's Impact ───
exports.getTodayImpact = async (req, res) => {
    try {
        const userId = req.user.id;
        const today = getTodayDate();

        const dailyBoard = await DailyBoard.findOne({ userId, date: today });

        if (!dailyBoard) {
            return res.status(200).json({
                success: true,
                impact: {
                    cigarettesAvoided: 0,
                    lifeRegained: 0,
                    moneySaved: 0,
                    cigarettesSmoked: 0,
                },
            });
        }

        res.status(200).json({
            success: true,
            impact: {
                cigarettesAvoided: dailyBoard.cigarettesAvoided,
                lifeRegained: dailyBoard.lifeRegained,
                moneySaved: dailyBoard.moneySaved,
                cigarettesSmoked: dailyBoard.cigarettesSmoked,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── API: Get User Overview (daily + monthly + lifetime stats) ───
exports.getUserOverviewStats = async (req, res) => {
    try {
        const userId = req.user.id;

        let overview = await UserOverview.findOne({ userId });
        if (!overview) {
            overview = {
                dailyCigarettesAvoided: 0,
                dailyLifeRegained: 0,
                dailyMoneySaved: 0,
                monthlyCigarettesAvoided: 0,
                monthlyLifeRegained: 0,
                monthlyMoneySaved: 0,
                totalCigarettesAvoided: 0,
                totalLifeRegained: 0,
                totalMoneySaved: 0,
                lungsHealth: "Fair",
                overallHealth: "Fair",
            };
        }

        res.status(200).json({
            success: true,
            overview: {
                daily: {
                    cigarettesAvoided: overview.dailyCigarettesAvoided,
                    lifeRegained: overview.dailyLifeRegained,
                    moneySaved: overview.dailyMoneySaved,
                },
                monthly: {
                    cigarettesAvoided: overview.monthlyCigarettesAvoided,
                    lifeRegained: overview.monthlyLifeRegained,
                    moneySaved: overview.monthlyMoneySaved,
                },
                lifetime: {
                    cigarettesAvoided: overview.totalCigarettesAvoided,
                    lifeRegained: overview.totalLifeRegained,
                    moneySaved: overview.totalMoneySaved,
                },
                lungsHealth: overview.lungsHealth,
                overallHealth: overview.overallHealth,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ═══════════════════════════════════════════
// LEGACY BOARD APIs (for competition boards)
// ═══════════════════════════════════════════
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
            return res.status(400).json({ success: false, message: "valid smoked status is required" });
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
