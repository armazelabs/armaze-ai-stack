// The project's hour budget: how much of it this week and this month have used.
//
//   node <tracking>/engine/budget.mjs          # one-line summary
//   node <tracking>/engine/budget.mjs check    # exit 2 when the budget is used up
//
// `monthlyHours` in config.json is the whole project's budget, shared by
// everyone on it. A week - Monday to Sunday, even where it crosses into the
// next month - may use a quarter of it; the month never more than all of it.
// So a 160-hour project allows 40 hours a week, and in a five-week month the
// last week gets whatever the month has left.
//
// `budgetExceptions` in config.json changes that for a stretch of days the
// person chose, each entry `{ from, to, weeklyHours?, monthlyHours?, note? }`:
// a week starting inside it gets `weeklyHours`, and a day inside it is held
// to `monthlyHours` for its month - `null` there means no month cap at all.
// Its `note` is printed on every PDF whose span touches the exception's
// months, so whoever reads the PDF sees why the budget changed.
//
// What counts is what the timesheets record: every computer's, measured and
// manual, after the multipliers, less any timesheet-upkeep rows - the same
// hours the client PDF shows. It can only count the timesheets in this
// checkout, so another computer's hours count once it pushes and you pull.
//
// The PDFs print these figures too: a week's done / left / cap, and for a
// month every week that touches it (`weekRows`).
//
// Going over is never hidden and never trimmed. A collect records what it
// measured and warns; the prompt hook (hooks.mjs) stops new prompts; manual
// hours that would go over are refused (manual.mjs).

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { formatDuration, toLocalDay } from "./blocks.mjs";
import { TRACKING_DIR, loadConfig, monthFileIds, monthOf } from "./config.mjs";
import { appendEntry, readLog } from "./log.mjs";
import { parseMonthFile, withoutTrackerRows } from "./month-file.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function addDays(day, count) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + count * DAY_MS).toISOString().slice(0, 10);
}

/** The Monday-to-Sunday week holding `day`, as its first and last days. */
export function weekOf(day) {
  const offset = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
  const start = addDays(day, -offset);
  return { start, end: addDays(start, 6) };
}

/** `2026-10-12` -> `Mon 12 Oct`, for messages. */
function shortDay(day) {
  const date = new Date(`${day}T00:00:00Z`);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getUTCDay()];
  return `${weekday} ${date.getUTCDate()} ${MONTH_NAMES[date.getUTCMonth()].slice(0, 3)}`;
}

/** `2026-10` -> `2026-10-31`. */
export function monthEnd(month) {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year, index, 0)).toISOString().slice(0, 10);
}

/**
 * Every Monday-to-Sunday week that touches `month`, whole - October 2026 runs
 * from the week of 28 Sep - 4 Oct to the week of 26 Oct - 1 Nov.
 */
export function weeksOverlapping(month) {
  const weeks = [];
  const last = monthEnd(month);
  for (let start = weekOf(`${month}-01`).start; start <= last; start = addDays(start, 7)) {
    weeks.push({ start, end: addDays(start, 6) });
  }
  return weeks;
}

/** The seconds `totals` records from `start` to `end`, both included. */
export function spanSeconds(totals, start, end) {
  let sum = 0;
  for (const [date, seconds] of totals) if (date >= start && date <= end) sum += seconds;
  return sum;
}

/** `{ done, cap, left }` for a span; `cap` and `left` are null when there is no budget. */
export function spanFigures(totals, start, end, cap) {
  const done = spanSeconds(totals, start, end);
  return { done, cap: cap ?? null, left: cap == null ? null : cap - done };
}

/**
 * One row per week of `month` for a monthly PDF, future weeks included. Each
 * counts its whole week, the days in the next or last month too, so it
 * matches the budget the prompt hook enforces - and so the rows need not add
 * up to the month. `before` and `after` are the parts of the week outside
 * the month, with what they record, for the note under a week's heading.
 *
 * `own` is one computer's totals, for its own PDF's extra column.
 */
export function weekRows(totals, caps, month, own = null) {
  const first = `${month}-01`;
  const last = monthEnd(month);
  return weeksOverlapping(month).map((week, index) => {
    const cap = caps?.weekFor ? caps.weekFor(week.start) : caps?.week;
    const row = { n: index + 1, ...week, ...spanFigures(totals, week.start, week.end, cap) };
    if (own) row.own = spanSeconds(own, week.start, week.end);
    if (week.start < first) {
      const end = addDays(first, -1);
      row.before = { start: week.start, end, seconds: spanSeconds(totals, week.start, end) };
    }
    if (week.end > last) {
      const start = addDays(last, 1);
      row.after = { start, end: week.end, seconds: spanSeconds(totals, start, week.end) };
    }
    return row;
  });
}

/** The week's and the month's caps in seconds, or null when the project has no budget. */
export function budgetCaps(config) {
  const hours = Number(config?.monthlyHours);
  if (config?.monthlyHours == null || !Number.isFinite(hours) || hours <= 0) return null;
  return { month: hours * 3600, week: (hours * 3600) / 4 };
}

/** The well-formed `budgetExceptions` from config.json. */
export function budgetExceptions(config) {
  const list = Array.isArray(config?.budgetExceptions) ? config.budgetExceptions : [];
  const isDay = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  return list.filter((entry) => entry && isDay(entry.from) && isDay(entry.to) && entry.from <= entry.to);
}

/** The exception covering `day`, or null. */
export function exceptionOn(config, day) {
  return budgetExceptions(config).find((entry) => day >= entry.from && day <= entry.to) ?? null;
}

function hoursToSeconds(value) {
  const hours = Number(value);
  return Number.isFinite(hours) && hours > 0 ? hours * 3600 : null;
}

/**
 * The caps in force on `day`, or null when the project has no budget. The
 * week cap is the one for the week starting on `day` - pass a Monday - and
 * the month cap is null when an exception lifts it.
 */
export function capsOn(config, day) {
  const caps = budgetCaps(config);
  if (!caps) return null;
  const exception = exceptionOn(config, day);
  if (!exception) return caps;
  const week = hoursToSeconds(exception.weeklyHours) ?? caps.week;
  const month = !("monthlyHours" in exception)
    ? caps.month
    : exception.monthlyHours == null
      ? null
      : (hoursToSeconds(exception.monthlyHours) ?? caps.month);
  return { week, month };
}

/** `budgetCaps` plus `weekFor(start)`, the cap of the week starting that Monday, for `weekRows`. */
export function weekCaps(config) {
  const caps = budgetCaps(config);
  return caps && { ...caps, weekFor: (start) => capsOn(config, start).week };
}

/** The notes of the exceptions touching any month from `start` to `end`, for a PDF. */
export function exceptionNotes(config, start, end) {
  return budgetExceptions(config)
    .filter((entry) => typeof entry.note === "string" && entry.note.trim() !== "")
    .filter((entry) => `${monthOf(entry.from)}-01` <= end && monthEnd(monthOf(entry.to)) >= start)
    .map((entry) => entry.note.trim());
}

/**
 * Recorded seconds per day, summed over every timesheet for `months` - each
 * day rounded to the whole minutes its heading prints, so the budget agrees
 * with the month files and the PDF.
 *
 * `fresh` is `{ id, months: Map<month, file> }` - one computer's months just
 * re-measured in memory, used in place of what its files on disk say. That is
 * how the prompt hook counts the minutes since the last collect without
 * rewriting the timesheet on every prompt.
 *
 * `only` limits it to one computer's timesheet - its share, for its own PDF.
 */
export function recordedDays(months, { dir = TRACKING_DIR, fresh = null, only = null } = {}) {
  const totals = new Map();
  for (const month of new Set(months)) {
    const ids = new Set(monthFileIds(month, dir));
    if (fresh?.months.has(month)) ids.add(fresh.id);
    for (const id of ids) {
      if (only && id !== only) continue;
      let file = fresh?.id === id ? fresh.months.get(month) : null;
      if (!file) {
        const source = path.join(dir, `${month}.${id}.md`);
        if (!existsSync(source)) continue;
        file = parseMonthFile(readFileSync(source, "utf8"));
      }
      for (const day of withoutTrackerRows(file.days)) {
        if (monthOf(day.date) !== month) continue;
        totals.set(day.date, (totals.get(day.date) ?? 0) + Math.round(day.seconds / 60) * 60);
      }
    }
  }
  return totals;
}

/**
 * Where `day`'s week and month stand against the budget, from per-day totals.
 * Pure, so the arithmetic is testable without files. Null when there is no
 * budget.
 */
export function budgetFrom(totals, config, day) {
  if (!budgetCaps(config)) return null;
  const week = weekOf(day);
  const month = monthOf(day);
  // The week's cap is set by the day it starts; the month's by the day itself,
  // so an exception that lifts the month cap does so only from its first day.
  const caps = { week: capsOn(config, week.start).week, month: capsOn(config, day).month };
  let weekUsed = 0;
  let monthUsed = 0;
  for (const [date, seconds] of totals) {
    if (date >= week.start && date <= week.end) weekUsed += seconds;
    if (monthOf(date) === month) monthUsed += seconds;
  }
  const weekLeft = caps.week - weekUsed;
  const monthLeft = caps.month == null ? Infinity : caps.month - monthUsed;
  const over = [];
  if (weekUsed > caps.week) over.push("week");
  if (caps.month != null && monthUsed > caps.month) over.push("month");
  // When the budget opens again: next Monday for the week, the 1st for the
  // month - the later of the two when both are used up.
  const [year, monthIndex] = month.split("-").map(Number);
  const nextMonth = new Date(Date.UTC(year, monthIndex, 1)).toISOString().slice(0, 10);
  const nextWeek = addDays(week.start, 7);
  const reopens =
    weekLeft <= 0 && monthLeft <= 0
      ? (nextWeek > nextMonth ? nextWeek : nextMonth)
      : monthLeft <= 0
        ? nextMonth
        : nextWeek;
  return {
    day,
    week: { ...week, used: weekUsed, cap: caps.week, left: weekLeft },
    month: { name: month, used: monthUsed, cap: caps.month, left: monthLeft },
    left: Math.min(weekLeft, monthLeft),
    exhausted: weekLeft <= 0 || monthLeft <= 0,
    over,
    reopens,
  };
}

/**
 * The budget for `day` (today by default), read from every timesheet in the
 * tracking folder - both months when the week crosses one. Null when there
 * is no budget.
 */
export function budgetFor(config, day = toLocalDay(Date.now(), config.timeZone), options = {}) {
  if (!budgetCaps(config)) return null;
  const week = weekOf(day);
  const totals = recordedDays([monthOf(week.start), monthOf(day), monthOf(week.end)], options);
  return budgetFrom(totals, config, day);
}

function standing(used, cap) {
  if (cap == null) return `${formatDuration(used)} used, no month cap`;
  const left = cap - used;
  return left >= 0
    ? `${formatDuration(used)} of ${formatDuration(cap)} used, ${formatDuration(left)} left`
    : `${formatDuration(used)} of ${formatDuration(cap)} used - ${formatDuration(-left)} over`;
}

/** `This week (Mon 5 Oct - Sun 11 Oct): 38h of 40h used, 2h left. October: ...` */
export function describeBudget(budget) {
  const [, monthIndex] = budget.month.name.split("-").map(Number);
  return (
    `This week (${shortDay(budget.week.start)} - ${shortDay(budget.week.end)}): ` +
    `${standing(budget.week.used, budget.week.cap)}. ` +
    `${MONTH_NAMES[monthIndex - 1]}: ${standing(budget.month.used, budget.month.cap)}.`
  );
}

/** Why the budget is closed and when it opens again, for the prompt hook. */
export function blockedMessage(budget) {
  const which =
    budget.week.left <= 0 && budget.month.left <= 0
      ? "this week's and this month's hours are"
      : budget.month.left <= 0
        ? "this month's hours are"
        : "this week's hours are";
  return (
    `Time tracker: ${which} used up for this project. ${describeBudget(budget)}\n` +
    `Prompts here are paused until ${shortDay(budget.reopens)}. "update tracker" still works. ` +
    "To work anyway, start Claude Code with TIME_TRACKER_OVERRIDE=1."
  );
}

/**
 * Why `extraSeconds` more on the budget's day cannot be recorded, or null
 * when it fits. For manual hours, which are refused rather than recorded over.
 */
export function roomProblem(budget, extraSeconds) {
  if (!budget || extraSeconds <= 0 || extraSeconds <= budget.left) return null;
  const room = Math.max(0, budget.left);
  return (
    `That is ${formatDuration(extraSeconds)} more, and only ${formatDuration(room)} of the hour budget is left ` +
    `for ${budget.day}. ${describeBudget(budget)}`
  );
}

/**
 * Log a week or month going over budget - once per week and once per month,
 * not on every collect that finds it still over.
 */
export function noteOverBudget(fileId, config, budget) {
  const logged = readLog(fileId).filter((entry) => entry?.kind === "over-budget");
  for (const period of budget.over) {
    const key = period === "week" ? budget.week.start : budget.month.name;
    if (logged.some((entry) => entry.period === period && entry.from === key)) continue;
    const span = period === "week" ? budget.week : budget.month;
    appendEntry(fileId, {
      at: new Date().toLocaleString("sv", { timeZone: config.timeZone }).replace(" ", "T"),
      kind: "over-budget",
      period,
      from: key,
      cap: formatDuration(span.cap),
      used: formatDuration(span.used),
    });
  }
}

function main() {
  const config = loadConfig();
  const budget = budgetFor(config);
  if (!budget) {
    console.log("No monthlyHours in config.json - this project has no hour budget.");
    return;
  }
  if ((process.argv[2] ?? "").toLowerCase() === "check" && budget.exhausted) {
    process.stderr.write(`${blockedMessage(budget)}\n`);
    process.exit(2);
  }
  console.log(describeBudget(budget));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
