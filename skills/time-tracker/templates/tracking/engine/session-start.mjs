// Bring the timesheet up to date when a Claude session opens - but only while
// tracking is on.
//
// Wired to the SessionStart hook. While tracking is off this does nothing at
// all: no collect, no file written, no message. That is the whole point of the
// switch - a stopped tracker must leave the working tree alone.
//
// While tracking is on it collects, then reports any day still carrying a
// placeholder so the session can name it. Measuring is arithmetic and happens
// here; naming a day needs to read what was actually worked on, which is what
// the time-tracker skill's labelling pass does.
//
// Finished days are asked for unprompted, today is not - see the note by
// `finished` below.
//
// Everything is written to stdout as hook JSON, so the collector's own output
// is forwarded to stderr rather than allowed to corrupt it.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { toLocalDay } from "./blocks.mjs";
import { REPO_ROOT, TRACKING_DIR, loadConfig, monthFilePath, monthOf } from "./config.mjs";
import { isPlaceholder, parseMonthFile } from "./month-file.mjs";
import { isTracking, loadState } from "./state.mjs";

function nothing() {
  process.stdout.write("{}\n");
}

function collect() {
  try {
    const out = execFileSync("node", [path.join(TRACKING_DIR, "engine", "collect.mjs")], {
      cwd: TRACKING_DIR,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (out.trim()) process.stderr.write(out);
  } catch (error) {
    // A session must still start when the collector cannot run - a missing
    // transcript directory on a fresh machine, say. Report and carry on.
    process.stderr.write(`Time tracking: collect failed - ${String(error)}\n`);
  }
}

function main() {
  const state = loadState();
  if (!isTracking(state)) {
    nothing();
    return;
  }

  collect();

  const config = loadConfig();
  const todayDay = toLocalDay(Date.now(), config.timeZone);
  const file = monthFilePath(monthOf(todayDay));
  if (!existsSync(file)) {
    nothing();
    return;
  }

  const unnamed = parseMonthFile(readFileSync(file, "utf8")).days.filter((day) =>
    day.tasks.some((task) => isPlaceholder(task.name)),
  );
  if (unnamed.length === 0) {
    nothing();
    return;
  }

  // A finished day and today are different problems. A finished day's evidence
  // is complete and will not change, so leaving it unnamed is an omission -
  // and the timesheet is client-facing, so it gets named without being asked.
  // Today is still growing; naming it now would only be rewritten later, so it
  // waits for the stop, or for the user to ask.
  const finished = unnamed.filter((day) => day.date !== todayDay);

  // Today counts as much as any other day. A remainder shorter than the idle
  // gap is already folded into the task it continues, so a placeholder standing
  // on today means more than that gap of work nobody has named - not a couple
  // of stray minutes.
  const running = unnamed.some((day) => day.date === todayDay);
  const relative = path.relative(REPO_ROOT, file);

  const instruction =
    finished.length > 0
      ? `These finished days are still unnamed: ${finished.map((day) => day.date).join(", ")}. ` +
        "Name them now, without waiting to be asked, using the time-tracker skill's labelling " +
        "pass - the timesheet is client-facing and a finished day's evidence is already " +
        "complete. Evidence only: every task name must trace to a prompt or commit subject in " +
        "that day's blocks, and a day someone has already named is never rewritten. Say which " +
        "days you named, briefly, and then carry on with what the user actually asked for."
      : "";

  const todayNote = running
    ? `${todayDay} is today and still running. Leave its placeholder alone - it is named when ` +
      "the user stops tracking or asks, not now."
    : "";

  process.stdout.write(
    `${JSON.stringify({
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: [
          `Time tracking is on. ${relative} is measured and current.`,
          instruction,
          todayNote,
        ]
          .filter(Boolean)
          .join(" "),
      },
    })}\n`,
  );
}

main();
