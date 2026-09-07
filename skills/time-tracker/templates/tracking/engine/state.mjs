// The on/off switch.
//
// Time is measured after the fact, from session transcripts, so "start" and
// "stop" cannot be a stopwatch - there is nothing to run. They are a record of
// which *dates* count. `start` opens a range at today's date, `stop` closes it
// at today's date, and a day is counted only if it falls inside a range.
//
// Ranges are whole days on purpose. Starting at three in the afternoon counts
// that whole day, including the morning, because the thing being asked is
// "does today count", not "what time is it".
//
// state.json:
//   { "ranges": [ { "from": "2026-09-01", "to": "2026-09-05" },
//                 { "from": "2026-09-07", "to": null } ] }
// A trailing `to: null` is an open range - tracking is on.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { toLocalDay } from "./blocks.mjs";
import { STATE_PATH, loadConfig } from "./config.mjs";

export function today(timeZone = loadConfig().timeZone) {
  return toLocalDay(Date.now(), timeZone);
}

export function loadState() {
  try {
    const parsed = JSON.parse(readFileSync(STATE_PATH, "utf8"));
    const ranges = Array.isArray(parsed?.ranges) ? parsed.ranges : [];
    return {
      ranges: ranges
        .filter((range) => typeof range?.from === "string")
        .map((range) => ({ from: range.from, to: typeof range.to === "string" ? range.to : null })),
    };
  } catch {
    // No state file yet means tracking has never been started, which is the
    // installed default: off, nothing counted.
    return { ranges: [] };
  }
}

export function saveState(state) {
  mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
}

/** The open range, if tracking is currently on. */
export function openRange(state) {
  return state.ranges.find((range) => range.to === null) ?? null;
}

export function isTracking(state) {
  return openRange(state) !== null;
}

/**
 * Whether a `YYYY-MM-DD` day is inside a tracked range.
 *
 * An open range runs to today and no further: a range opened last week does
 * not retroactively claim next month, and nothing in the future is counted.
 */
export function isTracked(day, state, todayDay = today()) {
  return state.ranges.some((range) => {
    const end = range.to ?? todayDay;
    return day >= range.from && day <= end;
  });
}

/** Earliest tracked day, or null when nothing has ever been tracked. */
export function earliestTrackedDay(state) {
  if (state.ranges.length === 0) return null;
  return state.ranges.map((range) => range.from).sort()[0];
}

/**
 * Open a range at today. Already-on is not an error - it is the answer to a
 * question the user asked twice.
 */
export function start(state, day) {
  if (isTracking(state)) return { changed: false, day: openRange(state).from };
  state.ranges.push({ from: day, to: null });
  state.ranges.sort((a, b) => a.from.localeCompare(b.from));
  return { changed: true, day };
}

/** Close the open range at today. Already-off is likewise not an error. */
export function stop(state, day) {
  const open = openRange(state);
  if (!open) return { changed: false, day: null };
  // A range opened today and stopped today is one tracked day, not zero.
  open.to = day < open.from ? open.from : day;
  return { changed: true, day: open.to };
}

/** Human-readable range list, oldest first. */
export function describeRanges(state, todayDay = today()) {
  return state.ranges.map((range) =>
    range.to === null ? `${range.from} to now (${todayDay})` : `${range.from} to ${range.to}`,
  );
}
