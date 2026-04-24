const Board = require("../models/Board");
const DailyBoard = require("../models/DailyBoard");
const MonthlyBoard = require("../models/MonthlyBoard");
const UserOverview = require("../models/UserOverview");
const User = require("../models/User");
const Competition = require("../models/Competition");
const UserProgress = require("../models/UserProgress");
const Badges = require("../models/Badges");
const ChallengeDailyBoard = require("../models/ChallengeDailyBoard");
const ChallengeParticipant = require("../models/ChallengeParticipant");
const Challenge = require("../models/Challenges");

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

        const allMonthlyBoards = await MonthlyBoard.find({ userId });

        const lifetimeStats = {
            totalCigarettesAvoided: allMonthlyBoards.reduce((sum, mb) => sum + mb.totalCigarettesAvoided, 0),
            totalCigarettesSmoked: allMonthlyBoards.reduce((sum, mb) => sum + mb.totalCigarettesSmoked, 0),
            totalLifeRegained: allMonthlyBoards.reduce((sum, mb) => sum + mb.totalLifeRegained, 0),
            totalMoneySaved: parseFloat(allMonthlyBoards.reduce((sum, mb) => sum + mb.totalMoneySaved, 0).toFixed(2)),
        };

        // ── Check if user has an active challenge to hint the frontend ────
        const myParticipations = await ChallengeParticipant.find({
            userId,
            inviteStatus: "accepted",
        }).select("challengeId");

        let activeChallenge = null;
        if (myParticipations.length) {
            const challengeIds = myParticipations.map((p) => p.challengeId);
            activeChallenge = await Challenge.findOne({
                _id: { $in: challengeIds },
                status: "active",
                moderationStatus: "ok",
            }).select("_id title durationDays boardSize endsAt startAt");
        }

        res.status(200).json({
            success: true,
            dailyBoard,
            lifetimeStats,
            activeChallenge: activeChallenge || null,
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

        // ── Update personal daily board slot ────────────────────────────────
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

        const allMonthlyBoards = await MonthlyBoard.find({ userId });
        const lifetimeStats = {
            totalCigarettesAvoided: allMonthlyBoards.reduce((sum, mb) => sum + mb.totalCigarettesAvoided, 0),
            totalCigarettesSmoked: allMonthlyBoards.reduce((sum, mb) => sum + mb.totalCigarettesSmoked, 0),
            totalLifeRegained: allMonthlyBoards.reduce((sum, mb) => sum + mb.totalLifeRegained, 0),
            totalMoneySaved: parseFloat(allMonthlyBoards.reduce((sum, mb) => sum + mb.totalMoneySaved, 0).toFixed(2)),
        };

        // ── Also update ALL active challenge boards for this user ────────────
        const myParticipations = await ChallengeParticipant.find({
            userId,
            inviteStatus: "accepted",
        }).select("challengeId");

        let updatedChallengeBoards = [];

        if (myParticipations.length) {
            const challengeIds = myParticipations.map((p) => p.challengeId);
            const activeChallenges = await Challenge.find({
                _id: { $in: challengeIds },
                status: "active",
                moderationStatus: "ok",
            }).select("_id");

            for (const ch of activeChallenges) {
                const todayUTC = new Date(Date.UTC(
                    new Date().getUTCFullYear(),
                    new Date().getUTCMonth(),
                    new Date().getUTCDate()
                ));

                // Find or create today's challenge board
                let challengeBoard = await ChallengeDailyBoard.findOne({
                    challengeId: ch._id,
                    userId,
                    date: todayUTC,
                });

                if (!challengeBoard) {
                    // Auto-create if missing (e.g. challenge started earlier today)
                    const existingCount = await ChallengeDailyBoard.countDocuments({
                        challengeId: ch._id,
                        userId,
                    });
                    const smokes = new Array(user.cigarettes_per_day || 1).fill(null);
                    challengeBoard = await ChallengeDailyBoard.create({
                        challengeId: ch._id,
                        userId,
                        day: existingCount + 1,
                        date: todayUTC,
                        smokes,
                    });
                }

                if (index >= challengeBoard.smokes.length) continue; // safety

                challengeBoard.smokes[index] = status;
                challengeBoard.markModified("smokes");
                recalculateDailyStats(challengeBoard, costPerCigarette);
                await challengeBoard.save();

                // Roll up to participant's challengeBoardStats
                const allDaysOfChallenge = await ChallengeDailyBoard.find({
                    challengeId: ch._id,
                    userId,
                });

                const totalAvoided = allDaysOfChallenge.reduce((s, d) => s + d.cigarettesAvoided, 0);
                const totalSmoked  = allDaysOfChallenge.reduce((s, d) => s + d.cigarettesSmoked, 0);
                const daysFilled   = allDaysOfChallenge.filter(
                    (d) => d.smokes.some((slot) => slot !== null)
                ).length;

                await ChallengeParticipant.findOneAndUpdate(
                    { challengeId: ch._id, userId },
                    {
                        "challengeBoardStats.totalCigarettesAvoided": totalAvoided,
                        "challengeBoardStats.totalCigarettesSmoked":  totalSmoked,
                        "challengeBoardStats.totalDaysFilled":        daysFilled,
                    }
                );

                updatedChallengeBoards.push({
                    challengeId: ch._id,
                    challengeBoard,
                });
            }
        }

        res.status(200).json({
            success: true,
            message: "Slot updated successfully",
            dailyBoard,
            lifetimeStats,
            updatedChallengeBoards,
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
// STATS API — day / week / year
// GET /boards/stats?type=day|week|year
// ═══════════════════════════════════════════

exports.getStats = async (req, res) => {
    try {
        const userId = req.user.id;
        const type = (req.query.type || "day").toLowerCase();

        if (!["day", "week", "year"].includes(type)) {
            return res.status(400).json({ success: false, message: "type must be 'day', 'week', or 'year'" });
        }

        const now = new Date();
        const todayUTC = getTodayDate();

        // ─── DAY: hourly breakdown of today ───
        if (type === "day") {
            const dailyBoard = await DailyBoard.findOne({ userId, date: todayUTC });

            if (!dailyBoard) {
                return res.status(200).json({
                    success: true,
                    type: "day",
                    date: todayUTC,
                    hours: [],
                    total: { cigarettesAvoided: 0, cigarettesSmoked: 0, totalCigarettes: 0 },
                });
            }

            // Distribute cigarette slots evenly across 24 hours
            // Each slot index maps to: hour = floor(index / totalSlots * 24)
            const totalSlots = dailyBoard.smokes.length;
            const hourlyMap = {};

            dailyBoard.smokes.forEach((status, index) => {
                const hour = Math.floor((index / totalSlots) * 24);
                if (!hourlyMap[hour]) {
                    hourlyMap[hour] = { hour, cigarettesAvoided: 0, cigarettesSmoked: 0, totalCigarettes: 0 };
                }
                if (status === "unsmoked") {
                    hourlyMap[hour].cigarettesAvoided += 1;
                    hourlyMap[hour].totalCigarettes += 1;
                } else if (status === "smoked") {
                    hourlyMap[hour].cigarettesSmoked += 1;
                    hourlyMap[hour].totalCigarettes += 1;
                }
            });

            // Return all 24 hours (zero-fill missing ones)
            const hours = Array.from({ length: 24 }, (_, i) => {
                return hourlyMap[i] || { hour: i, cigarettesAvoided: 0, cigarettesSmoked: 0, totalCigarettes: 0 };
            });

            return res.status(200).json({
                success: true,
                type: "day",
                date: todayUTC,
                hours,
                total: {
                    cigarettesAvoided: dailyBoard.cigarettesAvoided,
                    cigarettesSmoked: dailyBoard.cigarettesSmoked,
                    totalCigarettes: dailyBoard.cigarettesAvoided + dailyBoard.cigarettesSmoked,
                },
            });
        }

        // ─── WEEK: each of the last 7 days ───
        if (type === "week") {
            const days = [];
            for (let i = 6; i >= 0; i--) {
                const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
                days.push(d);
            }

            const dailyBoards = await DailyBoard.find({
                userId,
                date: { $gte: days[0], $lte: days[days.length - 1] },
            });

            const boardByDate = {};
            dailyBoards.forEach((db) => {
                const key = db.date.toISOString().split("T")[0];
                boardByDate[key] = db;
            });

            const weekData = days.map((d) => {
                const key = d.toISOString().split("T")[0];
                const db = boardByDate[key];
                return {
                    date: d,
                    dayName: d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
                    cigarettesAvoided: db ? db.cigarettesAvoided : 0,
                    cigarettesSmoked: db ? db.cigarettesSmoked : 0,
                    totalCigarettes: db ? db.cigarettesAvoided + db.cigarettesSmoked : 0,
                };
            });

            const weekTotal = weekData.reduce(
                (acc, d) => {
                    acc.cigarettesAvoided += d.cigarettesAvoided;
                    acc.cigarettesSmoked += d.cigarettesSmoked;
                    acc.totalCigarettes += d.totalCigarettes;
                    return acc;
                },
                { cigarettesAvoided: 0, cigarettesSmoked: 0, totalCigarettes: 0 }
            );

            return res.status(200).json({
                success: true,
                type: "week",
                days: weekData,
                total: weekTotal,
            });
        }

        // ─── YEAR: each month of the current year ───
        if (type === "year") {
            const year = now.getUTCFullYear();

            const monthlyBoards = await MonthlyBoard.find({ userId, year });

            const boardByMonth = {};
            monthlyBoards.forEach((mb) => {
                boardByMonth[mb.month] = mb;
            });

            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

            const monthsData = Array.from({ length: 12 }, (_, i) => {
                const month = i + 1;
                const mb = boardByMonth[month];
                return {
                    month,
                    monthName: monthNames[i],
                    cigarettesAvoided: mb ? mb.totalCigarettesAvoided : 0,
                    cigarettesSmoked: mb ? mb.totalCigarettesSmoked : 0,
                    totalCigarettes: mb ? mb.totalCigarettesAvoided + mb.totalCigarettesSmoked : 0,
                };
            });

            const yearTotal = monthsData.reduce(
                (acc, m) => {
                    acc.cigarettesAvoided += m.cigarettesAvoided;
                    acc.cigarettesSmoked += m.cigarettesSmoked;
                    acc.totalCigarettes += m.totalCigarettes;
                    return acc;
                },
                { cigarettesAvoided: 0, cigarettesSmoked: 0, totalCigarettes: 0 }
            );

            return res.status(200).json({
                success: true,
                type: "year",
                year,
                months: monthsData,
                total: yearTotal,
            });
        }

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ═══════════════════════════════════════════
// LEADERBOARD API
// GET /boards/leaderboard
// ═══════════════════════════════════════════

exports.getLeaderboard = async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);

        // Fetch all active users
        const users = await User.find({ is_active: true, role: "user" }).select("_id name profile_picture").lean();

        const userIds = users.map((u) => u._id);

        // Fetch overviews, progress, and latest badge for all users in parallel
        const [overviews, progresses, badges] = await Promise.all([
            UserOverview.find({ userId: { $in: userIds } }).lean(),
            UserProgress.find({ userId: { $in: userIds } }).lean(),
            Badges.find({ userId: { $in: userIds } })
                .sort({ earnedAt: -1 })
                .populate("badge", "title imageUrl type")
                .lean(),
        ]);

        // Index by userId string for O(1) lookup
        const overviewMap = {};
        overviews.forEach((o) => { overviewMap[o.userId.toString()] = o; });

        const progressMap = {};
        progresses.forEach((p) => { progressMap[p.userId.toString()] = p; });

        // Keep only the most recently earned badge per user
        const badgeMap = {};
        badges.forEach((b) => {
            const key = b.userId.toString();
            if (!badgeMap[key]) badgeMap[key] = b; // already sorted by earnedAt desc
        });

        // Build leaderboard entries
        const leaderboard = users.map((user) => {
            const key = user._id.toString();
            const overview = overviewMap[key];
            const progress = progressMap[key];
            const latestBadge = badgeMap[key];

            return {
                userId: user._id,
                name: user.name,
                profilePicture: user.profile_picture || null,
                cigarettesAvoided: overview ? overview.totalCigarettesAvoided : 0,
                lifeRegained: overview ? overview.totalLifeRegained : 0,   // in minutes
                level: progress ? progress.level : 1,
                badge: latestBadge
                    ? {
                        title: latestBadge.badge.title,
                        imageUrl: latestBadge.badge.imageUrl,
                        type: latestBadge.badge.type,
                        earnedAt: latestBadge.earnedAt,
                    }
                    : null,
            };
        });

        // Sort by cigarettes avoided descending
        leaderboard.sort((a, b) => b.cigarettesAvoided - a.cigarettesAvoided);

        // Attach rank (based on full sorted list)
        leaderboard.forEach((entry, i) => { entry.rank = i + 1; });

        // Paginate
        const totalItems = leaderboard.length;
        const totalPages = Math.ceil(totalItems / limit);
        const skip = (page - 1) * limit;
        const results = leaderboard.slice(skip, skip + limit);

        res.status(200).json({
            success: true,
            pagination: {
                currentPage: page,
                totalPages,
                totalItems,
                pageSize: limit,
                itemsCount: results.length,
                results,
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

// ═══════════════════════════════════════════════════════════════
// CHALLENGE BOARD APIs
// ═══════════════════════════════════════════════════════════════

/**
 * Helper: Recalculate daily stats on a ChallengeDailyBoard doc (same logic as personal board)
 */
const recalculateChallengeDailyStats = (challengeBoard, costPerCigarette) => {
    const avoided = challengeBoard.smokes.filter((s) => s === "unsmoked").length;
    const smoked  = challengeBoard.smokes.filter((s) => s === "smoked").length;
    challengeBoard.cigarettesAvoided = avoided;
    challengeBoard.cigarettesSmoked  = smoked;
    challengeBoard.lifeRegained      = avoided * LIFE_REGAINED_PER_CIGARETTE;
    challengeBoard.moneySaved        = parseFloat((avoided * costPerCigarette).toFixed(2));
};

// ─── GET /boards/challenge/:challengeId/today ─────────────────────────────────
// Returns today's ChallengeDailyBoard for the requesting user (auto-creates if missing).
exports.getChallengeBoard = async (req, res) => {
    try {
        const userId      = req.user.id;
        const { challengeId } = req.params;

        const challenge = await Challenge.findById(challengeId)
            .populate("createdBy", "name profile_picture")
            .populate("category", "name");
        if (!challenge) {
            return res.status(404).json({ success: false, message: "Challenge not found" });
        }
        if (challenge.status !== "active") {
            return res.status(400).json({
                success: false,
                message: `Challenge is not active (current status: ${challenge.status})`,
            });
        }

        // Verify user is an accepted participant
        const participant = await ChallengeParticipant.findOne({
            challengeId,
            userId,
            inviteStatus: "accepted",
        });
        if (!participant) {
            return res.status(403).json({
                success: false,
                message: "You are not an active participant in this challenge",
            });
        }

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        const todayUTC = new Date(Date.UTC(
            new Date().getUTCFullYear(),
            new Date().getUTCMonth(),
            new Date().getUTCDate()
        ));

        let challengeBoard = await ChallengeDailyBoard.findOne({
            challengeId,
            userId,
            date: todayUTC,
        });

        if (!challengeBoard) {
            const existingCount = await ChallengeDailyBoard.countDocuments({ challengeId, userId });
            const cigarettesPerDay = (user.cigarettes_per_day > 0) ? user.cigarettes_per_day : 1;
            const smokes = new Array(cigarettesPerDay).fill(null);
            challengeBoard = await ChallengeDailyBoard.create({
                challengeId,
                userId,
                day: existingCount + 1,
                date: todayUTC,
                smokes,
            });
        }

        // Compute time left
        const timeLeftMs = challenge.endsAt
            ? Math.max(0, new Date(challenge.endsAt) - new Date())
            : null;

        // Day number within challenge (days since startAt)
        const dayNumber = challenge.startAt
            ? Math.floor((todayUTC - new Date(challenge.startAt)) / (24 * 60 * 60 * 1000)) + 1
            : 1;

        res.status(200).json({
            success: true,
            challenge,
            challengeBoard,
            participant,
            timeLeftMs,
            currentDay: dayNumber,
            totalDays: challenge.durationDays,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── POST /boards/challenge/:challengeId/mark-slot ────────────────────────────
// Mark a slot only on the challenge board (does NOT touch personal board).
// Body: { index: Number, status: "smoked" | "unsmoked" }
exports.markChallengeSlot = async (req, res) => {
    try {
        const userId = req.user.id;
        const { challengeId } = req.params;
        const { index, status } = req.body;

        if (typeof index !== "number" || index < 0) {
            return res.status(400).json({ success: false, message: "Valid slot index is required" });
        }
        if (!["smoked", "unsmoked"].includes(status)) {
            return res.status(400).json({ success: false, message: "Status must be 'smoked' or 'unsmoked'" });
        }

        const challenge = await Challenge.findById(challengeId);
        if (!challenge) {
            return res.status(404).json({ success: false, message: "Challenge not found" });
        }
        if (challenge.status !== "active") {
            return res.status(400).json({
                success: false,
                message: `Challenge is not active (status: ${challenge.status})`,
            });
        }

        const participant = await ChallengeParticipant.findOne({
            challengeId,
            userId,
            inviteStatus: "accepted",
        });
        if (!participant) {
            return res.status(403).json({
                success: false,
                message: "You are not an active participant in this challenge",
            });
        }

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        const costPerCigarette = getCostPerCigarette(user);

        const todayUTC = new Date(Date.UTC(
            new Date().getUTCFullYear(),
            new Date().getUTCMonth(),
            new Date().getUTCDate()
        ));

        let challengeBoard = await ChallengeDailyBoard.findOne({
            challengeId,
            userId,
            date: todayUTC,
        });

        if (!challengeBoard) {
            const existingCount = await ChallengeDailyBoard.countDocuments({ challengeId, userId });
            const cigarettesPerDay = (user.cigarettes_per_day > 0) ? user.cigarettes_per_day : 1;
            const smokes = new Array(cigarettesPerDay).fill(null);
            challengeBoard = await ChallengeDailyBoard.create({
                challengeId,
                userId,
                day: existingCount + 1,
                date: todayUTC,
                smokes,
            });
        }

        if (index >= challengeBoard.smokes.length) {
            return res.status(400).json({
                success: false,
                message: `Index out of range. Max index: ${challengeBoard.smokes.length - 1}`,
            });
        }

        challengeBoard.smokes[index] = status;
        challengeBoard.markModified("smokes");
        recalculateChallengeDailyStats(challengeBoard, costPerCigarette);
        await challengeBoard.save();

        // Roll up aggregate stats to participant record
        const allDaysOfChallenge = await ChallengeDailyBoard.find({ challengeId, userId });

        const totalAvoided = allDaysOfChallenge.reduce((s, d) => s + d.cigarettesAvoided, 0);
        const totalSmoked  = allDaysOfChallenge.reduce((s, d) => s + d.cigarettesSmoked, 0);
        const daysFilled   = allDaysOfChallenge.filter(
            (d) => d.smokes.some((slot) => slot !== null)
        ).length;

        participant.challengeBoardStats = {
            totalCigarettesAvoided: totalAvoided,
            totalCigarettesSmoked:  totalSmoked,
            totalDaysFilled:        daysFilled,
        };
        await participant.save();

        res.status(200).json({
            success: true,
            message: "Challenge slot updated successfully",
            challengeBoard,
            challengeBoardStats: participant.challengeBoardStats,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── GET /boards/challenge/:challengeId/summary ────────────────────────────────
// Returns all ChallengeDailyBoards for this user + standings of all participants.
exports.getChallengeBoardSummary = async (req, res) => {
    try {
        const userId = req.user.id;
        const { challengeId } = req.params;

        const challenge = await Challenge.findById(challengeId)
            .populate("createdBy", "name profile_picture")
            .populate("category", "name")
            .populate("winner", "name profile_picture");
        if (!challenge) {
            return res.status(404).json({ success: false, message: "Challenge not found" });
        }

        // Verify user is a participant
        const myParticipant = await ChallengeParticipant.findOne({
            challengeId,
            userId,
            inviteStatus: "accepted",
        });
        if (!myParticipant) {
            return res.status(403).json({
                success: false,
                message: "You are not a participant in this challenge",
            });
        }

        // All of this user's daily boards for the challenge
        const myBoards = await ChallengeDailyBoard.find({ challengeId, userId }).sort({ day: 1 });

        // All participants with their stats (for standings)
        const allParticipants = await ChallengeParticipant.find({
            challengeId,
            inviteStatus: "accepted",
        })
            .populate("userId", "name profile_picture")
            .sort({ "challengeBoardStats.totalCigarettesAvoided": -1 });

        const standings = allParticipants.map((p, i) => ({
            rank: i + 1,
            user: p.userId,
            challengeBoardStats: p.challengeBoardStats,
            isMe: p.userId._id.toString() === userId,
            xpEarned: p.xpEarned,
        }));

        const timeLeftMs = challenge.endsAt
            ? Math.max(0, new Date(challenge.endsAt) - new Date())
            : null;

        res.status(200).json({
            success: true,
            challenge,
            myBoards,
            myStats: myParticipant.challengeBoardStats,
            standings,
            timeLeftMs,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
