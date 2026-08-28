/**
 * Shared helpers for resolving a "calendar day" using a user's IANA timezone
 * instead of the server's UTC clock. Used to fix day-boundary bugs where a
 * user's streak/day-count would flip on server midnight (UTC) rather than
 * their own local midnight.
 */

const isValidTimezone = (tz) => {
    if (!tz || typeof tz !== "string") return false;
    try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
    } catch (error) {
        return false;
    }
};

// Returns the Y/M/D of the given instant (defaults to now) as seen in the
// given IANA timezone (falls back to UTC).
const getLocalDateParts = (timezone, instant = new Date()) => {
    const tz = isValidTimezone(timezone) ? timezone : "UTC";

    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(instant);

    const map = {};
    for (const { type, value } of parts) map[type] = value;

    return {
        year: Number(map.year),
        month: Number(map.month) - 1, // 0-indexed, to match Date.UTC
        day: Number(map.day),
    };
};

// Returns the given instant's (defaults to now) local calendar date, encoded
// as a UTC-midnight Date so it stays a plain "date-only" key comparable with
// existing stored `date` fields.
const getLocalToday = (timezone, instant = new Date()) => {
    const { year, month, day } = getLocalDateParts(timezone, instant);
    return new Date(Date.UTC(year, month, day));
};

module.exports = { isValidTimezone, getLocalDateParts, getLocalToday };
