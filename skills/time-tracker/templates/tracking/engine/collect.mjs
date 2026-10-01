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
import { fileURLToPath } from "node:url";

import {
  buildBlocks,
  formatDuration,
  isWorkday,
  subtractBlocks,
  toLocalDay,
  toLocalTime,
  uncoveredSeconds,
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
 * Whether a prompt is a request to update the tracker and nothing else -
 * "update tracker", "update tracking", "updatetracking", "update my
 * timesheet", the `/time-tracker` command, and the typos those arrive with.
 *
 * Deliberately anchored to the whole prompt: a prompt that asks for an update
 * *and* something else is work, and only the labeller can say how much.
 */
export function isTrackerPrompt(text) {
  const prompt = String(text ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s.!?,:;]+$/, "");
  if (prompt.startsWith("/time-tracker")) return true;
  return TRACKER_PROMPT.test(prompt);
}

const TRACKER_PROMPT =
  /^(?:please\s+|pls\s+)?(?:run\s+|do\s+)?(?:an?\s+|the\s+)?u[pd]{1,2}[a-z]*t[a-z]*\s*(?:the\s+|my\s+)?(?:time\s*)?(?:tr[a-z]*|timesheet|time\s*sheet)(?:\s+please|\s+pls)?$/;

/**
 * The stretches of each session that were spent updating the tracker.
 *
 * Grouped by the session each prompt was typed in. A session whose prompts
 * are all tracker requests is excluded whole. In a mixed session, a stretch
 * runs from a tracker prompt until the next prompt that is about something
 * else, or - when nothing follows it - to the end of the session (`end: null`,
 * resolved once the transcript's last instant is known).
 *
 * Prompts the history could not attribute to a session apply to every
 * session: there is no way to tell which one they belong to, and leaving them
 * in would bill the update as work.
 */
export function trackerStretches(prompts) {
  const bySession = new Map();
  for (const prompt of prompts) {
    const key = prompt.session ?? "*";
    const bucket = bySession.get(key);
    if (bucket) bucket.push(prompt);
    else bySession.set(key, [prompt]);
  }

  const exclusions = new Map();
  for (const [session, list] of bySession) {
    const sorted = [...list].sort((a, b) => a.at - b.at);
    if (session !== "*" && sorted.every((prompt) => isTrackerPrompt(prompt.text))) {
      exclusions.set(session, { whole: true, stretches: [] });
      continue;
    }
    const stretches = [];
    let open = null;
    for (const prompt of sorted) {
      if (isTrackerPrompt(prompt.text)) {
        if (!open) open = { start: prompt.at, end: null };
      } else if (open) {
        open.end = prompt.at;
        stretches.push(open);
        open = null;
      }
    }
    if (open) stretches.push(open);
    if (stretches.length > 0) exclusions.set(session, { whole: false, stretches });
  }
  return exclusions;
}

/**
 * Collect every event instant from this project's transcripts.
 *
 * Returns `{ main, all, holes, sessions }`. `main` holds the instants of the top-level
 * session transcripts; `all` adds each session's `subagents/*.jsonl`. A
 * background agent keeps working after its parent falls idle, and that work
 * is only in the subagent file - reading the parent alone drops it. The two
 * lists let the caller multiply main-session time and credit agent time at
 * its actual length only where no main block covers it.
 *
 * `exclusions` (see `trackerStretches`) removes the time spent updating the
 * tracker. A session excluded whole is skipped with its subagents, like a
 * sentinel session. A stretch in a mixed session comes back in `holes`, with
 * an open end resolved to the session's last instant, for the caller to cut
 * out of the built blocks with `cutHoles`. The instants inside it are kept
 * on purpose: the block is built first and the stretch cut from it, so the
 * minutes between the last event before the update and the update itself
 * still count - dropping the instants would lose them, or let the idle gap
 * bridge the hole. `sessions` maps each session to its instants, which is
 * what lets that cut spare another session's concurrent work.
 *
 * A missing transcript folder is empty, not an error: the shape stays the
 * same so the caller can destructure it.
 */
export function readTimestamps(dir, sentinel, exclusions = new Map()) {
  if (!existsSync(dir)) return { main: [], all: [], holes: [], sessions: new Map() };

  const pattern = sentinelPattern(sentinel);
  const sessions = new Map();
  let skipped = 0;
  let excluded = 0;

  const instantsOf = (file) => {
    const instants = [];
    for (const match of readFileSync(file, "utf8").matchAll(TIMESTAMP)) {
      const parsed = Date.parse(match[1]);
      if (!Number.isNaN(parsed)) instants.push(parsed);
    }
    return instants;
  };

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
    const id = entry.name.slice(0, -".jsonl".length);

    const content = readFileSync(path.join(dir, entry.name), "utf8");
    // A scheduled tracker run is itself a Claude session in this repo. Without
    // this it would bill its own runtime as work.
    if (pattern.test(content)) {
      skipped += 1;
      continue;
    }
    if (exclusions.get(id)?.whole) {
      excluded += 1;
      continue;
    }

    const main = [];
    for (const match of content.matchAll(TIMESTAMP)) {
      const parsed = Date.parse(match[1]);
      if (!Number.isNaN(parsed)) main.push(parsed);
    }

    const subagents = [];
    const agentDir = path.join(dir, id, "subagents");
    if (existsSync(agentDir)) {
      for (const agent of readdirSync(agentDir, { withFileTypes: true })) {
        if (!agent.isFile() || !agent.name.endsWith(".jsonl")) continue;
        subagents.push(...instantsOf(path.join(agentDir, agent.name)));
      }
    }

    sessions.set(id, { main, subagents });
  }

  const holes = [];
  const result = { main: [], all: [], holes, sessions: new Map() };
  const shared = exclusions.get("*")?.stretches ?? [];
  for (const [id, session] of sessions) {
    result.main.push(...session.main);
    result.all.push(...session.main, ...session.subagents);
    result.sessions.set(id, [...session.main, ...session.subagents]);

    const own = exclusions.get(id)?.stretches ?? [];
    const last = Math.max(...session.main, ...session.subagents, 0);
    for (const stretch of [...own, ...shared]) {
      const end = stretch.end ?? last;
      if (end > stretch.start) holes.push({ session: id, start: stretch.start, end });
    }
  }

  if (skipped > 0) {
    console.log(`Skipped ${skipped} tracker-automation session(s).`);
  }
  if (excluded > 0) {
    console.log(`Skipped ${excluded} session(s) that only updated the tracker.`);
  }
  return result;
}

/**
 * Cut the tracker-update stretches out of a set of blocks.
 *
 * A stretch belongs to one session. Another session working at the same
 * time is still work, so a hole only removes the parts of itself that no
 * other session's activity covers - `blocks` is the merged timeline, where
 * that distinction is already lost, which is why the per-session instants
 * come along. The other sessions' own holes are taken out of that cover, so
 * two updates running side by side do not spare each other.
 */
export function cutHoles(blocks, holes, sessionInstants, options) {
  if (holes.length === 0) return blocks;
  const cover = new Map();
  const coverFor = (session) => {
    let found = cover.get(session);
    if (!found) {
      const others = [];
      for (const [id, instants] of sessionInstants) if (id !== session) others.push(...instants);
      const theirHoles = holes
        .filter((hole) => hole.session !== session)
        .map((hole) => ({ day: "", start: hole.start, end: hole.end }));
      found = subtractBlocks(buildBlocks(others, options), theirHoles);
      cover.set(session, found);
    }
    return found;
  };
  const effective = holes.flatMap((hole) =>
    subtractBlocks([{ day: "", start: hole.start, end: hole.end }], coverFor(hole.session)),
  );
  // A cut can leave a sliver shorter than a minute on either side of a hole.
  // It rounds to nothing and would only clutter the evidence.
  return subtractBlocks(blocks, effective).filter((block) => block.end - block.start >= 60 * 1000);
}

export function readPrompts(file = historyPath(), repoRoot = REPO_ROOT) {
  if (!existsSync(file)) return [];

  const prompts = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (typeof row !== "object" || row === null) continue;
      const { project, timestamp, display, sessionId } = row;
      if (project !== repoRoot) continue;
      if (typeof timestamp !== "number" || typeof display !== "string") continue;
      prompts.push({
        at: timestamp,
        text: display,
        session: typeof sessionId === "string" && sessionId ? sessionId : null,
      });
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

  // Time spent updating the tracker is not work. The prompts say when each
  // update began, so those stretches are taken out before anything is
  // measured, and the prompts themselves never reach the evidence - a block
  // that holds nothing else gets no row to name.
  const allPrompts = readPrompts();
  const exclusions = trackerStretches(allPrompts);
  const prompts = allPrompts.filter((prompt) => !isTrackerPrompt(prompt.text));

  const { main: mainInstants, all, holes, sessions } = readTimestamps(
    transcriptDir(),
    config.sentinel,
    exclusions,
  );
  if (all.length === 0) {
    console.log(`No transcripts found under ${transcriptDir()}.`);
    return;
  }

  const options = { idleGapMinutes: config.idleGapMinutes, timeZone: config.timeZone };
  const inRange = (block) =>
    // The boundary. Work predating the install is not part of the record, and
    // nothing in the future is counted, even though transcripts may exist for
    // either.
    isWorkday(block.day, config.workdays) && block.day >= trackedFrom && block.day <= todayDay;

  // Two timelines over the same days. `blocks` is everything - sessions and
  // their subagents - and is what the evidence and the day grouping use.
  // `mainBlocks` is the sessions alone: the time the multiplier applies to.
  // What `blocks` holds beyond `mainBlocks` is agent work no session covered,
  // credited at its actual length.
  const blocks = cutHoles(buildBlocks(all, options), holes, sessions, options).filter(inRange);
  const mainBlocks = cutHoles(buildBlocks(mainInstants, options), holes, sessions, options).filter(
    inRange,
  );

  const commits = readCommits(Math.min(...all), person.emails);

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
    const measured = [...byDate.entries()].map(([date, dayBlocks]) => {
      const dayMainBlocks = mainBlocks.filter((block) => block.day === date);
      return {
        date,
        blocks: dayMainBlocks,
        unscaledSeconds: uncoveredSeconds(dayBlocks, dayMainBlocks),
      };
    });

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
// Guarded so the pure parts above can be imported by tests without a run.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
