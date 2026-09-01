// Render a month's timesheet to PDF.
//
// Run with `node lib/time-tracking/report.mts` (current month), or the
// `time:report` package.json script if one was set up
// (`--month 2026-08` / `--last-month` for a specific month).
//
// The markdown file is the input, so the PDF can never disagree with the ledger
// you read and correct. Printing goes through headless Chrome rather than a PDF
// library: it is already installed, it needs no dependency, and the HTML it
// prints is the same document a browser would show.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { formatDuration, weekdayOf } from "./blocks.mts";
import { CACHE_DIR, PM_DIR, loadConfig, monthFilePath, projectName } from "./config.mts";
import { type DayEntry, isPlaceholder, parseMonthFile } from "./month-file.mts";

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

function findChrome(): string {
  for (const candidate of CHROME_CANDIDATES) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  throw new Error(
    "No Chrome or Chromium found for PDF printing. Install Google Chrome, or set " +
      "CHROME_PATH to a Chromium-based browser binary.",
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function monthLabel(month: string): string {
  const [year, index] = month.split("-").map(Number);
  const name = new Date(Date.UTC(year, index - 1, 1)).toLocaleString("en-GB", {
    month: "long",
    timeZone: "UTC",
  });
  return `${name} ${year}`;
}

/** `Wed 26 Aug` - short enough to never wrap in a day heading. */
function dayLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const name = new Date(Date.UTC(year, month - 1, day)).toLocaleString("en-GB", {
    month: "short",
    timeZone: "UTC",
  });
  return `${weekdayOf(date)} ${day} ${name}`;
}

/** Month-wide time per task name, largest first. */
function taskRollup(days: readonly DayEntry[]): { name: string; seconds: number }[] {
  const totals = new Map<string, number>();
  for (const day of days) {
    for (const task of day.tasks) {
      totals.set(task.name, (totals.get(task.name) ?? 0) + task.seconds);
    }
  }
  return [...totals.entries()]
    .map(([name, seconds]) => ({ name, seconds }))
    .sort((a, b) => b.seconds - a.seconds);
}

function renderHtml(month: string, days: readonly DayEntry[], timeZone: string): string {
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
            `<span class="name">${escapeHtml(task.name)}</span>` +
            `<span class="dots"></span>` +
            `<span class="time mono">${formatDuration(task.seconds)}</span></div>`,
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
<title>${name} time tracking - ${monthLabel(month)}</title>
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

  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th {
    text-align: left; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.08em;
    color: #6b7280; border-bottom: 1px solid #d6d9df; padding: 0 0 4px; font-weight: 600;
  }
  td { padding: 4px 0; border-bottom: 1px solid #eef0f3; vertical-align: middle; }
  tr { break-inside: avoid; }
  td.right, th.right { padding-left: 10px; width: 1%; white-space: nowrap; }
  .unlabelled { color: #9a3412; font-style: italic; }

  .grand {
    display: flex; justify-content: space-between; align-items: baseline;
    border-top: 1.5px solid #16181d; margin-top: 10px; padding-top: 7px;
    font-weight: 600; break-inside: avoid;
  }

  footer {
    margin-top: 20px; color: #6b7280; font-size: 8pt;
    border-top: 1px solid #e3e5ea; padding-top: 7px;
  }
</style>
</head>
<body>
<header>
  <h1>${name} - time tracking</h1>
  <div class="subtitle">${monthLabel(month)} &middot; weekdays only &middot; ${escapeHtml(timeZone)}</div>
</header>

<div class="summary">
  <div class="stat"><div class="value">${formatDuration(total)}</div><div class="label">Total</div></div>
  <div class="stat"><div class="value">${days.length}</div><div class="label">Workdays</div></div>
  <div class="stat"><div class="value">${formatDuration(average)}</div><div class="label">Average day</div></div>
</div>

<h2>Daily breakdown</h2>
${daySections}
<div class="grand"><span>Total</span><span class="mono">${formatDuration(total)}</span></div>

<h2>By task</h2>
<table>
  <thead><tr><th>Task</th><th class="right">Time</th></tr></thead>
  <tbody>${rollupRows}</tbody>
</table>

<footer>
  Measured from Claude Code session activity with a ${escapeHtml(String(loadConfig().idleGapMinutes))}-minute
  idle cut-off; gaps longer than that are not counted.${
    loadConfig().hoursMultiplier !== 1
      ? ` Each measured hour is recorded as ${escapeHtml(String(loadConfig().hoursMultiplier))}x.`
      : ""
  }
</footer>
</body>
</html>
`;
}

function parseArgs(): { month: string } {
  const args = process.argv.slice(2);
  const monthFlag = args.indexOf("--month");
  if (monthFlag !== -1 && args[monthFlag + 1]) {
    const month = args[monthFlag + 1];
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error(`--month expects YYYY-MM, got ${month}`);
    return { month };
  }

  const config = loadConfig();
  const now = new Date();
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timeZone,
    year: "numeric",
    month: "2-digit",
  }).format(now);

  if (args.includes("--last-month")) {
    const [year, month] = local.split("-").map(Number);
    const previous = new Date(Date.UTC(year, month - 2, 1));
    return {
      month: `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`,
    };
  }
  return { month: local };
}

function main(): void {
  const { month } = parseArgs();
  const config = loadConfig();
  const source = monthFilePath(month);

  if (!existsSync(source)) {
    throw new Error(`No timesheet for ${month}. Run \`node lib/time-tracking/collect.mts\` first.`);
  }

  const { days } = parseMonthFile(readFileSync(source, "utf8"));
  if (days.length === 0) throw new Error(`${month} has no recorded workdays.`);

  for (const day of days) {
    const tasked = day.tasks.reduce((sum, task) => sum + task.seconds, 0);
    if (Math.abs(tasked - day.seconds) >= 60) {
      console.warn(
        `Warning: ${day.date} task rows total ${formatDuration(tasked)} but the day is ` +
          `${formatDuration(day.seconds)}. Re-run \`node lib/time-tracking/collect.mts\` to reconcile.`,
      );
    }
  }

  mkdirSync(CACHE_DIR, { recursive: true });
  const html = path.join(CACHE_DIR, `${month}.html`);
  const pdf = path.join(PM_DIR, `${month}.pdf`);
  writeFileSync(html, renderHtml(month, days, config.timeZone));

  execFileSync(
    findChrome(),
    [
      "--headless",
      "--disable-gpu",
      "--no-pdf-header-footer",
      `--print-to-pdf=${pdf}`,
      new URL(`file://${html}`).href,
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );

  const total = days.reduce((sum, day) => sum + day.seconds, 0);
  const count = days.length;
  console.log(
    `${path.relative(process.cwd(), pdf)} - ${formatDuration(total)}, ` +
      `${count} ${count === 1 ? "workday" : "workdays"}.`,
  );
}

main();
