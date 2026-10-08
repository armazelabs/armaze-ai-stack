// Render a month's timesheet to PDF.
//
// Run with `node <tracking>/engine/report.mjs`. With no flags - what "update
// tracker" runs - it writes the current month's PDF and the current week's.
// `--month 2026-08` / `--last-month` write one specific month instead, and
// `--all-weeks` adds every week of whichever month is being written.
//
// Weeks run Monday to Sunday and are split at a month's edge, so a month's
// weekly PDFs always add up to exactly its monthly one:
//
//   <tracking>/<YYYY-MM>.<person>.pdf                          the month
//   <tracking>/weekly/<YYYY-MM>/<first day>.<person>.pdf       each week in it
//
// A personal PDF is the person's, not one computer's: it merges the timesheet
// each of their computers keeps (`<YYYY-MM>.<person>.<computer>.md`).
//
// Every personal PDF has a team twin, the one that goes to the client. It
// merges every person's timesheet found in this folder into one, with no
// names and nothing that splits the work by person - the same task, of the
// same work type, on the same day is one row, its time summed and its bullets
// pooled:
//
//   <tracking>/client/<YYYY-MM>.pdf
//   <tracking>/client/weekly/<YYYY-MM>/<first day>.pdf
//
// It can only include the timesheets present in this checkout, so it names -
// in the terminal, never on the PDF - whose it merged and when each was last
// updated. A teammate's timesheet that has not been pulled is not in it.
//
// The markdown file is the input, so the PDF can never disagree with the ledger
// you read and correct. Printing goes through headless Chrome rather than a PDF
// library: it is already installed, it needs no dependency, and the HTML it
// prints is the same document a browser would show.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { formatDuration, weekdayOf } from "./blocks.mjs";
import {
  CACHE_DIR,
  TRACKING_DIR,
  currentPerson,
  loadConfig,
  logPath,
  monthFileIds,
  monthFilePath,
  personFileIds,
  projectName,
  splitFileId,
} from "./config.mjs";
import { isPlaceholder, needsBullets, needsType, parseMonthFile } from "./month-file.mjs";

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/microsoft-edge",
];

export function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  throw new Error(
    "No Chrome or Chromium found for PDF printing. Install Google Chrome, or set " +
      "CHROME_PATH to a Chromium-based browser binary. The month markdown is already " +
      "written either way - only the PDF needs a browser.",
  );
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function monthLabel(month) {
  const [year, index] = month.split("-").map(Number);
  const name = new Date(Date.UTC(year, index - 1, 1)).toLocaleString("en-GB", {
    month: "long",
    timeZone: "UTC",
  });
  return `${name} ${year}`;
}

/** `22 - 28 September 2026`, or across a month edge never, since weeks are split there. */
function weekLabel(start, end) {
  const [year, month, first] = start.split("-").map(Number);
  const last = Number(end.slice(8, 10));
  const name = new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-GB", {
    month: "long",
    timeZone: "UTC",
  });
  return first === last ? `${first} ${name} ${year}` : `${first} - ${last} ${name} ${year}`;
}

/** `Wed 26 Aug` - short enough to never wrap in a day heading. */
function dayLabel(date) {
  const [year, month, day] = date.split("-").map(Number);
  const name = new Date(Date.UTC(year, month - 1, day)).toLocaleString("en-GB", {
    month: "short",
    timeZone: "UTC",
  });
  return `${weekdayOf(date)} ${day} ${name}`;
}

/**
 * How much of a row was logged by hand. A personal row is all or nothing; a
 * client row merged from several people can be part of each, which is why the
 * merge carries `manualSeconds` rather than a flag.
 */
export function manualShare(task) {
  return task.manualSeconds ?? (task.manual ? task.seconds : 0);
}

/** `Manual`, `Partly manual`, or null - the tag the PDF prints after a task. */
export function manualTag(task) {
  const share = manualShare(task);
  if (share <= 0) return null;
  return share >= task.seconds ? "Manual" : "Partly manual";
}

/** Time per work type, largest first, with how much of it was manual. */
export function typeRollup(days) {
  const totals = new Map();
  for (const day of days) {
    for (const task of day.tasks) {
      const type = task.type || "Untyped";
      const entry = totals.get(type) ?? { type, seconds: 0, manualSeconds: 0 };
      entry.seconds += task.seconds;
      entry.manualSeconds += manualShare(task);
      totals.set(type, entry);
    }
  }
  return [...totals.values()].sort((a, b) => b.seconds - a.seconds || a.type.localeCompare(b.type));
}

/** The work-type and manual tags that follow a task name on the PDF. */
function tags(task) {
  const manual = manualTag(task);
  return (
    (task.type ? `<span class="tag">${escapeHtml(task.type)}</span>` : "") +
    (manual ? `<span class="tag manual">${manual}</span>` : "")
  );
}

/** Month-wide time per task name, largest first. */
function taskRollup(days) {
  const totals = new Map();
  for (const day of days) {
    for (const task of day.tasks) {
      totals.set(task.name, (totals.get(task.name) ?? 0) + task.seconds);
    }
  }
  return [...totals.entries()]
    .map(([name, seconds]) => ({ name, seconds }))
    .sort((a, b) => b.seconds - a.seconds);
}

/**
 * The PDF is what a client sees, so it carries the project, the month, the
 * days, the task names and the hours - and nothing else. No measurement
 * method, no idle cut-off, no multiplier, no timezone, no which-days-count.
 * Those are the contractor's own settings, they live in `config.json`, and
 * they do not belong on a document that gets sent onward. Do not reintroduce
 * a footer or a subtitle line explaining them.
 *
 * The same goes for who the timesheet belongs to: no person name and no email.
 * The id only ever reaches the file name.
 *
 * Under each task sit its outcome bullets - what the time delivered, in plain
 * words - so a reader sees the substance of the work, not just its label.
 * After its name sit its work type and, for hours logged by hand, a Manual
 * tag: the client sees up front which hours no transcript measured.
 */
function renderHtml(period, days) {
  const total = days.reduce((sum, day) => sum + day.seconds, 0);
  const rollup = taskRollup(days);
  const average = days.length > 0 ? total / days.length : 0;

  // One section per day rather than one table row per day. A day's total then
  // sits on its own heading line instead of floating at the top of a cell that
  // may run sixteen tasks deep, and a long day can break across pages without
  // stranding half a blank one behind it.
  const daySections = days
    .map((day) => {
      const rows = day.tasks
        .map(
          (task) =>
            `<div class="row${isPlaceholder(task.name) ? " unlabelled" : ""}">` +
            `<span class="name">${escapeHtml(task.name)}${tags(task)}</span>` +
            `<span class="dots"></span>` +
            `<span class="time mono">${formatDuration(task.seconds)}</span></div>` +
            (task.details?.length > 0
              ? `<ul class="details">${task.details.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
              : ""),
        )
        .join("");
      return `<section class="day">
        <div class="day-head">
          <span class="day-date">${dayLabel(day.date)}</span>
          <span class="day-total mono">${formatDuration(day.seconds)}</span>
        </div>
        ${rows}
      </section>`;
    })
    .join("");

  const typeRows = typeRollup(days)
    .map(
      (entry) => `<tr>
        <td>${escapeHtml(entry.type)}</td>
        <td class="mono right">${formatDuration(entry.seconds)}</td>
        <td class="mono right muted">${entry.manualSeconds > 0 ? formatDuration(entry.manualSeconds) : ""}</td>
      </tr>`,
    )
    .join("");

  const rollupRows = rollup
    .map((task) => {
      const unlabelled = isPlaceholder(task.name) ? " unlabelled" : "";
      return `<tr>
        <td class="${unlabelled.trim()}">${escapeHtml(task.name)}</td>
        <td class="mono right">${formatDuration(task.seconds)}</td>
      </tr>`;
    })
    .join("");

  const name = escapeHtml(projectName());

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${name} time tracking - ${period}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    color: #16181d; margin: 0; font-size: 10pt; line-height: 1.45;
    -webkit-font-smoothing: antialiased;
  }
  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 9pt; font-variant-numeric: tabular-nums; white-space: nowrap;
  }
  .right { text-align: right; }

  header { border-bottom: 1.5px solid #16181d; padding-bottom: 9px; margin-bottom: 16px; }
  h1 { font-size: 16pt; margin: 0 0 2px; letter-spacing: -0.015em; }
  .subtitle { color: #6b7280; font-size: 9.5pt; }

  .summary { display: flex; gap: 10px; margin: 0 0 6px; }
  .stat { flex: 1; background: #f6f7f9; border-radius: 5px; padding: 9px 12px; }
  .stat .value { font-size: 14pt; font-weight: 600; letter-spacing: -0.01em; }
  .stat .label {
    color: #6b7280; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.08em;
    margin-top: 1px;
  }

  h2 {
    font-size: 8.5pt; margin: 20px 0 0; text-transform: uppercase; letter-spacing: 0.09em;
    color: #6b7280; font-weight: 600; break-after: avoid;
  }

  /* A day is a heading line plus its tasks, so the total reads against the day
     it belongs to and every time lands in one right-hand column. */
  .day { margin-top: 12px; }
  .day-head {
    display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
    border-bottom: 1px solid #d6d9df; padding-bottom: 4px; margin-bottom: 5px;
    break-after: avoid;
  }
  .day-date { font-weight: 600; font-size: 10.5pt; letter-spacing: -0.01em; }
  .day-total { font-weight: 600; font-size: 9.5pt; }
  .row {
    display: flex; align-items: baseline; gap: 6px; padding: 2.5px 0; break-inside: avoid;
  }
  /* Leaders carry the eye from a short task name to its time without ruling a
     full-width border under every row. */
  .dots {
    flex: 1; border-bottom: 1px dotted #c8ccd4; transform: translateY(-2px); min-width: 12px;
  }
  .row .name { color: #2b2f38; }
  .row .time { color: #16181d; }
  .row.unlabelled .name { color: #9a3412; font-style: italic; }
  /* Outcome bullets sit under their task, indented and a step quieter, so the
     name and time still read as the row and the list reads as its substance. */
  .details {
    margin: 0 0 4px; padding: 0 0 0 14px; color: #4b5260; font-size: 9pt;
    line-height: 1.4; break-inside: avoid; break-before: avoid;
  }
  .details li { margin: 1px 0; padding-left: 2px; }
  .details li::marker { color: #9aa1ad; }

  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th {
    text-align: left; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.08em;
    color: #6b7280; border-bottom: 1px solid #d6d9df; padding: 0 0 4px; font-weight: 600;
  }
  td { padding: 4px 0; border-bottom: 1px solid #eef0f3; vertical-align: middle; }
  tr { break-inside: avoid; }
  td.right, th.right { padding-left: 10px; width: 1%; white-space: nowrap; }
  .unlabelled { color: #9a3412; font-style: italic; }
  .muted { color: #6b7280; }

  /* The work type and the manual marker ride after the task name, small and
     quiet, so the name still reads first and the row stays one line. */
  .tag {
    display: inline-block; margin-left: 6px; padding: 0 5px; border-radius: 3px;
    font-size: 7pt; text-transform: uppercase; letter-spacing: 0.07em; font-weight: 600;
    color: #6b7280; background: #f1f2f5; vertical-align: 1px; white-space: nowrap;
  }
  .tag.manual { color: #92400e; background: #fcf1e3; }

  .grand {
    display: flex; justify-content: space-between; align-items: baseline;
    border-top: 1.5px solid #16181d; margin-top: 10px; padding-top: 7px;
    font-weight: 600; break-inside: avoid;
  }
</style>
</head>
<body>
<header>
  <h1>${name} - time tracking</h1>
  <div class="subtitle">${period}</div>
</header>

<div class="summary">
  <div class="stat"><div class="value">${formatDuration(total)}</div><div class="label">Total</div></div>
  <div class="stat"><div class="value">${days.length}</div><div class="label">Tracked days</div></div>
  <div class="stat"><div class="value">${formatDuration(average)}</div><div class="label">Average day</div></div>
</div>

<h2>Daily breakdown</h2>
${daySections}
<div class="grand"><span>Total</span><span class="mono">${formatDuration(total)}</span></div>

<h2>By type</h2>
<table>
  <thead><tr><th>Type</th><th class="right">Time</th><th class="right">Manual</th></tr></thead>
  <tbody>${typeRows}</tbody>
</table>

<h2>By task</h2>
<table>
  <thead><tr><th>Task</th><th class="right">Time</th></tr></thead>
  <tbody>${rollupRows}</tbody>
</table>

</body>
</html>
`;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Above this, a merged day on the client PDF reads as more than one person. */
const LONG_DAY_SECONDS = 12 * 60 * 60;

function addDays(day, count) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + count * DAY_MS).toISOString().slice(0, 10);
}

function monthEnd(month) {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year, index, 0)).toISOString().slice(0, 10);
}

/** Monday to Sunday around `day`, then cut to `month` so no week spans two. */
function weekIn(day, month) {
  const offset = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
  const monday = addDays(day, -offset);
  const sunday = addDays(monday, 6);
  const first = `${month}-01`;
  const last = monthEnd(month);
  return { start: monday < first ? first : monday, end: sunday > last ? last : sunday };
}

/** Every Monday-to-Sunday week of a month, split at its edges. */
function weeksOf(month) {
  const weeks = [];
  for (let day = `${month}-01`; day <= monthEnd(month); ) {
    const week = weekIn(day, month);
    weeks.push(week);
    day = addDays(week.end, 1);
  }
  return weeks;
}

function parseArgs(config) {
  const args = process.argv.slice(2);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const allWeeks = args.includes("--all-weeks");

  const monthFlag = args.indexOf("--month");
  if (monthFlag !== -1 && args[monthFlag + 1]) {
    const month = args[monthFlag + 1];
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error(`--month expects YYYY-MM, got ${month}`);
    return { month, today, explicit: true, allWeeks };
  }

  if (args.includes("--last-month")) {
    const [year, month] = today.split("-").map(Number);
    const previous = new Date(Date.UTC(year, month - 2, 1));
    return {
      month: `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`,
      today,
      explicit: true,
      allWeeks,
    };
  }
  return { month: today.slice(0, 7), today, explicit: false, allWeeks };
}

/**
 * Which PDFs this run writes.
 *
 * The routine run is the month so far and the week so far. When the current
 * week began in last month, last month's share of it - and last month itself -
 * are written too: the last days of a month are usually named on the first
 * update of the next, and without this they would never reach a PDF.
 */
function plan(args, id) {
  const jobs = [];
  const monthJob = (month) => ({
    kind: "month",
    month,
    start: `${month}-01`,
    end: monthEnd(month),
    period: monthLabel(month),
    pdf: path.join(TRACKING_DIR, `${month}.${id}.pdf`),
    html: path.join(CACHE_DIR, `${month}.${id}.html`),
  });
  const weekJob = (month, week) => ({
    kind: "week",
    month,
    ...week,
    period: `Week of ${weekLabel(week.start, week.end)}`,
    pdf: path.join(TRACKING_DIR, "weekly", month, `${week.start}.${id}.pdf`),
    html: path.join(CACHE_DIR, `${week.start}.${id}.week.html`),
  });

  if (args.explicit) {
    jobs.push(monthJob(args.month));
    if (args.allWeeks) for (const week of weeksOf(args.month)) jobs.push(weekJob(args.month, week));
    return withTeam(jobs);
  }

  const current = args.today.slice(0, 7);
  const monday = addDays(args.today, -((new Date(`${args.today}T00:00:00Z`).getUTCDay() + 6) % 7));
  const spill = monday.slice(0, 7);
  if (spill !== current && personFileIds(spill, id).length > 0) {
    jobs.push(monthJob(spill), weekJob(spill, weekIn(monday, spill)));
  }
  jobs.push(monthJob(current));
  if (args.allWeeks) for (const week of weeksOf(current)) jobs.push(weekJob(current, week));
  else jobs.push(weekJob(current, weekIn(args.today, current)));
  return withTeam(jobs);
}

/** The client PDF for each personal one: same range, everyone merged. */
function withTeam(jobs) {
  const team = jobs.map((job) => ({
    ...job,
    team: true,
    pdf:
      job.kind === "month"
        ? path.join(TRACKING_DIR, "client", `${job.month}.pdf`)
        : path.join(TRACKING_DIR, "client", "weekly", job.month, `${job.start}.pdf`),
    html: path.join(CACHE_DIR, `${job.start}.client.${job.kind}.html`),
  }));
  return [...jobs, ...team];
}

/**
 * A task row that is about keeping the timesheet rather than about the
 * project - "Timesheet update", "Hours recorded and named", "Tracker fixes".
 * Time spent updating the tracker is left out at measurement and the
 * labeller is told never to write such a row; this is the safety net under
 * both, so one never reaches a client whatever an older month holds.
 */
const TRACKER_ROW =
  /\b(?:time\s*sheet|time[\s-]*track(?:er|ing)?|tracker|hours\s+(?:recorded|named|logged|labell?ed)|(?:recorded|named)\s+and\s+(?:named|recorded))\b/i;

export function isTrackerRow(name) {
  return TRACKER_ROW.test(name);
}

/**
 * Drop the timesheet rows from each day and keep the day's total equal to
 * the rows that remain. A day with nothing else in it is dropped whole: the
 * client did not buy an hour of bookkeeping.
 */
export function withoutTrackerRows(days) {
  const kept = [];
  for (const day of days) {
    const tasks = day.tasks.filter((task) => !isTrackerRow(task.name));
    if (tasks.length === day.tasks.length) {
      kept.push(day);
      continue;
    }
    if (tasks.length === 0) continue;
    kept.push({ ...day, tasks, seconds: tasks.reduce((sum, task) => sum + task.seconds, 0) });
  }
  return kept;
}

/** One computer's recorded days for a month, or null when it has no timesheet. */
function readDays(month, id) {
  const file = monthFilePath(month, id);
  return existsSync(file) ? withoutTrackerRows(parseMonthFile(readFileSync(file, "utf8")).days) : null;
}

/** `ann on laptop-1a2b`, or just `ann` for a timesheet from before computers had names. */
export function whose(id) {
  const { person, machine } = splitFileId(id);
  return machine ? `${person} on ${machine}` : person;
}

/**
 * One person's timesheet for a PDF: every one of their computers' days, merged
 * the way the client PDF merges people. A single computer's days pass through
 * untouched, rows in the order they were written.
 *
 * A day still unnamed on another computer stops it: only that computer holds
 * the transcripts to name it, and leaving its hours out would under-report
 * without a word. This computer's own unnamed days are left for the usual
 * check, which tells the person to name them here.
 *
 * `entries` is `[{ id, days }]`, already cut to the PDF's range.
 */
export function personalDays(entries, ownId) {
  const unnamed = entries
    .filter((entry) => entry.id !== ownId)
    .flatMap((entry) =>
      entry.days
        .filter((day) => day.tasks.some((task) => isPlaceholder(task.name)))
        .map((day) => `${day.date} on ${splitFileId(entry.id).machine ?? "the older shared timesheet"}`),
    );
  if (unnamed.length > 0) {
    throw new Error(
      `still unnamed: ${unnamed.join(", ")}. Run "update tracker" on that computer, then commit ` +
        "and push its timesheet and pull it here.",
    );
  }
  return entries.length === 1 ? entries[0].days : mergeDays(entries.map((entry) => entry.days));
}

/**
 * Fold several people's days into one timesheet that does not show how many
 * people there were.
 *
 * Days are unioned and their hours summed. Within a day, tasks of the same
 * name and the same work type become one row - time summed, bullets pooled
 * with exact repeats dropped - so two people on "Checkout flow" read as one
 * piece of work. The same name under two types stays two rows, so every row
 * keeps one true type. A row merged from manual and measured time is tagged
 * "Partly manual" through its `manualSeconds`. Nothing about who did what
 * survives the merge.
 */
export function mergeDays(lists) {
  const byDate = new Map();
  for (const days of lists) {
    for (const day of days) {
      const merged = byDate.get(day.date) ?? { date: day.date, seconds: 0, tasks: [] };
      merged.seconds += day.seconds;
      for (const task of day.tasks) {
        const type = task.type ?? null;
        const existing = merged.tasks.find((row) => row.name === task.name && row.type === type);
        if (!existing) {
          merged.tasks.push({
            name: task.name,
            type,
            seconds: task.seconds,
            manualSeconds: manualShare(task),
            details: [...(task.details ?? [])],
          });
          continue;
        }
        existing.seconds += task.seconds;
        existing.manualSeconds += manualShare(task);
        for (const item of task.details ?? []) {
          if (!existing.details.includes(item)) existing.details.push(item);
        }
      }
      byDate.set(day.date, merged);
    }
  }
  // Longest first, name as tie-break: an order that depends only on the work,
  // never on whose timesheet happened to be read first.
  for (const day of byDate.values()) {
    day.tasks.sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name));
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** When each person last ran an update, for the terminal note - never the PDF. */
function lastUpdate(id) {
  try {
    const lines = readFileSync(logPath(id), "utf8").split("\n").filter((line) => line.trim());
    return JSON.parse(lines[lines.length - 1]).at ?? null;
  } catch {
    return null;
  }
}

/**
 * The days a PDF covers. A personal PDF reads the person's own timesheets -
 * one per computer - and merges them; the client PDF reads everyone's and
 * merges them. Unnamed days are found before the merge, so the terminal can
 * say whose they are, and on which computer.
 */
function daysFor(job, person) {
  const inRange = (days) => days.filter((day) => day.date >= job.start && day.date <= job.end);
  const hasPlaceholder = (day) => day.tasks.some((task) => isPlaceholder(task.name));

  if (!job.team) {
    const ids = personFileIds(job.month, person.id);
    if (ids.length === 0) {
      throw new Error(
        `No timesheet for ${job.month}. Run \`node ${path.join(TRACKING_DIR, "engine", "collect.mjs")}\` first.`,
      );
    }
    try {
      return personalDays(
        ids.map((id) => ({ id, days: inRange(readDays(job.month, id)) })),
        person.fileId,
      );
    } catch (error) {
      throw new Error(`No PDF for ${job.period} - ${error.message}`);
    }
  }

  const lists = [];
  const unnamed = [];
  for (const other of monthFileIds(job.month)) {
    const days = inRange(readDays(job.month, other));
    for (const day of days.filter(hasPlaceholder)) unnamed.push(`${whose(other)} ${day.date}`);
    lists.push(days);
  }
  if (unnamed.length > 0) {
    // A teammate's unnamed day can only be named on their machine, from their
    // evidence - so say whose it is. The client PDF waits for it rather than
    // leaving their hours out, which would under-bill without a word.
    throw new Error(
      `No client PDF for ${job.period} - still unnamed: ${unnamed.join(", ")}. ` +
        "Each person names their own days with \"update tracker\", then commits and pushes their timesheet.",
    );
  }
  const days = mergeDays(lists);
  // The one thing a merge cannot hide is a day longer than one person could
  // work. Say so here, where only the sender sees it, and leave the choice of
  // whether to send to them - trimming hours to disguise it would misbill.
  const long = days.filter((day) => day.seconds > LONG_DAY_SECONDS);
  if (long.length > 0 && job.kind === "month") {
    console.warn(
      `Note: ${long.map((day) => `${day.date} (${formatDuration(day.seconds)})`).join(", ")} - ` +
        "over 12 hours in one day on the client PDF, which a reader may take as more than one person.",
    );
  }
  return days;
}

/** Write one PDF, or say why not. Returns a line for the summary. */
function render(job, person) {
  const days = daysFor(job, person);
  if (days.length === 0) {
    // A week with no tracked days is not a failure - there is simply nothing
    // to bill - but a month with none is, since it was asked for by name.
    if (job.kind === "week") return `${job.period}: no tracked days, no PDF.`;
    throw new Error(`${job.month} has no recorded days.`);
  }

  // The PDF is the client-facing artefact, so a placeholder must never reach
  // it. There is deliberately no --force: a document that can be sent onward
  // cannot be allowed to say "In progress" where a task name belongs. Naming
  // the days is the fix, and it is what the time-tracker skill's labelling
  // pass does. Only the days inside this PDF's own range count.
  const unnamed = days.filter((day) => day.tasks.some((task) => isPlaceholder(task.name)));
  if (unnamed.length > 0) {
    throw new Error(
      `No PDF for ${job.period} - still unnamed: ` +
        `${unnamed.map((day) => day.date).join(", ")}. ` +
        "Label them first (time-tracker skill, labelling pass), then run this again.",
    );
  }

  // Missing bullets thin the report but do not falsify it, so unlike a
  // placeholder they warn rather than block - an older month named before
  // bullets existed must still render. Said once, on the month.
  const bare = days.filter((day) => day.tasks.some(needsBullets));
  if (bare.length > 0 && job.kind === "month" && !job.team) {
    console.warn(
      `Warning: ${bare.map((day) => day.date).join(", ")} ${bare.length === 1 ? "has" : "have"} ` +
        "tasks with no outcome bullets. \"update tracker\" writes them.",
    );
  }
  // A missing work type is the same kind of gap: the task still shows, it
  // just lands under "Untyped" in the By type table.
  const untyped = days.filter((day) => day.tasks.some(needsType));
  if (untyped.length > 0 && job.kind === "month" && !job.team) {
    console.warn(
      `Warning: ${untyped.map((day) => day.date).join(", ")} ${untyped.length === 1 ? "has" : "have"} ` +
        "tasks with no work type. \"update tracker\" adds them.",
    );
  }

  if (job.kind === "month" && !job.team) {
    for (const day of days) {
      const tasked = day.tasks.reduce((sum, task) => sum + task.seconds, 0);
      if (Math.abs(tasked - day.seconds) >= 60) {
        console.warn(
          `Warning: ${day.date} task rows total ${formatDuration(tasked)} but the day is ` +
            `${formatDuration(day.seconds)}. Re-run the collector to reconcile.`,
        );
      }
    }
  }

  mkdirSync(CACHE_DIR, { recursive: true });
  mkdirSync(path.dirname(job.pdf), { recursive: true });
  writeFileSync(job.html, renderHtml(job.period, days));

  execFileSync(
    findChrome(),
    [
      "--headless",
      "--disable-gpu",
      "--no-pdf-header-footer",
      `--print-to-pdf=${job.pdf}`,
      new URL(`file://${job.html}`).href,
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );

  const total = days.reduce((sum, day) => sum + day.seconds, 0);
  const count = days.length;
  return (
    `${path.relative(process.cwd(), job.pdf)} - ${formatDuration(total)}, ` +
    `${count} tracked ${count === 1 ? "day" : "days"}.`
  );
}

function main() {
  const config = loadConfig();
  const person = currentPerson(config);
  const args = parseArgs(config);

  // Each PDF stands alone: an unnamed day in last month's tail must not stop
  // this week's PDF from being written. Every failure is still reported, and
  // still fails the run.
  const jobs = plan(args, person.id);

  // Whose timesheets the PDFs merge, and how fresh each is - per computer, so
  // a stale laptop shows up. Terminal only: the PDF itself never says how many
  // people, or computers, there were.
  const months = [...new Set(jobs.filter((job) => job.team).map((job) => job.month))];
  for (const month of months) {
    const ids = monthFileIds(month);
    const others = ids.filter((id) => id !== person.fileId);
    const notes = others.map((id) => {
      const { person: owner, machine } = splitFileId(id);
      const label = owner === person.id ? `your ${machine ?? "older shared timesheet"}` : whose(id);
      return `${label} (last update ${lastUpdate(id) ?? "never"})`;
    });
    console.log(
      `Client PDF for ${month} merges ${ids.length} timesheet${ids.length === 1 ? "" : "s"}` +
        (others.length > 0 ? `: yours on ${person.machine}, ${notes.join(", ")}.` : ": yours only.") +
        " Pull first to include the latest from teammates and your other computers.",
    );
  }

  let failed = false;
  for (const job of jobs) {
    try {
      console.log(render(job, person));
    } catch (error) {
      failed = true;
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
  if (failed) process.exit(1);
}

// Every failure here is an ordinary, actionable condition - an unnamed day, a
// month with no timesheet, no browser installed - so it prints as a sentence
// rather than a stack trace. The exit code still marks it as a failure.
// Guarded so the pure parts above can be imported by tests without a run.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
