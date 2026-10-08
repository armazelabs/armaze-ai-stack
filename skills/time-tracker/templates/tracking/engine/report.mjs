// Render the timesheets to PDF.
//
// Run with `node <tracking>/engine/report.mjs`. With no flags - what "update
// tracker" runs - it writes the current month's PDF and the current week's.
// `--month 2026-08` / `--last-month` write one specific month instead, and
// `--all-weeks` adds every week of whichever month is being written.
//
// Weeks run Monday to Sunday, whole: the week of 28 September - 4 October is
// one PDF, with days from both months in it. A month's PDF carries a table of
// every week that touches it, then its days grouped under those weeks.
//
// Every PDF comes twice. The computer's own:
//
//   <tracking>/<YYYY-MM>.<computer>.pdf                    the month
//   <tracking>/weekly/<first day>.<computer>.pdf           each week
//
// which shows this computer's hours, when each task happened and in which
// session - and the client's, the one to send:
//
//   <tracking>/client/<YYYY-MM>.pdf
//   <tracking>/client/weekly/<first day>.pdf
//
// The client PDF merges every computer's timesheet found in this folder into
// one, with no names, no computers, no sessions and no clock times - nothing
// that splits the work by who or where. The same task, of the same work type,
// on the same day is one row, its time summed and its bullets pooled.
//
// Both show the project's hour budget for their span: hours done, hours left
// and the total, from every timesheet here (budget.mjs). Unnamed time is
// shown, as "Research & exploration", rather than holding a PDF back: it is
// real time, and the update that names it is one "update tracker" away.
//
// A PDF can only include the timesheets present in this checkout, so it says
// - in the terminal, never on the PDF - whose it merged and when each was last
// updated. A computer's timesheet that has not been pulled is not in it.
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
  computerLabel,
  currentComputer,
  loadConfig,
  logPath,
  monthFileIds,
  monthFilePath,
  monthOf,
  projectName,
} from "./config.mjs";
import {
  addDays,
  budgetCaps,
  capsOn,
  exceptionNotes,
  monthEnd,
  recordedDays,
  spanFigures,
  spanSeconds,
  weekOf,
  weekCaps,
  weekRows,
  weeksOverlapping,
} from "./budget.mjs";
import {
  FALLBACK_NAME,
  FALLBACK_TYPE,
  isPlaceholder,
  needsBullets,
  needsType,
  parseMonthFile,
  withoutTrackerRows,
} from "./month-file.mjs";

export { isTrackerRow, withoutTrackerRows } from "./month-file.mjs";

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
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthLabel(month) {
  const [year, index] = month.split("-").map(Number);
  return `${MONTH_NAMES[index - 1]} ${year}`;
}

/**
 * `5 - 11 October 2026`, `28 September - 4 October 2026`, or across a year
 * `28 December 2026 - 3 January 2027`.
 */
export function weekLabel(start, end) {
  const [startYear, startMonth, first] = start.split("-").map(Number);
  const [endYear, endMonth, last] = end.split("-").map(Number);
  const endName = `${MONTH_NAMES[endMonth - 1]} ${endYear}`;
  if (startYear !== endYear) return `${first} ${MONTH_NAMES[startMonth - 1]} ${startYear} - ${last} ${endName}`;
  if (startMonth !== endMonth) return `${first} ${MONTH_NAMES[startMonth - 1]} - ${last} ${endName}`;
  return first === last ? `${first} ${endName}` : `${first} - ${last} ${endName}`;
}

/** `5 - 11 Oct`, `28 Sep - 4 Oct` - the short form for the week table. */
function shortSpan(start, end) {
  const [, startMonth, first] = start.split("-").map(Number);
  const [, endMonth, last] = end.split("-").map(Number);
  const name = (index) => MONTH_NAMES[index - 1].slice(0, 3);
  if (start === end) return `${first} ${name(startMonth)}`;
  return startMonth === endMonth
    ? `${first} - ${last} ${name(endMonth)}`
    : `${first} ${name(startMonth)} - ${last} ${name(endMonth)}`;
}

/** `Wed 26 Aug` - short enough to never wrap in a day heading. */
function dayLabel(date) {
  const [, month, day] = date.split("-").map(Number);
  return `${weekdayOf(date)} ${day} ${MONTH_NAMES[month - 1].slice(0, 3)}`;
}

/**
 * How much of a row was logged by hand. A computer's own row is all or
 * nothing; a client row merged from several computers can be part of each,
 * which is why the merge carries `manualSeconds` rather than a flag.
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

/** Span-wide time per task name, largest first. */
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
 * The days as a PDF shows them: an unnamed row becomes "Research &
 * exploration", typed Research, with no bullets, and keeps its time, its
 * clock times and its sessions. Totals do not change. Returns the dates that
 * had one, for the terminal.
 */
export function presentDays(days) {
  const unnamed = [];
  const presented = days.map((day) => {
    if (!day.tasks.some((task) => isPlaceholder(task.name))) return day;
    unnamed.push(day.date);
    return {
      ...day,
      tasks: day.tasks.map((task) =>
        isPlaceholder(task.name)
          ? { ...task, name: FALLBACK_NAME, type: FALLBACK_TYPE, details: [], fallback: true }
          : task,
      ),
    };
  });
  return { days: presented, unnamed };
}

/**
 * A day's tasks grouped by work type: the config's categories in their own
 * order, then any other type alphabetically, then untyped work. Within a
 * type, tasks with clock times run in the order they happened, and the rest
 * follow in the order they were written.
 */
export function groupByType(tasks, categories = []) {
  const groups = new Map();
  for (const task of tasks) {
    const type = task.type || null;
    const group = groups.get(type) ?? { type, seconds: 0, tasks: [] };
    group.seconds += task.seconds;
    group.tasks.push(task);
    groups.set(type, group);
  }
  const rank = (type) => {
    if (type === null) return [2, ""];
    const index = categories.indexOf(type);
    return index === -1 ? [1, type] : [0, String(index).padStart(4, "0")];
  };
  const startOf = (task) => task.when?.[0]?.start ?? null;
  return [...groups.values()]
    .sort((a, b) => {
      const [ra, ka] = rank(a.type);
      const [rb, kb] = rank(b.type);
      return ra - rb || ka.localeCompare(kb);
    })
    .map((group) => ({
      ...group,
      tasks: group.tasks
        .map((task, index) => ({ task, index }))
        .sort((a, b) => {
          const sa = startOf(a.task);
          const sb = startOf(b.task);
          if (sa && sb) return sa.localeCompare(sb) || a.index - b.index;
          if (sa || sb) return sa ? -1 : 1;
          return a.index - b.index;
        })
        .map(({ task }) => task),
    }));
}

/**
 * The line under a task on a computer's own PDF: when it happened, on which
 * computer, in which session - `09:10-11:20 · studio · "fix checkout bug"`.
 * A manual row says so instead of a session. Never called for the client PDF.
 */
export function spanText(task, day, computer) {
  const parts = [];
  if (task.when?.length > 0) parts.push(task.when.map((range) => `${range.start}-${range.end}`).join(", "));
  parts.push(computer);
  if (task.manual) {
    parts.push(
      task.givenSeconds != null ? `manual, ${formatDuration(task.givenSeconds)} given` : "manual",
    );
  } else if (task.sessions?.length > 0) {
    const legend = new Map((day.sessions ?? []).map((session) => [session.ref, session.label]));
    parts.push(task.sessions.map((ref) => `"${legend.get(ref) ?? `session ${ref}`}"`).join(" / "));
  }
  return parts.join(" · ");
}

/**
 * Fold several computers' days into one timesheet that does not show how
 * many there were.
 *
 * Days are unioned and their hours summed. Within a day, tasks of the same
 * name and the same work type become one row - time summed, bullets pooled
 * with exact repeats dropped - so two computers on "Checkout flow" read as one
 * piece of work. The same name under two types stays two rows, so every row
 * keeps one true type. A row merged from manual and measured time is tagged
 * "Partly manual" through its `manualSeconds`. Clock times, sessions and the
 * session legend are dropped: nothing about who or where survives the merge.
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

/** `{ value, label }` for the stat boxes at the top of a PDF. */
function stat(value, label) {
  return { value, label };
}

/** The left-or-over box: a budget gone past is said as such, never as a negative. */
function leftStat(left, label) {
  return left >= 0 ? stat(formatDuration(left), label) : stat(formatDuration(-left), "Over budget by");
}

/**
 * The stat boxes for a PDF. With a budget: done, left and the total for the
 * span - and on a computer's own PDF its own hours first, beside the
 * project's. Without one: the total, the days and the average day.
 */
export function statsFor({ kind, own, figures, total, dayCount }) {
  const average = dayCount > 0 ? total / dayCount : 0;
  if (!figures || figures.cap == null) {
    return [
      stat(formatDuration(total), own ? "This computer" : "Total"),
      stat(String(dayCount), "Tracked days"),
      stat(formatDuration(average), "Average day"),
    ];
  }
  const span = kind === "week" ? "week" : "month";
  if (own) {
    return kind === "week"
      ? [
          stat(formatDuration(total), "This computer"),
          stat(`${formatDuration(figures.done)} of ${formatDuration(figures.cap)}`, "Project done"),
          leftStat(figures.left, "Project left"),
        ]
      : [
          stat(formatDuration(total), "This computer"),
          stat(formatDuration(figures.done), "Project done"),
          leftStat(figures.left, "Remaining"),
          stat(formatDuration(figures.cap), "Month total"),
        ];
  }
  return [
    stat(formatDuration(figures.done), kind === "week" ? "Done this week" : "Done so far"),
    leftStat(figures.left, "Remaining"),
    stat(formatDuration(figures.cap), `${span[0].toUpperCase()}${span.slice(1)} total`),
  ];
}

/** `28-30 Sep (24h) are on September's timesheet.` - for a week crossing the month's edge. */
function edgeNote(edge, label) {
  if (!edge || edge.seconds <= 0) return "";
  const [, month] = edge.start.split("-").map(Number);
  return (
    `${shortSpan(edge.start, edge.end)} (${formatDuration(edge.seconds)}) ` +
    `${edge.start === edge.end ? "is" : "are"} on ${MONTH_NAMES[month - 1]}'s ${label}.`
  );
}

function dayHtml(day, view) {
  const groups = groupByType(day.tasks, view.categories);
  const rows = groups
    .map((group) => {
      const tasks = group.tasks
        .map((task) => {
          const manual = manualTag(task);
          const span = view.computer ? spanText(task, day, view.computer) : null;
          return (
            `<div class="row${task.fallback ? " fallback" : ""}">` +
            `<span class="name">${escapeHtml(task.name)}` +
            (manual ? `<span class="tag manual">${manual}</span>` : "") +
            `</span><span class="dots"></span>` +
            `<span class="time mono">${formatDuration(task.seconds)}</span></div>` +
            (span ? `<div class="span">${escapeHtml(span)}</div>` : "") +
            (task.details?.length > 0
              ? `<ul class="details">${task.details.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
              : "")
          );
        })
        .join("");
      return (
        `<div class="type-head"><span>${escapeHtml(group.type ?? "Untyped")}</span>` +
        `<span class="mono">${formatDuration(group.seconds)}</span></div>${tasks}`
      );
    })
    .join("");
  return `<section class="day">
    <div class="day-head">
      <span class="day-date">${dayLabel(day.date)}</span>
      <span class="day-total mono">${formatDuration(day.seconds)}</span>
    </div>
    ${rows}
  </section>`;
}

/** A week's hours for the table: an empty week reads `0h`, not `0m`. */
function hours(seconds) {
  return Math.round(seconds / 60) === 0 ? "0h" : formatDuration(seconds);
}

function weekTableHtml(view) {
  const budget = view.weeks.some((row) => row.cap != null);
  const own = view.computer != null;
  const head =
    "<tr><th>Week</th><th>Dates</th><th class=\"right\">Done</th>" +
    (own ? '<th class="right">This computer</th>' : "") +
    (budget ? '<th class="right">Cap</th><th class="right">Left</th>' : "") +
    "</tr>";
  const body = view.weeks
    .map((row) => {
      const upcoming = row.start > view.today;
      const current = row.start <= view.today && view.today <= row.end;
      const left =
        row.left == null ? "" : row.left >= 0 ? formatDuration(row.left) : `${formatDuration(-row.left)} over`;
      return (
        `<tr class="${current ? "current" : ""}${upcoming ? " upcoming" : ""}">` +
        `<td class="mono">${row.n}</td>` +
        `<td>${shortSpan(row.start, row.end)}${current ? '<span class="tag">This week</span>' : ""}` +
        `${upcoming ? '<span class="tag soft">Upcoming</span>' : ""}</td>` +
        `<td class="mono right">${hours(row.done)}</td>` +
        (own ? `<td class="mono right">${hours(row.own ?? 0)}</td>` : "") +
        (budget
          ? `<td class="mono right muted">${formatDuration(row.cap)}</td><td class="mono right">${left}</td>`
          : "") +
        "</tr>"
      );
    })
    .join("");
  const crosses = view.weeks.some((row) => row.before || row.after);
  const note = [
    crosses
      ? "Each week counts Monday to Sunday in full, including its days in the next or previous month, " +
        "so the weeks need not add up to the month total."
      : "",
    budget && view.monthCap != null
      ? `A week may use a quarter of the month's ${formatDuration(view.monthCap)}; the month total is the ceiling for all of them.`
      : budget
        ? "Each week may use the cap beside it; this month has no overall cap."
        : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `<h2>Weeks</h2>
<table class="weeks">
  <thead>${head}</thead>
  <tbody>${body}</tbody>
</table>
${note ? `<p class="note">${note}</p>` : ""}`;
}

function weekSectionsHtml(view) {
  return view.weeks
    .map((row) => {
      const days = view.days.filter((day) => day.date >= row.start && day.date <= row.end);
      if (days.length === 0) return "";
      const subtotal = days.reduce((sum, day) => sum + day.seconds, 0);
      const crosses = row.before || row.after;
      const notes = [edgeNote(row.beforeNote, view.edgeLabel), edgeNote(row.afterNote, view.edgeLabel)]
        .filter(Boolean)
        .join(" ");
      return `<div class="week-head">
    <span>Week ${row.n} · ${shortSpan(row.start, row.end)}</span>
    <span class="mono">${crosses ? '<span class="muted">this month</span> ' : ""}${formatDuration(subtotal)}</span>
  </div>
  ${notes ? `<p class="note">${notes}</p>` : ""}
  ${days.map((day) => dayHtml(day, view)).join("")}`;
    })
    .join("");
}

/**
 * The PDF is what a client sees, so it carries the project, the span, the
 * hour budget, the days, the task names and the hours - and nothing else. No
 * measurement method, no idle cut-off, no multiplier, no timezone, no
 * which-days-count. Those are the contractor's own settings, they live in
 * `config.json`, and they do not belong on a document that gets sent onward.
 * Do not reintroduce a footer or a subtitle line explaining them.
 *
 * The client view never names a computer and never carries clock times or
 * sessions - `view.computer` is null for it, and the merge has already dropped
 * them. A computer's own view names it once, in the subtitle, and prints when
 * and in which session each task happened under the task.
 *
 * Within each day the tasks are grouped by work type, each type with its
 * subtotal; under each task sit its outcome bullets and, for hours logged by
 * hand, a Manual tag - the client sees up front which hours no transcript
 * measured.
 *
 * The one exception is `view.notices`: the notes the person wrote on a
 * `budgetExceptions` entry in config.json, printed under the heading of every
 * PDF whose span touches it, because a budget that changed mid-month needs
 * saying to whoever reads the figures. They are the person's own words; the
 * engine never writes one.
 *
 * `view` is `{ project, period, kind, today, days, categories, stats,
 * computer, weeks, monthCap, edgeLabel, notices }`; `weeks` only for a month.
 */
export function renderHtml(view) {
  const total = view.days.reduce((sum, day) => sum + day.seconds, 0);
  const average = view.days.length > 0 ? total / view.days.length : 0;
  const name = escapeHtml(view.project);

  const typeRows = typeRollup(view.days)
    .map(
      (entry) => `<tr>
        <td>${escapeHtml(entry.type)}</td>
        <td class="mono right">${formatDuration(entry.seconds)}</td>
        <td class="mono right muted">${entry.manualSeconds > 0 ? formatDuration(entry.manualSeconds) : ""}</td>
      </tr>`,
    )
    .join("");
  const taskRows = taskRollup(view.days)
    .map(
      (task) => `<tr>
        <td>${escapeHtml(task.name)}</td>
        <td class="mono right">${formatDuration(task.seconds)}</td>
      </tr>`,
    )
    .join("");
  const stats = view.stats
    .map((entry) => `<div class="stat"><div class="value">${escapeHtml(entry.value)}</div><div class="label">${escapeHtml(entry.label)}</div></div>`)
    .join("");
  const breakdown = view.weeks ? weekSectionsHtml(view) : view.days.map((day) => dayHtml(day, view)).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${name} time tracking - ${escapeHtml(view.period)}</title>
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
  .muted { color: #6b7280; }

  header { border-bottom: 1.5px solid #16181d; padding-bottom: 9px; margin-bottom: 16px; }
  h1 { font-size: 16pt; margin: 0 0 2px; letter-spacing: -0.015em; }
  .subtitle { color: #6b7280; font-size: 9.5pt; }

  .summary { display: flex; gap: 10px; margin: 0 0 4px; }
  .stat { flex: 1; background: #f6f7f9; border-radius: 5px; padding: 9px 12px; }
  .stat .value { font-size: 14pt; font-weight: 600; letter-spacing: -0.01em; }
  .stat .label {
    color: #6b7280; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.08em;
    margin-top: 1px;
  }
  .summary-line { color: #6b7280; font-size: 8.5pt; margin: 0 0 4px; }

  h2 {
    font-size: 8.5pt; margin: 20px 0 0; text-transform: uppercase; letter-spacing: 0.09em;
    color: #6b7280; font-weight: 600; break-after: avoid;
  }
  .note { color: #6b7280; font-size: 8pt; margin: 5px 0 0; line-height: 1.4; }
  .notice {
    font-size: 9pt; line-height: 1.45; margin: 12px 0 0; padding: 7px 10px;
    border-left: 2px solid #16181d; background: #f6f7f9;
  }

  /* A week of a month: a band with its subtotal, the days beneath it. */
  .week-head {
    display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
    margin-top: 16px; padding: 5px 8px; background: #16181d; color: #fff; border-radius: 4px;
    font-size: 8.5pt; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em;
    break-after: avoid;
  }
  .week-head .mono { color: #fff; }
  .week-head .muted { color: #b6bcc7; text-transform: none; letter-spacing: 0; font-weight: 400; }

  /* A day is a heading line plus its tasks, so the total reads against the day
     it belongs to and every time lands in one right-hand column. */
  .day { margin-top: 12px; }
  .day-head {
    display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
    border-bottom: 1px solid #d6d9df; padding-bottom: 4px; margin-bottom: 3px;
    break-after: avoid;
  }
  .day-date { font-weight: 600; font-size: 10.5pt; letter-spacing: -0.01em; }
  .day-total { font-weight: 600; font-size: 9.5pt; }
  /* A work type within the day: its name and subtotal, small and quiet. */
  .type-head {
    display: flex; justify-content: space-between; align-items: baseline;
    margin: 6px 0 1px; color: #6b7280; font-size: 7.5pt; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.08em; break-after: avoid;
  }
  .type-head .mono { font-size: 8pt; }
  .row {
    display: flex; align-items: baseline; gap: 6px; padding: 2px 0 2px 10px; break-inside: avoid;
  }
  /* Leaders carry the eye from a short task name to its time without ruling a
     full-width border under every row. */
  .dots {
    flex: 1; border-bottom: 1px dotted #c8ccd4; transform: translateY(-2px); min-width: 12px;
  }
  .row .name { color: #2b2f38; }
  .row .time { color: #16181d; }
  .row.fallback .name { color: #4b5260; font-style: italic; }
  /* When and where a task happened - the computer's own PDF only. */
  .span {
    padding-left: 10px; margin: -1px 0 1px; color: #6b7280; font-size: 8pt;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    break-before: avoid;
  }
  /* Outcome bullets sit under their task, indented and a step quieter, so the
     name and time still read as the row and the list reads as its substance. */
  .details {
    margin: 0 0 4px; padding: 0 0 0 24px; color: #4b5260; font-size: 9pt;
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
  table.weeks tr.current td { font-weight: 600; }
  table.weeks tr.upcoming td { color: #9aa1ad; }

  /* The manual marker and the week flags ride after the text, small and
     quiet, so the text still reads first and the row stays one line. */
  .tag {
    display: inline-block; margin-left: 6px; padding: 0 5px; border-radius: 3px;
    font-size: 7pt; text-transform: uppercase; letter-spacing: 0.07em; font-weight: 600;
    color: #6b7280; background: #f1f2f5; vertical-align: 1px; white-space: nowrap;
  }
  .tag.manual { color: #92400e; background: #fcf1e3; }
  .tag.soft { color: #9aa1ad; background: transparent; border: 1px solid #e3e6eb; }

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
  <div class="subtitle">${escapeHtml(view.period)}${view.computer ? ` · ${escapeHtml(view.computer)}` : ""}</div>
</header>

${(view.notices ?? []).map((note) => `<p class="notice">${escapeHtml(note)}</p>`).join("\n")}

<div class="summary">${stats}</div>
<p class="summary-line">${view.days.length} tracked ${view.days.length === 1 ? "day" : "days"} · average day ${formatDuration(average)}</p>

${view.weeks ? weekTableHtml(view) : ""}

<h2>Daily breakdown</h2>
${breakdown}
<div class="grand"><span>Total${view.computer ? " (this computer)" : ""}</span><span class="mono">${formatDuration(total)}</span></div>

<h2>By type</h2>
<table>
  <thead><tr><th>Type</th><th class="right">Time</th><th class="right">Manual</th></tr></thead>
  <tbody>${typeRows}</tbody>
</table>

<h2>By task</h2>
<table>
  <thead><tr><th>Task</th><th class="right">Time</th></tr></thead>
  <tbody>${taskRows}</tbody>
</table>

</body>
</html>
`;
}

/** Above this, a merged day on the client PDF reads as more than one person. */
const LONG_DAY_SECONDS = 12 * 60 * 60;

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
 * Which PDFs this run writes, as jobs: `{ kind, start, end, period, pdf,
 * html, team }` (and `month` for a month).
 *
 * The routine run is the month so far and the week so far. When the current
 * week began in last month, last month is written too - its last days are
 * usually named on the first update of the next, and without this they would
 * never reach its PDF. `--all-weeks` writes every week of the month that has
 * begun. Every job has a client twin.
 *
 * `hasTimesheet(month)` says whether this computer has a timesheet for a
 * month; pure otherwise, so it is testable.
 */
export function plan(args, id, hasTimesheet = () => true) {
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
  const weekJob = (week) => ({
    kind: "week",
    ...week,
    period: `Week of ${weekLabel(week.start, week.end)}`,
    pdf: path.join(TRACKING_DIR, "weekly", `${week.start}.${id}.pdf`),
    html: path.join(CACHE_DIR, `${week.start}.${id}.week.html`),
  });
  const begun = (month) => weeksOverlapping(month).filter((week) => week.start <= args.today);

  if (args.explicit) {
    jobs.push(monthJob(args.month));
    if (args.allWeeks) for (const week of begun(args.month)) jobs.push(weekJob(week));
  } else {
    const current = args.today.slice(0, 7);
    const week = weekOf(args.today);
    const spill = monthOf(week.start);
    if (spill !== current && hasTimesheet(spill)) jobs.push(monthJob(spill));
    jobs.push(monthJob(current));
    if (args.allWeeks) for (const each of begun(current)) jobs.push(weekJob(each));
    else jobs.push(weekJob(week));
  }

  const seen = new Set();
  const own = jobs.filter((job) => !seen.has(job.pdf) && seen.add(job.pdf));
  const team = own.map((job) => ({
    ...job,
    team: true,
    pdf:
      job.kind === "month"
        ? path.join(TRACKING_DIR, "client", `${job.month}.pdf`)
        : path.join(TRACKING_DIR, "client", "weekly", `${job.start}.pdf`),
    html: path.join(CACHE_DIR, `${job.start}.client.${job.kind}.html`),
  }));
  return [...own, ...team];
}

/** The months a span touches, in order. */
function monthsOf(start, end) {
  const months = [];
  for (let month = monthOf(start); month <= monthOf(end); month = monthOf(addDays(monthEnd(month), 1))) {
    months.push(month);
  }
  return months;
}

/**
 * Each computer's recorded days in a span - across months, so a week that
 * crosses one is one read - less any timesheet-upkeep rows.
 */
function readRange(ids, start, end) {
  return ids.map((id) => {
    const days = [];
    for (const month of monthsOf(start, end)) {
      const file = monthFilePath(month, id);
      if (!existsSync(file)) continue;
      for (const day of withoutTrackerRows(parseMonthFile(readFileSync(file, "utf8")).days)) {
        if (day.date >= start && day.date <= end) days.push(day);
      }
    }
    return { id, days };
  });
}

/** Every computer with a timesheet in a span. */
function idsIn(start, end) {
  return [...new Set(monthsOf(start, end).flatMap((month) => monthFileIds(month)))].sort();
}

/** When a computer last ran an update, for the terminal note - never the PDF. */
function lastUpdate(id) {
  try {
    const lines = readFileSync(logPath(id), "utf8").split("\n").filter((line) => line.trim());
    return JSON.parse(lines[lines.length - 1]).at ?? null;
  } catch {
    return null;
  }
}

/**
 * The days a PDF covers, as it shows them. A computer's own PDF reads its own
 * timesheet; the client PDF reads every computer's and merges them. Unnamed
 * rows become "Research & exploration" first, so the terminal can still say
 * whose they were.
 */
function daysFor(job, computer) {
  if (!job.team) {
    if (job.kind === "month" && !existsSync(monthFilePath(job.month, computer.fileId))) {
      throw new Error(
        `No timesheet for ${job.month}. Run \`node ${path.join(TRACKING_DIR, "engine", "collect.mjs")}\` first.`,
      );
    }
    const [{ days }] = readRange([computer.fileId], job.start, job.end);
    const presented = presentDays(days);
    return { days: presented.days, unnamed: presented.unnamed.map((date) => ({ id: computer.fileId, date })) };
  }

  const unnamed = [];
  const lists = readRange(idsIn(job.start, job.end), job.start, job.end).map(({ id, days }) => {
    const presented = presentDays(days);
    for (const date of presented.unnamed) unnamed.push({ id, date });
    return presented.days;
  });
  return { days: mergeDays(lists), unnamed };
}

/** Write one PDF, or say why not. Returns a line for the summary. */
function render(job, context) {
  const { computer, config } = context;
  const { days, unnamed } = daysFor(job, computer);
  if (days.length === 0) {
    // A week with no tracked days is not a failure - there is simply nothing
    // to bill - but a month with none is, since it was asked for by name.
    if (job.kind === "week") return `${job.period}${job.team ? " (client)" : ""}: no tracked days, no PDF.`;
    throw new Error(`${job.month} has no recorded days.`);
  }

  // Said once per month, on the month jobs: unnamed time is on the PDF as
  // research, and a named task reads better to a client.
  if (job.kind === "month" && unnamed.length > 0) {
    const where = job.team
      ? unnamed.map((entry) => `${entry.date} (${entry.id})`).join(", ")
      : unnamed.map((entry) => entry.date).join(", ");
    console.warn(
      `Note: ${job.team ? "client " : ""}${job.month} shows unnamed time as "${FALLBACK_NAME}" on ${where}. ` +
        "\"update tracker\" on that computer names it.",
    );
  }
  if (job.kind === "month" && !job.team) {
    // Missing bullets and types thin the report but do not falsify it, so
    // they warn rather than block - an older month named before they
    // existed must still render.
    const bare = days.filter((day) => day.tasks.some((task) => !task.fallback && needsBullets(task)));
    if (bare.length > 0) {
      console.warn(
        `Warning: ${bare.map((day) => day.date).join(", ")} ${bare.length === 1 ? "has" : "have"} ` +
          "tasks with fewer than two outcome bullets. \"update tracker\" writes them.",
      );
    }
    const untyped = days.filter((day) => day.tasks.some(needsType));
    if (untyped.length > 0) {
      console.warn(
        `Warning: ${untyped.map((day) => day.date).join(", ")} ${untyped.length === 1 ? "has" : "have"} ` +
          "tasks with no work type. \"update tracker\" adds them.",
      );
    }
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
  if (job.team && job.kind === "month") {
    // The one thing a merge cannot hide is a day longer than one person could
    // work. Say so here, where only the sender sees it, and leave the choice
    // of whether to send to them - trimming hours to disguise it would misbill.
    const long = days.filter((day) => day.seconds > LONG_DAY_SECONDS);
    if (long.length > 0) {
      console.warn(
        `Note: ${long.map((day) => `${day.date} (${formatDuration(day.seconds)})`).join(", ")} - ` +
          "over 12 hours in one day on the client PDF, which a reader may take as more than one person.",
      );
    }
  }

  // The budget: every computer's timesheet for the project's figures, this
  // one's alone for its own share. Weeks cross months, so the months either
  // side are read too.
  const caps = budgetCaps(config);
  // The caps for this span: a week's from its Monday, a month's from its last
  // day - an exception that lifts the month cap lifts it for the month's PDF.
  const spanCaps = caps && capsOn(config, job.kind === "week" ? job.start : job.end);
  const reach =
    job.kind === "month"
      ? monthsOf(weekOf(job.start).start, weekOf(job.end).end)
      : monthsOf(job.start, job.end);
  const project = recordedDays(reach);
  const ownTotals = job.team ? null : recordedDays(reach, { only: computer.fileId });
  const figures = spanFigures(project, job.start, job.end, job.kind === "week" ? spanCaps?.week : spanCaps?.month);
  const total = days.reduce((sum, day) => sum + day.seconds, 0);

  let weeks = null;
  if (job.kind === "month") {
    // The note under a week's heading speaks for the PDF's own timesheet: the
    // client's is everyone's, a computer's is its own.
    const noteTotals = ownTotals ?? project;
    weeks = weekRows(project, weekCaps(config), job.month, ownTotals).map((row) => ({
      ...row,
      beforeNote: row.before && { ...row.before, seconds: spanSeconds(noteTotals, row.before.start, row.before.end) },
      afterNote: row.after && { ...row.after, seconds: spanSeconds(noteTotals, row.after.start, row.after.end) },
    }));
  }

  const own = !job.team;
  const html = renderHtml({
    project: context.project,
    period: job.period,
    kind: job.kind,
    today: context.today,
    days,
    categories: config.categories ?? [],
    stats: statsFor({ kind: job.kind, own, figures: caps ? figures : null, total, dayCount: days.length }),
    computer: own ? computerLabel(computer.fileId) : null,
    weeks,
    monthCap: spanCaps?.month ?? null,
    edgeLabel: own ? "timesheet" : "PDF",
    notices: exceptionNotes(config, job.start, job.end),
  });

  mkdirSync(CACHE_DIR, { recursive: true });
  mkdirSync(path.dirname(job.pdf), { recursive: true });
  writeFileSync(job.html, html);

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

  const count = days.length;
  const budget = !caps
    ? ""
    : figures.cap == null
      ? ` Project ${job.kind === "week" ? "week" : "month"}: ${formatDuration(figures.done)}, no month cap.`
      : ` Project ${job.kind === "week" ? "week" : "month"}: ${formatDuration(figures.done)} of ` +
        `${formatDuration(figures.cap)}, ${figures.left >= 0 ? `${formatDuration(figures.left)} left` : `${formatDuration(-figures.left)} over`}.`;
  return (
    `${path.relative(process.cwd(), job.pdf)} - ${formatDuration(total)}, ` +
    `${count} tracked ${count === 1 ? "day" : "days"}.${budget}`
  );
}

function main() {
  const config = loadConfig();
  const computer = currentComputer();
  const args = parseArgs(config);
  const jobs = plan(args, computer.fileId, (month) => existsSync(monthFilePath(month, computer.fileId)));

  // Whose timesheets the client PDFs merge, and how fresh each is, so a
  // stale computer shows up. Terminal only: the PDF itself never says how
  // many computers there were. A two-part id is a computer still on the
  // older version - its hours count, but it should upgrade.
  const spans = new Map();
  for (const job of jobs.filter((each) => each.team)) {
    for (const month of monthsOf(job.start, job.end)) spans.set(month, true);
  }
  for (const month of spans.keys()) {
    const ids = monthFileIds(month);
    if (ids.length === 0) continue;
    const notes = ids.map((id) => {
      const label = id === computer.fileId ? `this computer (${id})` : id;
      const old = id.includes(".") ? ", not upgraded yet" : "";
      return id === computer.fileId ? label : `${label} (last update ${lastUpdate(id) ?? "never"}${old})`;
    });
    console.log(
      `Client PDFs for ${month} merge ${ids.length} timesheet${ids.length === 1 ? "" : "s"}: ${notes.join(", ")}.` +
        " Pull first to include the latest from other computers.",
    );
  }

  const context = { computer, config, today: args.today, project: projectName() };
  let failed = false;
  for (const job of jobs) {
    try {
      console.log(render(job, context));
    } catch (error) {
      failed = true;
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
  if (failed) process.exit(1);
}

// Every failure here is an ordinary, actionable condition - a month with no
// timesheet, no browser installed - so it prints as a sentence rather than a
// stack trace. The exit code still marks it as a failure. Guarded so the pure
// parts above can be imported by tests without a run.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
