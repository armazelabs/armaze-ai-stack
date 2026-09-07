// Pure time arithmetic for the project timesheet. No I/O lives here so the
// rules that decide what counts as worked time stay directly testable.
//
// The shape of the problem: Claude Code writes one timestamp per conversation
// event, in UTC. Turning that into "hours worked on a day" means bucketing to
// local days, then capping the idle gaps between events so that walking away
// from the desk does not bill as work.
//
// A block is `{ day: "YYYY-MM-DD", start: epochMs, end: epochMs }` and never
// spans midnight.

/** Shorter than this and a block rounds to zero minutes, so it is discarded. */
const MIN_BLOCK_MS = 60 * 1000;

const DAY_FORMATTERS = new Map();
const TIME_FORMATTERS = new Map();

function dayFormatter(timeZone) {
  let formatter = DAY_FORMATTERS.get(timeZone);
  if (!formatter) {
    // en-CA renders as YYYY-MM-DD, which is the format we store.
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    DAY_FORMATTERS.set(timeZone, formatter);
  }
  return formatter;
}

function timeFormatter(timeZone) {
  let formatter = TIME_FORMATTERS.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    TIME_FORMATTERS.set(timeZone, formatter);
  }
  return formatter;
}

/** Local calendar day for an instant, as `YYYY-MM-DD`. */
export function toLocalDay(epochMs, timeZone) {
  return dayFormatter(timeZone).format(new Date(epochMs));
}

/** Local wall-clock time for an instant, as `HH:MM`. */
export function toLocalTime(epochMs, timeZone) {
  return timeFormatter(timeZone).format(new Date(epochMs));
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Weekday abbreviation for a `YYYY-MM-DD` day string. Deliberately computed
 * from the date parts via UTC rather than `new Date(day)` so the answer never
 * depends on the machine's own timezone.
 */
export function weekdayOf(day) {
  const [year, month, date] = day.split("-").map(Number);
  const index = new Date(Date.UTC(year, month - 1, date)).getUTCDay();
  return WEEKDAY_NAMES[index];
}

/** Whether a day counts as a working day. `workdays` uses Sunday=0. */
export function isWorkday(day, workdays) {
  const [year, month, date] = day.split("-").map(Number);
  const index = new Date(Date.UTC(year, month - 1, date)).getUTCDay();
  return workdays.includes(index);
}

/**
 * Collapse a timeline of event instants into activity blocks.
 *
 * Events closer together than the idle gap belong to the same block; a longer
 * gap ends it. A block never spans midnight, so every block belongs to exactly
 * one day even when a gap straddles the boundary. The time between the last
 * event of a block and the first of the next is discarded, which means the
 * result under-reports slightly rather than inflating - the right direction of
 * error for a timesheet.
 *
 * Blocks shorter than a minute are dropped: the timesheet is written in whole
 * minutes, so they contribute nothing but clutter the block list.
 */
export function buildBlocks(epochMsList, options) {
  const { idleGapMinutes, timeZone } = options;
  const gapMs = idleGapMinutes * 60 * 1000;

  const sorted = [...new Set(epochMsList)].sort((a, b) => a - b);
  const blocks = [];
  let current = null;

  for (const instant of sorted) {
    const day = toLocalDay(instant, timeZone);
    if (current && instant - current.end <= gapMs && day === current.day) {
      current.end = instant;
      continue;
    }
    if (current) blocks.push(current);
    current = { day, start: instant, end: instant };
  }
  if (current) blocks.push(current);

  return blocks.filter((block) => block.end - block.start >= MIN_BLOCK_MS);
}

/**
 * Union of overlapping or touching blocks within each day.
 *
 * A single measurement pass already produces disjoint blocks, so this is a
 * guard rather than a routine step: whenever two sets of blocks are combined,
 * overlapping stretches must count as elapsed time once, not twice.
 */
export function mergeBlocks(blocks) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];

  for (const block of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && block.day === previous.day && block.start <= previous.end) {
      previous.end = Math.max(previous.end, block.end);
      continue;
    }
    merged.push({ ...block });
  }

  return merged;
}

/** Whole seconds of activity across a set of blocks. */
export function totalSeconds(blocks) {
  return blocks.reduce((sum, block) => sum + (block.end - block.start) / 1000, 0);
}

/**
 * Seconds as `6h 11m`, rounded to the nearest minute. Minutes are the unit the
 * timesheet is written and read in; carrying seconds into the markdown would
 * make totals look precise in a way the gap-capping does not justify.
 */
export function formatDuration(seconds) {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/** Inverse of {@link formatDuration}, for reading hand-edited markdown back. */
export function parseDuration(text) {
  const match = /^\s*(?:(\d+)h)?\s*(?:(\d+)m)?\s*$/.exec(text);
  if (!match || (!match[1] && !match[2])) {
    throw new Error(`Cannot parse duration: ${JSON.stringify(text)}`);
  }
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  return (hours * 60 + minutes) * 60;
}
