// Manual hours: work that never touched a transcript.
//
//   node <tracking>/engine/manual.mjs add    --date 2026-10-02 --task "Checkout screens" --hours 2 \
//                                            [--bullet "Mobile and desktop checkout layouts"] \
//                                            --note "2 hours in Figma yesterday on checkout" [--session <id>]
//   node <tracking>/engine/manual.mjs set    --date 2026-10-02 --task "Checkout screens" [--hours 3] \
//                                            [--rename "…"] [--bullet …] [--note "…"] [--computer <id>]
//   node <tracking>/engine/manual.mjs remove --date 2026-10-02 --task "Checkout screens" [--note "…"] \
//                                            [--computer <id>]
//
// A Figma afternoon or a paper sketch leaves no transcript, so no collect can
// measure it - the person says it happened and how long it took, and that is
// the record. It is research, always: the row's Type cell reads `Research ·
// manual, 2h given`, which every rebuild carries across untouched and counts
// on top of what it measures.
//
// `--hours` is the time given. It is recorded scaled by `hoursMultiplier`,
// the same as measured time - 2h given at 1.5 is recorded as 3h - so a manual
// hour weighs what a measured one does. The given hours stay on the row, so
// the record always shows both. Bullets are optional: the person's own words
// are the record here, and they need not be dressed up as outcomes.
//
// `add` always writes this computer's own timesheet, and `set` and `remove`
// look there. A row on another computer's timesheet is changed only when
// `--computer <id>` names it - writing another computer's file is the one
// place two computers could collide, so that file must also have no
// uncommitted changes here: pull first, push straight after.
//
// This is the only way manual hours reach the timesheet. A day's total is
// never hand-written: every change here moves the row and the day's heading
// together, and appends a line to this computer's log saying what changed,
// in the person's own words (`--note`).
//
// They do count against the project's hour budget (budget.mjs), at their
// recorded size: an `add`, or a `set` that makes a row longer, is refused
// when it would take its day's week or month past the budget, and says how
// much is left.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { formatDuration, toLocalDay } from "./blocks.mjs";
import { REPO_ROOT, currentComputer, loadConfig, monthFileIds, monthFilePath, monthOf } from "./config.mjs";
import { budgetFor, roomProblem } from "./budget.mjs";
import { appendEntry, monthTotal } from "./log.mjs";
import {
  MANUAL_TYPE,
  addManualTask,
  parseMonthFile,
  removeManualTask,
  renderMonthFile,
  scaleManual,
  setManualTask,
} from "./month-file.mjs";

/** No one logs more than a day's worth of hand work against a single day. */
const MAX_SECONDS = 24 * 60 * 60;

/**
 * `3`, `1.5`, `1h 30m`, `90m` - to whole seconds, rounded to the minute the
 * markdown stores. Null when it does not read as a positive length of time.
 */
export function parseHours(text) {
  const value = String(text ?? "").trim().toLowerCase();
  let minutes = null;
  if (/^\d+(?:\.\d+)?h?$/.test(value)) minutes = Number.parseFloat(value) * 60;
  else {
    const match = /^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?$/.exec(value);
    if (match && (match[1] || match[2])) minutes = Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
  }
  if (minutes == null || !Number.isFinite(minutes)) return null;
  const seconds = Math.round(minutes) * 60;
  return seconds > 0 ? seconds : null;
}

/**
 * Why an entry cannot be recorded, or null when it can. A manual day counts
 * from `trackFrom` like any other, and only up to today - logging tomorrow's
 * work is a guess, not a record.
 */
export function entryProblem({ date, seconds }, config, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) return `--date expects YYYY-MM-DD, got ${date ?? "nothing"}.`;
  if (!config.trackFrom) return "No trackFrom in config.json - run setup first.";
  if (date < config.trackFrom) return `${date} is before trackFrom (${config.trackFrom}); it does not count.`;
  if (date > today) return `${date} is in the future - log it once it has happened.`;
  if (seconds !== undefined && (seconds == null || seconds > MAX_SECONDS)) {
    return "--hours expects a length between a minute and 24 hours, e.g. 3, 1.5 or 1h 30m.";
  }
  return null;
}

/**
 * Which timesheet holds the manual row `name` on `date`. `files` is
 * `[{ id, file }]` with each parsed month file, this computer's own first, so
 * it wins if two computers somehow hold the same row.
 */
export function findManualOwner(files, date, name) {
  for (const { id, file } of files) {
    const day = file.days.find((candidate) => candidate.date === date);
    if (day?.tasks.some((task) => task.manual && task.name === name)) return id;
  }
  return null;
}

/**
 * Whether git shows uncommitted changes to `file`. Null when git cannot tell -
 * no git, or not a checkout - where there is nothing to sync and so nothing
 * to collide with.
 */
export function gitDirty(file) {
  try {
    return (
      execFileSync("git", ["status", "--porcelain", "--", file], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() !== ""
    );
  } catch {
    return null;
  }
}

function flag(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : (process.argv[index + 1] ?? "");
}

/** Every `--bullet`, in order. Undefined when none was given, so `set` can tell "leave them" from "clear them". */
function bullets() {
  const found = [];
  process.argv.forEach((arg, index) => {
    if (arg === "--bullet" && process.argv[index + 1]) found.push(process.argv[index + 1].trim());
  });
  return found.length > 0 ? found : undefined;
}

/** Same atomic write the collector uses, so a concurrent collect never reads half a file. */
function writeAtomic(file, content) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, content);
  renameSync(temporary, file);
}

/** Which PDFs no longer match, as the command that rewrites them. */
function renderHint(date, today) {
  const monday = (day) => {
    const offset = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
    return new Date(Date.parse(`${day}T00:00:00Z`) - offset * 86400000).toISOString().slice(0, 10);
  };
  if (monday(date) === monday(today)) {
    return "This week's PDFs pick it up on the next `report.mjs`.";
  }
  return `Re-render its PDFs: node ${path.join(path.dirname(fileURLToPath(import.meta.url)), "report.mjs")} --month ${monthOf(date)} --all-weeks`;
}

function main() {
  const action = (process.argv[2] ?? "").toLowerCase();
  if (!["add", "set", "remove"].includes(action)) {
    console.error(
      "Usage: node manual.mjs add --date <YYYY-MM-DD> --task <name> --hours <h given> " +
        "[--bullet <outcome>]... [--note <their words>] [--session <id>]\n" +
        "       node manual.mjs set --date <YYYY-MM-DD> --task <name> [--hours <h given>] " +
        "[--rename <name>] [--bullet <outcome>]... [--computer <id>]\n" +
        "       node manual.mjs remove --date <YYYY-MM-DD> --task <name> [--computer <id>]",
    );
    process.exit(1);
  }

  const config = loadConfig();
  const computer = currentComputer();
  const today = toLocalDay(Date.now(), config.timeZone);

  const date = flag("date");
  const task = flag("task")?.trim();
  const hours = flag("hours");
  const given = hours === undefined ? undefined : parseHours(hours);
  const seconds = given == null ? given : scaleManual(given, config.hoursMultiplier ?? 1);
  const rename = flag("rename")?.trim();
  const details = bullets();
  const elsewhereId = flag("computer")?.trim() || null;

  if (!task) throw new Error("--task is required: the row's name, as it reads on the timesheet.");
  if (action === "add" && hours === undefined) {
    throw new Error("add needs --hours (the time given) as well as --date and --task.");
  }
  const problem = entryProblem({ date, seconds: given }, config, today);
  if (problem) throw new Error(problem);
  if (flag("type") !== undefined) console.log(`Manual hours are always ${MANUAL_TYPE} - --type ignored.`);

  const month = monthOf(date);
  const read = (id) => {
    const file = monthFilePath(month, id);
    return existsSync(file) ? parseMonthFile(readFileSync(file, "utf8")) : { month, days: [] };
  };

  let target = computer.fileId;
  if (action !== "add") {
    const ids = elsewhereId ? [elsewhereId] : [computer.fileId];
    target = findManualOwner(ids.map((id) => ({ id, file: read(id) })), date, task);
    if (!target && !elsewhereId) {
      const others = monthFileIds(month).filter((id) => id !== computer.fileId);
      const owner = findManualOwner(others.map((id) => ({ id, file: read(id) })), date, task);
      if (owner) {
        throw new Error(
          `"${task}" on ${date} is on ${owner}'s timesheet, not this computer's. ` +
            `To change it from here, add --computer ${owner}.`,
        );
      }
    }
    if (!target) {
      throw new Error(`${date} has no manual row "${task}" on ${elsewhereId ?? "this computer"}'s timesheet.`);
    }
  }
  const elsewhere = target !== computer.fileId;
  const file = monthFilePath(month, target);
  if (elsewhere && gitDirty(file)) {
    throw new Error(
      `"${task}" is on ${target}'s timesheet, which has uncommitted changes here. ` +
        "Commit or discard them, pull, then try again - editing it now could conflict with that computer.",
    );
  }
  const parsed = read(target);
  const current = parsed.month ? parsed : { ...parsed, month };

  // The hour budget, at the recorded size. Only time being added is checked -
  // shortening or removing a row always goes through, even on a week already
  // over.
  if (seconds != null && action !== "remove") {
    const existingRow = current.days
      .find((day) => day.date === date)
      ?.tasks.find((row) => row.manual && row.name === task);
    const extra = action === "add" ? seconds : seconds - (existingRow?.seconds ?? 0);
    const over = roomProblem(budgetFor(config, date), extra);
    if (over) throw new Error(over);
  }

  let next;
  if (action === "add") {
    next = addManualTask(current, date, {
      name: task,
      type: MANUAL_TYPE,
      seconds,
      givenSeconds: given,
      ...(details ? { details } : {}),
    });
  } else if (action === "set") {
    next = setManualTask(current, date, task, { rename, seconds, givenSeconds: given, details });
  } else {
    next = removeManualTask(current, date, task);
  }
  writeAtomic(file, renderMonthFile(next, config.workdays));

  const row = next.days.find((day) => day.date === date)?.tasks.find((t) => t.manual && t.name === (rename || task));
  appendEntry(computer.fileId, {
    at: new Date().toLocaleString("sv", { timeZone: config.timeZone }).replace(" ", "T"),
    kind: "manual",
    action,
    month,
    date,
    task,
    ...(elsewhere ? { timesheet: target } : {}),
    ...(rename ? { renamedTo: rename } : {}),
    ...(row
      ? {
          type: row.type,
          ...(row.givenSeconds != null ? { given: formatDuration(row.givenSeconds) } : {}),
          time: formatDuration(row.seconds),
        }
      : {}),
    note: flag("note") ?? null,
    session: flag("session") ?? null,
    monthTotal: monthTotal(month, target),
  });

  const sized = (r) =>
    r.givenSeconds != null
      ? `${formatDuration(r.givenSeconds)} given (recorded as ${formatDuration(r.seconds)})`
      : formatDuration(r.seconds);
  const what =
    action === "add"
      ? `Added ${sized(row)} of ${MANUAL_TYPE} on ${date}: "${task}" (manual).`
      : action === "set"
        ? `Changed the manual row "${task}" on ${date}${row ? ` - now ${sized(row)}` : ""}.`
        : `Removed the manual row "${task}" from ${date}.`;
  const day = next.days.find((candidate) => candidate.date === date);
  console.log(
    `${what} ${date} now ${day ? formatDuration(day.seconds) : "has no time"}` +
      `${elsewhere ? ` on ${target}'s timesheet` : ""}.`,
  );
  if (elsewhere) console.log("That file belongs to another computer: commit and push it now, before it collects again.");
  console.log(renderHint(date, today));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
