// Which multipliers each day is recorded at.
//
// A multiplier belongs to the day it was in force on, not to the run that
// happens to re-measure the day. Every run recomputes the whole history (see
// collect.mjs), so without a date on each value a change made this morning
// would quietly rescale every day before it. Two things keep that from
// happening:
//
//   - `multiplierHistory` in config.json: the values in force from each date,
//     `[{ from: "YYYY-MM-DD", hoursMultiplier, subagentMultiplier }]`. The
//     top-level `hoursMultiplier` / `subagentMultiplier` stay what a person
//     edits - they are the values in force today. When they no longer match
//     the dated list, the next collect adds an entry from today (or replaces
//     today's, so two edits in a day leave one). A whole day carries one rate:
//     a change counts from the start of the day it is made. Backdating is an
//     edit to an entry's `from`.
//
//   - `computers/<computer>/rates.json`: the rate each of this computer's days
//     was last written at. It is how a run tells that a day's rate has since
//     changed - a backdated entry - and by how much, so the day is rescaled
//     once rather than measured against hours written at another rate.
//
// A config from before the dated list gets one from its own git history: each
// commit that changed a multiplier starts an entry on that commit's day.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { toLocalDay } from "./blocks.mjs";
import {
  CONFIG_PATH,
  DEFAULT_HOURS_MULTIPLIER,
  DEFAULT_SUBAGENT_MULTIPLIER,
  REPO_ROOT,
  TRACKING_DIR,
  computerDir,
} from "./config.mjs";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function positive(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** Both multipliers from anything that carries them, each defaulted when missing or not a positive number. */
export function ratePair(source) {
  return {
    hoursMultiplier: positive(source?.hoursMultiplier) ? source.hoursMultiplier : DEFAULT_HOURS_MULTIPLIER,
    subagentMultiplier: positive(source?.subagentMultiplier)
      ? source.subagentMultiplier
      : DEFAULT_SUBAGENT_MULTIPLIER,
  };
}

export function sameRate(a, b) {
  return a.hoursMultiplier === b.hoursMultiplier && a.subagentMultiplier === b.subagentMultiplier;
}

/** The stored dated list, cleaned: entries with a real date, defaulted values, oldest first, one per date. */
export function storedHistory(config) {
  if (!Array.isArray(config?.multiplierHistory)) return [];
  const byDate = new Map();
  for (const entry of config.multiplierHistory) {
    if (!DAY.test(entry?.from ?? "")) continue;
    byDate.set(entry.from, { from: entry.from, ...ratePair(entry) });
  }
  return [...byDate.values()].sort((a, b) => a.from.localeCompare(b.from));
}

/** The entry in force on `date`: the last one starting on or before it, else the first. */
export function rateFor(history, date) {
  let found = history[0];
  for (const entry of history) {
    if (entry.from <= date) found = entry;
    else break;
  }
  return ratePair(found);
}

/**
 * The dated list as it stands today: the stored one, plus an entry from
 * `today` when the top-level values differ from the ones in force today.
 * An entry already dated today is replaced rather than joined, and a later
 * (future) entry is kept where it is. With no stored list at all, the
 * top-level values count from `trackFrom`.
 */
export function effectiveHistory(config, today) {
  const current = ratePair(config);
  const stored = storedHistory(config);
  if (stored.length === 0) return [{ from: config?.trackFrom ?? today, ...current }];
  if (sameRate(rateFor(stored, today), current)) return stored;
  // An edit put back the same day leaves no entry for that day at all.
  const others = stored.filter((entry) => entry.from !== today);
  if (others.length > 0 && others.some((entry) => entry.from < today) && sameRate(rateFor(others, today), current)) {
    return others;
  }
  return [...others, { from: today, ...current }].sort((a, b) => a.from.localeCompare(b.from));
}

/**
 * A dated list rebuilt from config.json's history: `commits` is
 * `[{ day, rate }]`, oldest first, each the multipliers that commit held.
 * The first value counts from `trackFrom`; each later change from its
 * commit's day (two on one day leave the later one, and a day before
 * `trackFrom` counts as `trackFrom`). The working copy is `current`: if it
 * differs from the last commit, it counts from today.
 */
export function seedHistory({ trackFrom, commits, current, today }) {
  const entries = [];
  const put = (from, rate) => {
    const last = entries[entries.length - 1];
    if (last && sameRate(last, rate)) return;
    if (last && last.from >= from) entries.pop();
    const before = entries[entries.length - 1];
    if (before && sameRate(before, rate)) return;
    entries.push({ from, ...ratePair(rate) });
  };
  for (const { day, rate } of commits) put(entries.length === 0 || day < trackFrom ? trackFrom : day, rate);
  put(entries.length === 0 ? trackFrom : today, current);
  return entries;
}

/**
 * The multipliers config.json held at each commit that touched it, oldest
 * first, as `[{ day, rate }]` with the day local to `timeZone`. Empty when
 * there is no git, no checkout, or the file was never committed.
 */
export function configCommits(timeZone, file = CONFIG_PATH, repoRoot = REPO_ROOT) {
  const git = (args) =>
    execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const relative = `./${path.relative(repoRoot, file).split(path.sep).join("/")}`;
  let lines;
  try {
    lines = git(["log", "--format=%H %ct", "--", relative]).trim().split("\n").filter(Boolean).reverse();
  } catch {
    return [];
  }
  const commits = [];
  for (const line of lines) {
    const [sha, seconds] = line.split(" ");
    try {
      const rate = ratePair(JSON.parse(git(["show", `${sha}:${relative}`])));
      commits.push({ day: toLocalDay(Number(seconds) * 1000, timeZone), rate });
    } catch {
      // A commit where the file did not parse says nothing about the rate.
    }
  }
  return commits;
}

/**
 * config.json as the template writes it: two-space JSON, short number arrays
 * like `workdays` on one line, and one line per dated multiplier entry.
 */
export function configJson(config) {
  return `${JSON.stringify(config, null, 2)
    .replace(/\[\s*(\d+(?:,\s*\d+)*)\s*\]/g, (_, inner) => `[${inner.split(/,\s*/).join(", ")}]`)
    .replace(/\{\s*("from": "[^"]*",[^{}]*?)\s*\}/g, (_, inner) => `{ ${inner.split(/,\s*/).join(", ")} }`)}\n`;
}

/**
 * Write the dated list into config.json, keeping every other key and its
 * order; the list goes straight after the two multipliers. Returns whether
 * the file changed.
 */
export function saveHistory(history, file = CONFIG_PATH) {
  let stored;
  try {
    stored = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return false;
  }
  const next = {};
  for (const [key, value] of Object.entries(stored)) {
    if (key === "multiplierHistory") continue;
    next[key] = value;
    if (key === "subagentMultiplier") next.multiplierHistory = history;
  }
  if (!("multiplierHistory" in next)) next.multiplierHistory = history;
  const content = configJson(next);
  if (content === readFileSync(file, "utf8")) return false;
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, content);
  renameSync(temporary, file);
  return true;
}

export function ledgerPath(id, dir = TRACKING_DIR) {
  return path.join(computerDir(id, dir), "rates.json");
}

/** `{ "YYYY-MM-DD": [hours, subagent] }` to a `Map<day, rate>`. Unreadable or absent is empty. */
export function parseLedger(text) {
  const ledger = new Map();
  let stored;
  try {
    stored = JSON.parse(text);
  } catch {
    return ledger;
  }
  for (const [day, pair] of Object.entries(stored ?? {})) {
    if (!DAY.test(day) || !Array.isArray(pair)) continue;
    const [hoursMultiplier, subagentMultiplier] = pair;
    if (positive(hoursMultiplier) && positive(subagentMultiplier)) {
      ledger.set(day, { hoursMultiplier, subagentMultiplier });
    }
  }
  return ledger;
}

/** One day per line, oldest first, so a new day is a one-line diff. */
export function renderLedger(ledger) {
  const lines = [...ledger.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, rate]) => `  "${day}": [${rate.hoursMultiplier}, ${rate.subagentMultiplier}]`);
  return lines.length === 0 ? "{}\n" : `{\n${lines.join(",\n")}\n}\n`;
}

export function readLedger(id, dir = TRACKING_DIR) {
  const file = ledgerPath(id, dir);
  return existsSync(file) ? parseLedger(readFileSync(file, "utf8")) : new Map();
}

/** Returns whether the file changed. */
export function writeLedger(id, ledger, dir = TRACKING_DIR) {
  const file = ledgerPath(id, dir);
  const content = renderLedger(ledger);
  if (existsSync(file) && readFileSync(file, "utf8") === content) return false;
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, content);
  renameSync(temporary, file);
  return true;
}
