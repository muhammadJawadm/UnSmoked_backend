/**
 * Current smoke-free-day streak.
 *
 * Definition: the number of consecutive PAST local calendar days (midnight
 * to midnight, in the user's own timezone) that are each PROVEN smoke-free —
 * meaning that day's personal board has zero "smoked" marks AND at least one
 * "unsmoked" mark (the board doesn't need to be fully filled in, just at
 * least one square logged). A day with no board at all, or a board where
 * nothing was ever marked "unsmoked", does NOT count — silence isn't
 * evidence of not smoking, so it breaks the streak exactly like smoking would.
 *
 * Today never counts (it hasn't ended yet), and the streak resets to 0
 * immediately — without waiting for midnight — the moment today's board
 * already has a "smoked" mark.
 *
 * This resets on relapse (or on an untouched day) — it is NOT a lifetime
 * total of smoke-free days. Badges already earned along the way are
 * unaffected (badge assignment is one-way and never revoked), so this only
 * changes the live streak number shown on the profile and leaderboards.
 */

const DailyBoard = require("../models/DailyBoard");
const { getLocalToday } = require("./timezone");

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// A day "counts" only with positive proof: zero smoked AND at least one
// explicit "unsmoked" mark. No board / an untouched board does not qualify.
const dayQualifies = (board) => !!board && board.cigarettesSmoked === 0 && board.cigarettesAvoided > 0;

// Walks backward day-by-day from yesterday, stopping at the first day that
// doesn't qualify (or once past the user's account-creation day).
// `boardsByDate` maps a UTC-midnight-encoded local date's timestamp -> board.
const walkStreak = (today, createdAtLocal, boardsByDate) => {
    let streak = 0;
    let cursor = new Date(today.getTime() - MS_PER_DAY); // yesterday

    while (cursor.getTime() >= createdAtLocal.getTime()) {
        if (!dayQualifies(boardsByDate.get(cursor.getTime()))) break;
        streak += 1;
        cursor = new Date(cursor.getTime() - MS_PER_DAY);
    }
    return streak;
};

/**
 * Current smoke-free-day streak for a single user.
 * @param {String} userId
 * @param {String} timezone - user's IANA timezone (falls back to UTC if invalid)
 * @param {Date} createdAt - user's account creation timestamp
 */
const getSmokeFreeStreak = async (userId, timezone, createdAt) => {
    const today = getLocalToday(timezone);
    const createdAtLocal = getLocalToday(timezone, createdAt);

    const boards = await DailyBoard.find({
        userId,
        challengeId: null,
        date: { $lte: today },
    })
        .select("date cigarettesSmoked cigarettesAvoided")
        .lean();

    const boardsByDate = new Map();
    boards.forEach((b) => boardsByDate.set(b.date.getTime(), b));

    // Already smoked today — instant reset, don't wait for midnight.
    const todayBoard = boardsByDate.get(today.getTime());
    if (todayBoard && todayBoard.cigarettesSmoked > 0) return 0;

    return walkStreak(today, createdAtLocal, boardsByDate);
};

/**
 * Current smoke-free-day streaks for many users at once (leaderboards) —
 * one query for all users' boards instead of one query per user.
 * @param {Array<{_id, timezone, createdAt}>} users
 * @returns {Map<string, number>} userId string -> streak
 */
const getSmokeFreeStreaksBatch = async (users) => {
    if (!users.length) return new Map();

    const userIds = users.map((u) => u._id);

    const boards = await DailyBoard.find({
        userId: { $in: userIds },
        challengeId: null,
    })
        .select("userId date cigarettesSmoked cigarettesAvoided")
        .lean();

    const boardsByUser = new Map();
    boards.forEach((b) => {
        const key = b.userId.toString();
        if (!boardsByUser.has(key)) boardsByUser.set(key, new Map());
        boardsByUser.get(key).set(b.date.getTime(), b);
    });

    const streaks = new Map();
    for (const user of users) {
        const key = user._id.toString();
        const today = getLocalToday(user.timezone);
        const createdAtLocal = getLocalToday(user.timezone, user.createdAt);
        const boardsByDate = boardsByUser.get(key) || new Map();

        const todayBoard = boardsByDate.get(today.getTime());
        if (todayBoard && todayBoard.cigarettesSmoked > 0) {
            streaks.set(key, 0);
            continue;
        }

        streaks.set(key, walkStreak(today, createdAtLocal, boardsByDate));
    }
    return streaks;
};

module.exports = { getSmokeFreeStreak, getSmokeFreeStreaksBatch };
