/**
 * Calendar-day arithmetic.
 *
 * Every date here is a 'YYYY-MM-DD' string, matching what the DATE type parser in
 * db/pool.js hands back. Nothing in this file constructs a local-time Date: a leave
 * day is a calendar day, and parsing '2026-08-01' as local midnight would move it
 * across the date line for anyone east or west of UTC. All arithmetic runs in UTC
 * and converts straight back to a string.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

/** 'YYYY-MM-DD' -> epoch ms at UTC midnight. */
function toUtcMs(date) {
  if (typeof date !== 'string' || !DATE_RE.test(date)) {
    throw new TypeError(`Expected a YYYY-MM-DD date string, got ${JSON.stringify(date)}`);
  }
  const [y, m, d] = date.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d);
  const back = toDateString(ms);
  // Date.UTC silently rolls 2026-02-31 over into March; reject rather than accept it.
  if (back !== date) throw new RangeError(`${date} is not a real calendar date`);
  return ms;
}

/** epoch ms -> 'YYYY-MM-DD' */
export function toDateString(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Today according to the server, as a calendar day in UTC. */
export function todayString() {
  return new Date().toISOString().slice(0, 10);
}

/** Saturday or Sunday. getUTCDay(): 0 = Sunday, 6 = Saturday. */
export function isWeekend(date) {
  const dow = new Date(toUtcMs(date)).getUTCDay();
  return dow === 0 || dow === 6;
}

/** Inclusive list of every calendar day from start to end. */
export function eachDateInRange(start, end) {
  const startMs = toUtcMs(start);
  const endMs = toUtcMs(end);
  if (endMs < startMs) return [];
  const out = [];
  for (let ms = startMs; ms <= endMs; ms += MS_PER_DAY) out.push(toDateString(ms));
  return out;
}

/**
 * Working days in an inclusive range, excluding weekends and public holidays.
 *
 * This is the day_count in §5.1 step 2, and therefore what a paid leave request
 * actually costs an employee. A holiday that falls on a weekend is not double
 * counted - it was never a working day to begin with.
 *
 * @param {string} start      'YYYY-MM-DD', inclusive
 * @param {string} end        'YYYY-MM-DD', inclusive
 * @param {Iterable<string>} [holidays]  'YYYY-MM-DD' dates
 * @returns {number} whole number of working days; 0 if the range is entirely non-working
 */
export function businessDaysBetween(start, end, holidays = []) {
  const holidaySet = holidays instanceof Set ? holidays : new Set(holidays);
  let count = 0;
  for (const date of eachDateInRange(start, end)) {
    if (isWeekend(date)) continue;
    if (holidaySet.has(date)) continue;
    count += 1;
  }
  return count;
}

/** Both dates fall in the same calendar year (§5.1 step 1). */
export function isSameCalendarYear(start, end) {
  return start.slice(0, 4) === end.slice(0, 4);
}

/** Negative if a < b, 0 if equal, positive if a > b. Safe because the format sorts lexically. */
export function compareDates(a, b) {
  toUtcMs(a);
  toUtcMs(b);
  return a < b ? -1 : a > b ? 1 : 0;
}
