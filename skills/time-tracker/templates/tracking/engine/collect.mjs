// Turn this machine's Claude Code transcripts into timesheet data.
//
// Run with `node <tracking>/engine/collect.mjs`. It writes the month markdown
// next to itself, plus an evidence file in cache/ for labelling.
//
// Only days inside a tracked range are counted - see state.mjs. Days outside
// one are ignored entirely, even though the transcripts for them exist.
//
// The whole history is recomputed on every run rather than appended to. Scanning
// all transcripts costs well under a second, and a stateless recompute means a
// missed night, or work past midnight, corrects itself on the next run.

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  buildBlocks,
  formatDuration,
  isWorkday,
  toLocalDay,
  toLocalTime,
} from "./blocks.mjs";
import {
  CACHE_DIR,
  REPO_ROOT,
  TRACKING_DIR,
  historyPath,
  loadConfig,
  monthFilePath,
  monthOf,
  transcriptDir,
} from "./config.mjs";
import {
  isPlaceholder,
  parseMonthFile,
  rebuild,
  renderMonthFile,
} from "./month-file.mjs";
import { earliestTrackedDay, isTracked, loadState } from "./state.mjs";

const TIMESTAMP = /"timestamp":"([^"]+)"/g;
/**
 * Runaway guard only. It must stay far above a real day's prompt count: a low
 * cap silently hides the back half of a long block, and the labeller then names
 * the day from its opening minutes alone.
 */
const MAX_PROMPTS_PER_BLOCK = 500;
const MAX_PROMPT_LENGTH = 200;

/**
 * Match the sentinel only where a prompt *begins* with it.
 *
 * A bare substring search would be wrong: any session that merely discusses the
 * tracker - including the one that first wrote these files - embeds the token in
 * a tool argument and would exclude itself. Inside a tool argument the quotes
 * are backslash-escaped, so anchoring to an unescaped `"field":"` prefix matches
 * the automation's own prompt and nothing else.
 */
function sentinelPattern(sentinel) {
  const escaped = sentinel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`"(?:display|content|text|prompt)":"${escaped}`);
}

/**
 * Collect every event instant from this project's transcripts.
 *
 * Only top-level `*.jsonl` files are read: subagent transcripts live in
 * per-session subdirectories and reuse the parent's wall-clock window, so
 * including them would add no time while multiplying the work.
 */
function readTimestamps(dir, sentinel) {
  if (!existsSync(dir)) return [];

  const pattern = sentinelPattern(sentinel);
  const instants = [];
  let skipped = 0;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;

    const content = readFileSync(path.join(dir, entry.name), "utf8");
    // A scheduled tracker run is itself a Claude session in this repo. Without
    // this it would bill its own runtime as work.
    if (pattern.test(content)) {
      skipped += 1;
      continue;
    }

    for (const match of content.matchAll(TIMESTAMP)) {
      const parsed = Date.parse(match[1]);
      if (!Number.isNaN(parsed)) instants.push(parsed);
    }
  }

  if (skipped > 0) {
    console.log(`Skipped ${skipped} tracker-automation session(s).`);
  }
  return instants;
}

function readPrompts() {
  const file = historyPath();
  if (!existsSync(file)) return [];

  const prompts = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (typeof row !== "object" || row === null) continue;
      const { project, timestamp, display } = row;
      if (project !== REPO_ROOT) continue;
      if (typeof timestamp !== "number" || typeof display !== "string") continue;
      prompts.push({ at: timestamp, text: display });
    } catch {
      // A truncated trailing line is normal while a session is live.
    }
  }
  return prompts;
}

/**
 * Commit subjects, for labelling evidence. A project with no git history, or
 * no git at all, simply contributes none.
 */
/**
 * Commit subjects for the labelling evidence. Read-only, and the only git this
 * tracker ever runs - nothing here stages, commits or pushes anything. The
 * timesheet is left in the working tree for its owner to commit when they
 * choose.
 */
function readCommits(sinceMs) {
  try {
    const out = execFileSync(
      "git",
      ["log", `--since=${new Date(sinceMs).toISOString()}`, "--format=%ct%x09%s"],
      { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return out
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [seconds, ...rest] = line.split("\t");
        return { at: Number(seconds) * 1000, subject: rest.join("\t") };
      });
  } catch {
    return [];
  }
}

/**
 * Write only when the bytes differ, so re-running leaves the tree clean.
 *
 * The write goes to a temporary file and is renamed into place. Several Claude
 * sessions can share this worktree and start at the same moment, and rename is
 * atomic - so a concurrent run can never leave a half-written timesheet behind.
 */
function writeIfChanged(file, content) {
  if (existsSync(file) && readFileSync(file, "utf8") === content) return false;
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, content);
  renameSync(temporary, file);
  return true;
}

function writeEvidence(month, file, blocks, prompts, commits, timeZone) {
  const days = file.days.map((day) => {
    const dayBlocks = blocks.filter((block) => block.day === day.date);
    return {
      date: day.date,
      duration: formatDuration(day.seconds),
      labelled: day.tasks.every((task) => !isPlaceholder(task.name)),
      blocks: dayBlocks.map((block) => ({
        range: `${toLocalTime(block.start, timeZone)}-${toLocalTime(block.end, timeZone)}`,
        duration: formatDuration((block.end - block.start) / 1000),
        // Each prompt and commit carries its local time so a long block can be
        // split by when topics actually changed, rather than by guesswork.
        prompts: prompts
          .filter((prompt) => prompt.at >= block.start && prompt.at <= block.end)
          .slice(0, MAX_PROMPTS_PER_BLOCK)
          .map((prompt) => ({
            at: toLocalTime(prompt.at, timeZone),
            text: prompt.text.replace(/\s+/g, " ").slice(0, MAX_PROMPT_LENGTH),
          })),
        commits: commits
          .filter((commit) => commit.at >= block.start && commit.at <= block.end)
          .map((commit) => ({ at: toLocalTime(commit.at, timeZone), subject: commit.subject })),
      })),
    };
  });

  // Truncated evidence is the one failure that stays invisible: the labeller
  // still produces confident names, just from the opening minutes of a block.
  // Say so loudly rather than letting a day be named from a fraction of itself.
  const truncated = days
    .flatMap((day) => day.blocks.map((block) => ({ date: day.date, block })))
    .filter(({ block }) => block.prompts.length >= MAX_PROMPTS_PER_BLOCK);
  for (const { date, block } of truncated) {
    console.warn(
      `Warning: ${date} block ${block.range} hit the ${MAX_PROMPTS_PER_BLOCK}-prompt cap. ` +
        `Raise MAX_PROMPTS_PER_BLOCK - labels for this day would miss its later work.`,
    );
  }

  writeIfChanged(
    path.join(CACHE_DIR, `${month}.raw.json`),
    `${JSON.stringify({ month, days }, null, 2)}\n`,
  );
}

function main() {
  const config = loadConfig();
  const state = loadState();

  if (state.ranges.length === 0) {
    console.log("Tracking has never been started here - nothing is counted.");
    console.log("Start it with `node " + path.join(TRACKING_DIR, "engine", "track.mjs") + " start`.");
    return;
  }

  mkdirSync(CACHE_DIR, { recursive: true });
  const todayDay = toLocalDay(Date.now(), config.timeZone);
  const trackedFrom = earliestTrackedDay(state);

  const instants = readTimestamps(transcriptDir(), config.sentinel);
  if (instants.length === 0) {
    console.log(`No transcripts found under ${transcriptDir()}.`);
    return;
  }

  const blocks = buildBlocks(instants, {
    idleGapMinutes: config.idleGapMinutes,
    timeZone: config.timeZone,
  })
    .filter((block) => isWorkday(block.day, config.workdays))
    // The on/off switch. A day outside every tracked range is not part of the
    // record, even though its transcripts still exist.
    .filter((block) => isTracked(block.day, state, todayDay));

  const prompts = readPrompts();
  const commits = readCommits(Math.min(...instants));

  const byMonth = new Map();
  for (const block of blocks) {
    const month = monthOf(block.day);
    const bucket = byMonth.get(month);
    if (bucket) bucket.push(block);
    else byMonth.set(month, [block]);
  }

  // Rebuild any month with fresh data, plus any month already on disk, so days
  // recorded on another machine keep rendering here.
  const months = new Set(byMonth.keys());
  for (const name of readdirSync(TRACKING_DIR)) {
    if (/^\d{4}-\d{2}\.md$/.test(name)) months.add(name.slice(0, 7));
  }

  for (const month of [...months].sort()) {
    const monthBlocks = byMonth.get(month) ?? [];

    const byDate = new Map();
    for (const block of monthBlocks) {
      const bucket = byDate.get(block.day);
      if (bucket) bucket.push(block);
      else byDate.set(block.day, [block]);
    }
    const measured = [...byDate.entries()].map(([date, dayBlocks]) => ({
      date,
      blocks: dayBlocks,
    }));

    const file = monthFilePath(month);
    const parsed = existsSync(file) ? parseMonthFile(readFileSync(file, "utf8")) : null;
    // Days recorded before tracking ever began are dropped; days inside a gap
    // between two ranges are left alone, since they were recorded deliberately
    // at the time and this machine may simply not hold their evidence.
    const existing = parsed
      ? { ...parsed, days: parsed.days.filter((day) => day.date >= trackedFrom) }
      : null;

    const rebuilt = rebuild(
      existing,
      month,
      measured,
      todayDay,
      config.idleGapMinutes,
      config.hoursMultiplier,
    );
    if (rebuilt.days.length === 0) continue;

    const changed = writeIfChanged(file, renderMonthFile(rebuilt, config.workdays));
    writeEvidence(month, rebuilt, monthBlocks, prompts, commits, config.timeZone);

    // Match the rounding the month file itself prints, so the two never differ.
    const total = rebuilt.days.reduce((sum, day) => sum + Math.round(day.seconds / 60) * 60, 0);
    const count = rebuilt.days.length;
    console.log(
      `${month}: ${formatDuration(total)} across ${count} tracked ${count === 1 ? "day" : "days"}` +
        `${changed ? "" : " (unchanged)"}`,
    );
  }
}

main();
