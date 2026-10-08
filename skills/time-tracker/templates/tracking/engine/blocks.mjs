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

/**
 * The parts of `blocks` that no interval in `cover` overlaps.
 *
 * Both lists are merged first, so overlapping entries on either side count
 * once. A piece keeps the day of the block it was cut from - a block never
 * spans midnight, so neither does any part of it - while `cover` is read as
 * bare `[start, end]` ranges and may cross midnight freely.
 */
export function subtractBlocks(blocks, cover) {
  const sortedCover = mergeRanges(cover);
  const pieces = [];

  for (const block of mergeBlocks(blocks)) {
    let cursor = block.start;
    for (const range of sortedCover) {
      if (range.end <= cursor) continue;
      if (range.start >= block.end) break;
      if (range.start > cursor) pieces.push({ day: block.day, start: cursor, end: range.start });
      cursor = Math.max(cursor, range.end);
      if (cursor >= block.end) break;
    }
    if (cursor < block.end) pieces.push({ day: block.day, start: cursor, end: block.end });
  }

  return pieces;
}

/** Union of `[start, end]` ranges on the epoch line, ignoring days. */
function mergeRanges(ranges) {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
      continue;
    }
    merged.push({ start: range.start, end: range.end });
  }
  return merged;
}

/**
 * Seconds of `blocks` that no block in `cover` overlaps.
 *
 * This is how subagent time is credited: an agent that worked while its main
 * session sat idle adds the stretch nobody else was counting, and an agent
 * that ran alongside the main session adds nothing - the main session already
 * covers that time, and counting it again would bill one hour as two.
 */
export function uncoveredSeconds(blocks, cover) {
  return totalSeconds(subtractBlocks(blocks, mergeBlocks(cover)));
}

/**
 * Which sessions each block holds, as `sessions: [{ id, start, end }]` - each
 * session's first and last instant inside the block. Runs after every cut,
 * since `subtractBlocks` keeps only `day`, `start` and `end`.
 *
 * `sessions` maps a session id to its instants, in any order.
 */
export function attachSessions(blocks, sessions) {
  const sorted = [...sessions].map(([id, instants]) => [id, [...instants].sort((a, b) => a - b)]);
  return blocks.map((block) => {
    const found = [];
    for (const [id, instants] of sorted) {
      let low = 0;
      let high = instants.length;
      while (low < high) {
        const middle = (low + high) >> 1;
        if (instants[middle] < block.start) low = middle + 1;
        else high = middle;
      }
      if (low === instants.length || instants[low] > block.end) continue;
      let last = low;
      while (last + 1 < instants.length && instants[last + 1] <= block.end) last += 1;
      found.push({ id, start: instants[low], end: instants[last] });
    }
    found.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
    return { ...block, sessions: found };
  });
}

/**
 * The short form of a session id the timesheet carries - the transcript's
 * file name is a UUID, and its first eight characters are what Claude Code's
 * own session list shows.
 */
export function sessionRef(id) {
  return String(id).slice(0, 8);
}

/** `09:10` -> 550. */
export function toMinutes(clock) {
  const [hours, minutes] = clock.split(":").map(Number);
  return hours * 60 + minutes;
}

/** 550 -> `09:10`. */
export function fromMinutes(total) {
  const hours = Math.floor(total / 60);
  return `${String(hours).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * The parts of `ranges` that no range in `cut` covers, on one day's clock.
 * Both are `{ start, end }` in minutes of the day; anything else a range
 * carries (its sessions) stays with every piece cut from it.
 */
export function subtractRanges(ranges, cut) {
  const pieces = [];
  const sortedCut = [...cut].sort((a, b) => a.start - b.start);
  for (const range of ranges) {
    let cursor = range.start;
    for (const hole of sortedCut) {
      if (hole.end <= cursor) continue;
      if (hole.start >= range.end) break;
      if (hole.start > cursor) pieces.push({ ...range, start: cursor, end: hole.start });
      cursor = Math.max(cursor, hole.end);
      if (cursor >= range.end) break;
    }
    if (cursor < range.end) pieces.push({ ...range, start: cursor, end: range.end });
  }
  return pieces;
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
