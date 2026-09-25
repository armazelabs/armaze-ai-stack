// Turn this machine's Claude Code transcripts into timesheet data.
//
// Run with `node <tracking>/engine/collect.mjs`. It writes the month markdown
// next to itself, plus an evidence file in cache/ for labelling.
//
// Everything is per person. The transcripts read are this machine's own, the
// commits read are the ones this person authored, and the files written carry
// the person's id - `2026-09.<id>.md` - so teammates sharing a checkout each
// keep their own timesheet and never overwrite each other's days.
//
// Only days from `trackFrom` onward are counted - the date written into
// config.json when the tracker was installed. Days before it are ignored
// entirely, even though the transcripts for them exist.
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
  currentPerson,
  historyPath,
  loadConfig,
  monthFilePath,
  monthFilePattern,
  monthOf,
  transcriptDir,
} from "./config.mjs";
import {
  isPlaceholder,
  needsBullets,
  parseMonthFile,
  rebuild,
  renderMonthFile,
} from "./month-file.mjs";
import { lastCommit } from "./log.mjs";

const TIMESTAMP = /"timestamp":"([^"]+)"/g;
/**
 * Runaway guard only. It must stay far above a real day's prompt count: a low
 * cap silently hides the back half of a long block, and the labeller then names
 * the day from its opening minutes alone.
 */
const MAX_PROMPTS_PER_BLOCK = 500;
const MAX_PROMPT_LENGTH = 200;
/**
 * A commit body is evidence for the outcome bullets - it often says what the
 * subject only names. Capped so one essay of a commit message cannot swamp the
 * work list.
 */
const MAX_BODY_LENGTH = 600;

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
 * This person's commits, for the labelling evidence. Read-only, and the only
 * git this tracker ever runs - nothing here stages, commits or pushes anything.
 * The timesheet is left in the working tree for its owner to commit when they
 * choose. A project with no git history, or no git at all, contributes none.
 *
 * Only commits authored under one of the person's own emails count. A
 * teammate's commit landing inside your hours is not evidence of what *you*
 * did, and naming your day from it would put their work on your timesheet.
 * Matched in code rather than with `--author`, which is a regex and would
 * misread the `.` and `+` that real addresses carry.
 */
function readCommits(sinceMs, emails) {
  try {
    const out = execFileSync(
      "git",
      [
        "log",
        `--since=${new Date(sinceMs).toISOString()}`,
        "--format=%x1e%ct%x09%h%x09%ae%x09%s%x09%b",
      ],
      { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 },
    );
    return out
      .split("\x1e")
      .filter((record) => record.trim())
      .map((record) => {
        const [seconds, sha, email, subject, ...body] = record.split("\t");
        return {
          at: Number(seconds) * 1000,
          sha,
          email: (email ?? "").toLowerCase(),
          subject: subject ?? "",
          body: body.join("\t").replace(/\s+/g, " ").trim().slice(0, MAX_BODY_LENGTH),
        };
      })
      .filter((commit) => emails.has(commit.email));
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

function writeEvidence(month, id, file, blocks, prompts, commits, timeZone) {
  const days = file.days.map((day) => {
    const dayBlocks = blocks.filter((block) => block.day === day.date);
    // Two jobs a day can still need. `names`: a placeholder row is standing.
    // `bullets`: a named task has no outcome list yet - including days named
    // before bullets existed, which is how an older month gets backfilled.
    const needs = [];
    // A day still being named needs both: every name written gets its bullets
    // in the same pass.
    if (day.tasks.some((task) => isPlaceholder(task.name))) needs.push("names", "bullets");
    else if (day.tasks.some(needsBullets)) needs.push("bullets");
    return {
      date: day.date,
      duration: formatDuration(day.seconds),
      needs,
      tasks: day.tasks.map((task) => ({
        name: task.name,
        time: formatDuration(task.seconds),
        ...(task.details?.length > 0 ? { details: task.details } : {}),
      })),
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
          .map((commit) => ({
            at: toLocalTime(commit.at, timeZone),
            sha: commit.sha,
            subject: commit.subject,
            ...(commit.body ? { body: commit.body } : {}),
          })),
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
    path.join(CACHE_DIR, `${month}.${id}.raw.json`),
    `${JSON.stringify({ month, days }, null, 2)}\n`,
  );

  // The labelling pass reads this one, not the whole-month file above.
  //
  // Same evidence, filtered to the days that actually need a name. A month
  // fills up but the work list does not, so naming one day costs one day of
  // reading rather than twenty - which is the whole point, since reading the
  // evidence is the slow part of an update, not measuring it.
  //
  // Built from placeholders and missing bullets, deliberately, and never from the commit
  // watermark: a day can hold six hours and no commits at all, and a work list
  // derived from commits would drop it.
  const since = lastCommit(id);
  const pending = days
    .filter((day) => day.needs.length > 0)
    .map((day) => ({
      ...day,
      blocks: day.blocks.map((block) => ({
        ...block,
        // `new` marks a commit as unseen by any previous run. It is a reading
        // aid - start here - not a filter; the older commits in a block stay
        // because they are still the evidence for the hours around them.
        commits: block.commits.map((commit) => ({ ...commit, new: isNewCommit(commit.sha, since) })),
      })),
    }));

  writeIfChanged(
    path.join(CACHE_DIR, `${month}.${id}.pending.json`),
    `${JSON.stringify({ month, sinceCommit: since, days: pending }, null, 2)}\n`,
  );
}

/**
 * Whether a commit landed after the watermark.
 *
 * Answered with git rather than by comparing dates, because a merge or a
 * rebase can put an older-dated commit after the watermark in history. No
 * watermark, no git, or a watermark that no longer exists all mean "cannot
 * tell" - and that answers false, so nothing is wrongly flagged as new.
 */
function isNewCommit(sha, since) {
  if (!sha || !since) return false;
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", sha, since], {
      cwd: REPO_ROOT,
      stdio: "ignore",
    });
    return false;
  } catch {
    return true;
  }
}

function main() {
  const config = loadConfig();
  const person = currentPerson(config);
  const todayDay = toLocalDay(Date.now(), config.timeZone);

  // The boundary. Absent means the tracker was never set up here, and a run
  // with no boundary would sweep in every transcript this project has ever
  // had - so it stops rather than guessing.
  const trackedFrom = config.trackFrom;
  if (!trackedFrom) {
    console.log("No trackFrom date in config.json - the tracker is not set up here.");
    console.log(`Set one (a YYYY-MM-DD day) in ${path.join(TRACKING_DIR, "config.json")}.`);
    return;
  }

  mkdirSync(CACHE_DIR, { recursive: true });

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
    // The boundary. Work predating the install is not part of the record, and
    // nothing in the future is counted, even though transcripts may exist for
    // either.
    .filter((block) => block.day >= trackedFrom && block.day <= todayDay);

  const prompts = readPrompts();
  const commits = readCommits(Math.min(...instants), person.emails);

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
  const ownMonth = monthFilePattern(person.id);
  for (const name of readdirSync(TRACKING_DIR)) {
    const found = ownMonth.exec(name);
    if (found) months.add(found[1]);
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

    const file = monthFilePath(month, person.id);
    const parsed = existsSync(file) ? parseMonthFile(readFileSync(file, "utf8")) : null;
    // Days recorded before the boundary are dropped. Days after it that this
    // machine holds no evidence for are left alone - a second computer's work
    // is still the user's work, and dropping it here would delete it.
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
    writeEvidence(month, person.id, rebuilt, monthBlocks, prompts, commits, config.timeZone);

    // Match the rounding the month file itself prints, so the two never differ.
    const total = rebuilt.days.reduce((sum, day) => sum + Math.round(day.seconds / 60) * 60, 0);
    const count = rebuilt.days.length;
    console.log(
      `${month}: ${formatDuration(total)} across ${count} tracked ${count === 1 ? "day" : "days"}` +
        `${changed ? "" : " (unchanged)"}`,
    );
  }
}

// Not being registered, or having no git identity, is an ordinary condition
// with a one-line fix, so it prints as a sentence rather than a stack trace.
try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
