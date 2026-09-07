// The command the user actually types: start, stop, status.
//
//   node <tracking>/engine/track.mjs start
//   node <tracking>/engine/track.mjs stop
//   node <tracking>/engine/track.mjs status
//
// Start and stop deal in whole dates, not clock times - see state.mjs.
//
// Stop also re-renders the month PDF, so the rendered report never lags the
// hours behind it.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { formatDuration } from "./blocks.mjs";
import { TRACKING_DIR, loadConfig, monthFilePath, monthOf } from "./config.mjs";
import { isPlaceholder, parseMonthFile } from "./month-file.mjs";
import {
  describeRanges,
  isTracking,
  loadState,
  saveState,
  start,
  stop,
  today,
} from "./state.mjs";

function collect() {
  try {
    const out = execFileSync("node", [path.join(TRACKING_DIR, "engine", "collect.mjs")], {
      cwd: TRACKING_DIR,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (out.trim()) process.stdout.write(out);
  } catch (error) {
    process.stderr.write(`Collect failed - ${String(error)}\n`);
  }
}

/**
 * Render the month PDF. Best-effort: a missing Chromium is a normal outcome on
 * a machine that has none, and must never fail the stop that produced the
 * hours - the month markdown is the complete record either way.
 */
function report() {
  try {
    const out = execFileSync("node", [path.join(TRACKING_DIR, "engine", "report.mjs")], {
      cwd: TRACKING_DIR,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (out.trim()) process.stdout.write(out);
  } catch (error) {
    process.stderr.write(`No PDF written - ${String(error)}\n`);
  }
}

/** Today's recorded total and what still needs naming, read back from disk. */
function summarise(todayDay) {
  const file = monthFilePath(monthOf(todayDay));
  if (!existsSync(file)) return null;

  const { days } = parseMonthFile(readFileSync(file, "utf8"));
  const todayEntry = days.find((day) => day.date === todayDay) ?? null;
  const unnamed = days.filter((day) => day.tasks.some((task) => isPlaceholder(task.name)));
  const total = days.reduce((sum, day) => sum + Math.round(day.seconds / 60) * 60, 0);

  return { todayEntry, unnamed, total, days: days.length, file };
}

function main() {
  const command = (process.argv[2] ?? "status").toLowerCase();
  const config = loadConfig();
  const todayDay = today(config.timeZone);
  const state = loadState();

  if (command === "start") {
    const result = start(state, todayDay);
    if (result.changed) saveState(state);
    console.log(
      result.changed
        ? `Tracking on. ${todayDay} counts from here, the whole day included.`
        : `Tracking was already on, open since ${result.day}.`,
    );
    collect();
    return;
  }

  if (command === "stop") {
    const result = stop(state, todayDay);
    if (result.changed) {
      // Measure before closing the books, so the last day is complete.
      collect();
      saveState(state);
      console.log(`Tracking off. ${result.day} is the last counted day.`);
      // The books are closed, so the PDF can be brought up to date.
      report();
    } else {
      console.log("Tracking was already off. Nothing is being counted.");
    }
    return;
  }

  if (command === "status") {
    const on = isTracking(state);
    console.log(on ? "Tracking: ON" : "Tracking: OFF");

    const ranges = describeRanges(state, todayDay);
    if (ranges.length === 0) {
      console.log("No tracked ranges yet. `start` opens one.");
      return;
    }
    console.log(`Ranges: ${ranges.join("; ")}`);

    const summary = summarise(todayDay);
    if (!summary) {
      console.log("No timesheet for this month yet - run a collect.");
      return;
    }
    console.log(
      `${monthOf(todayDay)}: ${formatDuration(summary.total)} across ${summary.days} ` +
        `tracked ${summary.days === 1 ? "day" : "days"}.`,
    );
    if (summary.todayEntry) {
      console.log(`Today (${todayDay}): ${formatDuration(summary.todayEntry.seconds)}.`);
    }
    if (summary.unnamed.length > 0) {
      console.log(`Days still needing a name: ${summary.unnamed.map((d) => d.date).join(", ")}.`);
    }
    return;
  }

  console.error(`Unknown command ${JSON.stringify(command)}. Use start, stop or status.`);
  process.exit(1);
}

main();
