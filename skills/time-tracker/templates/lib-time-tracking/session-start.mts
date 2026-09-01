// Bring the timesheet up to date when a Claude session opens.
//
// Wired to the SessionStart hook in .claude/settings.json: collect, then report
// any day still carrying a placeholder so the session can name it. Measuring is
// arithmetic and happens here; naming a day needs to read what was actually
// worked on, which only the agent can do.
//
// This is deliberately the only moment the timesheet is rewritten while
// someone works. It used to be refreshed at the end of every turn as well,
// which meant a push left the file showing as modified moments later. The
// nightly time-tracker run re-collects everything from the transcripts, so
// nothing measured in between is lost by waiting for it.
//
// Everything is written to stdout as hook JSON, so the collector's own output
// is forwarded to stderr rather than allowed to corrupt it.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { toLocalDay } from "./blocks.mts";
import { REPO_ROOT, loadConfig, monthFilePath, monthOf } from "./config.mts";
import { isPlaceholder, parseMonthFile } from "./month-file.mts";

function collect(): void {
  try {
    const out = execFileSync("node", [path.join(REPO_ROOT, "lib/time-tracking/collect.mts")], {
      cwd: REPO_ROOT,
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

function main(): void {
  collect();

  const config = loadConfig();
  const today = toLocalDay(Date.now(), config.timeZone);
  const file = monthFilePath(monthOf(today));
  if (!existsSync(file)) {
    process.stdout.write("{}\n");
    return;
  }

  const unnamed = parseMonthFile(readFileSync(file, "utf8")).days.filter((day) =>
    day.tasks.some((task) => isPlaceholder(task.name)),
  );
  if (unnamed.length === 0) {
    process.stdout.write("{}\n");
    return;
  }

  // Today counts as much as any other day. A remainder shorter than the idle
  // gap is already folded into the task it continues, so a placeholder standing
  // on today means more than that gap of work nobody has named - not the couple
  // of stray minutes that used to make today worth excusing.
  const dates = unnamed.map((day) => day.date).join(", ");
  const running = unnamed.some((day) => day.date === today);

  process.stdout.write(
    `${JSON.stringify({
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext:
          `Time tracking: ${path.relative(REPO_ROOT, file)} is measured and current, but these ` +
          `days still carry a placeholder task: ${dates}. Run the time-tracker agent to name ` +
          "them before doing other work, then carry on with whatever the user asks." +
          (running
            ? ` ${today} is today and still running, so name the work it has done so far - ` +
              "later work will arrive as its own placeholder for a later session to name."
            : ""),
      },
    })}\n`,
  );
}

main();
