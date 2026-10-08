// Turn this machine's Claude Code transcripts into timesheet data.
//
// Run with `node <tracking>/engine/collect.mjs`. It writes the month markdown
// next to itself, plus an evidence file in cache/ for labelling.
//
// Everything is per computer. The transcripts read are this machine's own,
// the commits read are the ones made on it (its git reflog), and the files
// written carry its name - `2026-09.<computer>.md` - so no two computers ever
// overwrite each other's days. Each computer counts in full: two computers
// working at the same time are two workers, and their timesheets add up.
//
// Every block knows the sessions it came from. The month file records them -
// each task's clock times and sessions, and a legend naming each session by
// its opening prompt - so the computer's own PDF can say when and where each
// task was done.
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
  attachSessions,
  buildBlocks,
  formatDuration,
  isWorkday,
  sessionRef,
  subtractBlocks,
  toLocalDay,
  toLocalTime,
  toMinutes,
  uncoveredSeconds,
} from "./blocks.mjs";
import {
  CACHE_DIR,
  REPO_ROOT,
  TRACKING_DIR,
  currentComputer,
  historyPath,
  loadConfig,
  monthFilePath,
  monthFilePattern,
  monthOf,
  transcriptDir,
} from "./config.mjs";
import {
  FALLBACK_NAME,
  isPlaceholder,
  needsBullets,
  needsTimes,
  needsType,
  parseMonthFile,
  rebuild,
  renderMonthFile,
  whenCell,
} from "./month-file.mjs";
import { lastCommit, localCommits } from "./log.mjs";
import { budgetFor, describeBudget, noteOverBudget } from "./budget.mjs";

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
/** A session's label is its opening prompt, cut to this - enough to recognise it on a PDF line. */
const MAX_LABEL_LENGTH = 60;

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
  return TRACKER_PROMPT.test(prompt) || MANUAL_PROMPT.test(prompt) || SETUP_PROMPT.test(prompt);
}

/**
 * "log manual hours", "add manual time" - the request that opens the manual
 * hours mode, which is tracker upkeep like an update. Anchored to the opening
 * words rather than the whole prompt, since the hours themselves often follow
 * in the same message ("log manual hours: 3h in Figma yesterday"). The skill
 * gathers the rest through AskUserQuestion, whose answers are not prompts, so
 * the stretch is not cut short by the description of the work.
 */
const MANUAL_PROMPT = /^(?:please\s+|pls\s+)?(?:log|add|record|enter)\s+(?:some\s+|my\s+)?manual\s+(?:hours?|time)\b/;

/**
 * "check time tracker", "update time tracker setup", "set up time tracking" -
 * checking, upgrading or installing the tracker itself. Upkeep like an update,
 * so it is not billed and gets past a used-up hour budget: without that, a
 * project out of hours could not even repair its tracker. Whole-prompt
 * anchored, and it must say "time", so "check the checkout tracker bug" is work.
 */
const SETUP_PROMPT =
  /^(?:please\s+|pls\s+)?(?:(?:check|test|verify)\s+(?:the\s+|my\s+)?time[\s-]*tr[a-z]*(?:\s+set\s*up)?|(?:update|upgrade|fix|repair)\s+(?:the\s+|my\s+)?time[\s-]*tr[a-z]*\s+set\s*up|set\s*up\s+(?:the\s+|my\s+)?time[\s-]*tr[a-z]*)$/;

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

const NOTIFICATION = "<task-notification>";

/**
 * What a main-transcript line says about who is driving the session.
 *
 * When a background agent finishes, Claude Code queues a task notification
 * and the main session runs a turn on it with nobody at the keyboard. Those
 * turns land in the main transcript, so an agent reporting back every few
 * minutes kept the main session's blocks open for the agent's whole run and
 * billed it at the main multiplier. Telling the turns apart puts that time
 * back with the agent's, where it counts at the subagent multiplier.
 *
 * - `"prompt"`: a turn started by the person - typed, a slash command, an
 *   interrupt.
 * - `"notification"`: a turn started by a task notification. Newer transcripts
 *   say so in `origin.kind`; older ones only carry the tag in the prompt.
 * - `"arrival"`: a notification entering or leaving the queue. Not a turn,
 *   and not the person, whatever turn it lands in.
 * - `"typed"`: the person queueing a prompt while a turn runs - they are
 *   there even if the turn is an agent's.
 *
 * Anything else (assistant output, tool results, hook and meta lines)
 * returns `null` and belongs to the turn it sits in. So does a line that
 * does not parse: the rule only ever moves time from the main session to the
 * agents when the transcript says an agent caused it.
 */
export function lineKind(line) {
  if (!line.includes('"type":"user"') && !line.includes('"type":"queue-operation"')) return null;
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    return null;
  }
  if (entry.type === "queue-operation") {
    if (entry.operation !== "enqueue" && entry.operation !== "remove") return null;
    if (typeof entry.content !== "string") return null;
    if (entry.content.startsWith(NOTIFICATION)) return "arrival";
    return entry.operation === "enqueue" ? "typed" : null;
  }
  if (entry.type !== "user" || entry.isMeta) return null;
  const content = entry.message?.content;
  if (Array.isArray(content) && content.some((part) => part?.type === "tool_result")) return null;
  if (entry.origin?.kind) return entry.origin.kind === "task-notification" ? "notification" : "prompt";
  if (typeof content === "string" && content.startsWith(NOTIFICATION)) return "notification";
  return "prompt";
}

/**
 * Collect every event instant from this project's transcripts.
 *
 * Returns `{ main, all, holes, sessions, openers }`. `main` holds the instants of the top-level
 * session transcripts, less the turns an agent's report started (`lineKind`);
 * `all` adds those back along with each session's `subagents/*.jsonl`. A
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
 * what lets that cut spare another session's concurrent work, and what tells
 * each block which sessions it holds. `openers` maps each session to the
 * first thing the person typed in it, for the session's label.
 *
 * A missing transcript folder is empty, not an error: the shape stays the
 * same so the caller can destructure it.
 */
export function readTimestamps(dir, sentinel, exclusions = new Map()) {
  if (!existsSync(dir)) return { main: [], all: [], holes: [], sessions: new Map(), openers: new Map() };

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
    const subagents = [];
    let opener = null;
    // A turn the main session ran because an agent reported back is agent
    // time, not the person's: see `lineKind`. Outside such a turn only a
    // notification can change anything, so the rest skip the parse.
    let woken = false;
    for (const line of content.split("\n")) {
      if (opener === null && line.includes('"type":"user"') && lineKind(line) === "prompt") {
        const text = sessionLabel(promptText(line));
        if (text && !isTrackerPrompt(text)) opener = text;
      }
      const kind = woken || line.includes(NOTIFICATION) ? lineKind(line) : null;
      if (kind === "prompt") woken = false;
      if (kind === "notification") woken = true;
      const bucket = kind === "typed" || (!woken && kind !== "arrival") ? main : subagents;
      for (const match of line.matchAll(TIMESTAMP)) {
        const parsed = Date.parse(match[1]);
        if (!Number.isNaN(parsed)) bucket.push(parsed);
      }
    }

    const agentDir = path.join(dir, id, "subagents");
    if (existsSync(agentDir)) {
      for (const agent of readdirSync(agentDir, { withFileTypes: true })) {
        if (!agent.isFile() || !agent.name.endsWith(".jsonl")) continue;
        for (const instant of instantsOf(path.join(agentDir, agent.name))) subagents.push(instant);
      }
    }

    sessions.set(id, { main, subagents, opener });
  }

  const holes = [];
  const result = { main: [], all: [], holes, sessions: new Map(), openers: new Map() };
  const shared = exclusions.get("*")?.stretches ?? [];
  for (const [id, session] of sessions) {
    // Loops, not spreads: a long session holds more instants than a call can take as arguments.
    for (const instant of session.main) {
      result.main.push(instant);
      result.all.push(instant);
    }
    for (const instant of session.subagents) result.all.push(instant);
    result.sessions.set(id, [...session.main, ...session.subagents]);
    if (session.opener) result.openers.set(id, session.opener);

    const own = exclusions.get(id)?.stretches ?? [];
    const latest = (max, instant) => (instant > max ? instant : max);
    const last = session.subagents.reduce(latest, session.main.reduce(latest, 0));
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
      for (const [id, instants] of sessionInstants) {
        if (id === session) continue;
        for (const instant of instants) others.push(instant);
      }
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

/** The text of a prompt line in a transcript, or null. */
function promptText(line) {
  try {
    const content = JSON.parse(line).message?.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .filter((part) => part?.type === "text" && typeof part.text === "string")
        .map((part) => part.text)
        .join(" ");
    }
  } catch {
    // Not a line worth a label.
  }
  return null;
}

/**
 * A prompt as a one-line session label: a slash command as `/name args`,
 * markup stripped, whitespace collapsed, a `|` (which would break the month
 * file's table) turned to `/`, and cut to {@link MAX_LABEL_LENGTH}. Null for
 * nothing worth showing - a caveat Claude Code injects, an empty prompt.
 */
export function sessionLabel(text) {
  if (typeof text !== "string") return null;
  const command = /<command-name>\s*\/?([^<]+?)\s*<\/command-name>/.exec(text);
  const args = /<command-args>([^<]*)<\/command-args>/.exec(text);
  let label = command ? `/${command[1]} ${args?.[1] ?? ""}` : text;
  label = label
    .replace(/<[^>]*>/g, " ")
    .replace(/\|/g, "/")
    .replace(/\s+/g, " ")
    .trim();
  if (!label || /^caveat:/i.test(label)) return null;
  return label.length > MAX_LABEL_LENGTH ? `${label.slice(0, MAX_LABEL_LENGTH - 1).trimEnd()}…` : label;
}

/**
 * Each session's label: the first prompt typed in it that is not a tracker
 * request - from the prompt history, which keeps what was typed, else from
 * the transcript itself. A session that never had a prompt (a scheduled run,
 * one resumed for a moment) is left out; the caller names it by its ref.
 */
export function sessionLabels(prompts, openers = new Map()) {
  const labels = new Map();
  const sorted = [...prompts].sort((a, b) => a.at - b.at);
  for (const prompt of sorted) {
    if (!prompt.session || labels.has(prompt.session) || isTrackerPrompt(prompt.text)) continue;
    const label = sessionLabel(prompt.text);
    if (label) labels.set(prompt.session, label);
  }
  for (const [id, opener] of openers) if (!labels.has(id)) labels.set(id, opener);
  return labels;
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

/**
 * The jobs a day can still need. `names`: a placeholder row is standing.
 * `bullets`: a measured task has fewer than two outcome bullets - including
 * days named before bullets existed, which is how an older month gets
 * backfilled. `types`: a named task has no work type yet - the same backfill,
 * for days named before types existed. `times`: a measured task has no clock
 * times yet - asked only while the transcripts to read them from are still
 * here (`hasEvidence`), and not before `timesFrom`, the day every computer
 * started counting in full. A day still being named needs all four: every
 * name written gets its bullets, its type and its times in the same pass.
 */
export function dayNeeds(day, { hasEvidence = true, timesFrom = null } = {}) {
  if (day.tasks.some((task) => isPlaceholder(task.name))) return ["names", "bullets", "types", "times"];
  const needs = [];
  if (day.tasks.some(needsBullets)) needs.push("bullets");
  if (day.tasks.some(needsType)) needs.push("types");
  if (hasEvidence && !(timesFrom && day.date < timesFrom) && day.tasks.some(needsTimes)) needs.push("times");
  return needs;
}

/**
 * Named rows whose `When` falls outside anything measured that day, or whose
 * `Session` is not in the day's legend - a slip in the naming, said so it
 * can be fixed before it reaches a PDF. The idle gap is allowed either side,
 * since a block's edges are the last events, not the last minute worked.
 */
export function spanProblems(day, ranges, idleGapMinutes) {
  const problems = [];
  const known = new Set((day.sessions ?? []).map((session) => session.ref));
  const measured = ranges.map((range) => ({
    start: toMinutes(range.start) - idleGapMinutes,
    end: toMinutes(range.end) + idleGapMinutes,
  }));
  for (const task of day.tasks) {
    if (isPlaceholder(task.name) || task.manual) continue;
    for (const range of task.when ?? []) {
      const start = toMinutes(range.start);
      const end = toMinutes(range.end);
      if (end < start || !measured.some((span) => start >= span.start && end <= span.end)) {
        problems.push(`"${task.name}" ${range.start}-${range.end} is outside the measured time`);
      }
    }
    for (const ref of task.sessions ?? []) {
      if (known.size > 0 && !known.has(ref)) problems.push(`"${task.name}" names session ${ref}, not one of the day's`);
    }
  }
  return problems;
}

function writeEvidence(month, id, file, blocks, prompts, commits, timeZone, timesFrom) {
  const days = file.days.map((day) => {
    const dayBlocks = blocks.filter((block) => block.day === day.date);
    const needs = dayNeeds(day, { hasEvidence: dayBlocks.length > 0, timesFrom });
    return {
      date: day.date,
      duration: formatDuration(day.seconds),
      needs,
      tasks: day.tasks.map((task) => ({
        name: task.name,
        ...(task.type ? { type: task.type } : {}),
        ...(task.manual ? { manual: true } : {}),
        ...(task.when ? { when: whenCell(task) } : {}),
        ...(task.sessions ? { sessions: task.sessions } : {}),
        time: formatDuration(task.seconds),
        ...(task.details?.length > 0 ? { details: task.details } : {}),
      })),
      // Who each ref is: the session's opening prompt.
      ...(day.sessions?.length > 0 ? { sessions: day.sessions } : {}),
      blocks: dayBlocks.map((block) => ({
        range: `${toLocalTime(block.start, timeZone)}-${toLocalTime(block.end, timeZone)}`,
        duration: formatDuration((block.end - block.start) / 1000),
        // The sessions working in this block and when - what a task's When
        // and Session cells are read from.
        sessions: (block.sessions ?? []).map((session) => ({
          ref: sessionRef(session.id),
          range: `${toLocalTime(session.start, timeZone)}-${toLocalTime(session.end, timeZone)}`,
        })),
        // Each prompt and commit carries its local time so a long block can be
        // split by when topics actually changed, rather than by guesswork.
        prompts: prompts
          .filter((prompt) => prompt.at >= block.start && prompt.at <= block.end)
          .slice(0, MAX_PROMPTS_PER_BLOCK)
          .map((prompt) => ({
            at: toLocalTime(prompt.at, timeZone),
            ...(prompt.session ? { session: sessionRef(prompt.session) } : {}),
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
 * A type the config does not list splits the "By type" table into a row of its
 * own, so say so - usually a typo, or a category removed after it was used.
 */
function warnUnknownTypes(month, file, categories) {
  const known = new Set(categories ?? []);
  const unknown = new Set(
    file.days.flatMap((day) => day.tasks.map((task) => task.type).filter((type) => type && !known.has(type))),
  );
  if (unknown.size > 0) {
    console.warn(
      `Warning: ${month} uses ${[...unknown].map((type) => `"${type}"`).join(", ")}, ` +
        "not in config.json categories. Fix the Type column or add it to the list.",
    );
  }
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

/**
 * Measure this computer's transcripts and rebuild its month files.
 *
 * `write: false` measures and rebuilds in memory only - nothing on disk
 * changes and nothing is printed. The prompt hook uses it to check the hour
 * budget on every prompt without rewriting the timesheet each time.
 *
 * Returns this computer's rebuilt months (`Map<month, file>`), keyed for
 * `budgetFor`'s `fresh` option, or null when there is nothing to measure.
 */
export function collect({ write = true } = {}) {
  const config = loadConfig();
  const computer = currentComputer();
  const todayDay = toLocalDay(Date.now(), config.timeZone);
  const say = write ? console.log : () => {};

  // The boundary. Absent means the tracker was never set up here, and a run
  // with no boundary would sweep in every transcript this project has ever
  // had - so it stops rather than guessing.
  const trackedFrom = config.trackFrom;
  if (!trackedFrom) {
    say("No trackFrom date in config.json - the tracker is not set up here.");
    say(`Set one (a YYYY-MM-DD day) in ${path.join(TRACKING_DIR, "config.json")}.`);
    return null;
  }

  if (write) mkdirSync(CACHE_DIR, { recursive: true });

  // Time spent updating the tracker is not work. The prompts say when each
  // update began, so those stretches are taken out before anything is
  // measured, and the prompts themselves never reach the evidence - a block
  // that holds nothing else gets no row to name.
  const allPrompts = readPrompts();
  const exclusions = trackerStretches(allPrompts);
  const prompts = allPrompts.filter((prompt) => !isTrackerPrompt(prompt.text));

  const { main: mainInstants, all, holes, sessions, openers } = readTimestamps(
    transcriptDir(),
    config.sentinel,
    exclusions,
  );
  if (all.length === 0) {
    say(`No transcripts found under ${transcriptDir()}.`);
    return { config, computer, todayDay, months: new Map() };
  }

  const options = { idleGapMinutes: config.idleGapMinutes, timeZone: config.timeZone };
  const inRange = (block) =>
    // The boundary. Work predating the install is not part of the record, and
    // nothing in the future is counted, even though transcripts may exist for
    // either.
    isWorkday(block.day, config.workdays) && block.day >= trackedFrom && block.day <= todayDay;

  // Two timelines over the same days. `blocks` is everything - sessions and
  // their subagents - and is what the evidence, the day grouping and the
  // clock times use; each block carries the sessions it holds. `mainBlocks`
  // is the sessions alone: the time the multiplier applies to. What `blocks`
  // holds beyond `mainBlocks` is agent work no session covered, credited at
  // the subagent multiplier.
  const blocks = attachSessions(
    cutHoles(buildBlocks(all, options), holes, sessions, options).filter(inRange),
    sessions,
  );
  const mainBlocks = cutHoles(buildBlocks(mainInstants, options), holes, sessions, options).filter(
    inRange,
  );
  const labels = sessionLabels(prompts, openers);

  const earliest = all.reduce((min, instant) => (instant < min ? instant : min), Infinity);
  const commits = localCommits(earliest, MAX_BODY_LENGTH);

  const byMonth = new Map();
  for (const block of blocks) {
    const month = monthOf(block.day);
    const bucket = byMonth.get(month);
    if (bucket) bucket.push(block);
    else byMonth.set(month, [block]);
  }

  // Rebuild any month with fresh data, plus any month this computer already
  // has on disk, so a month whose transcripts have expired still re-renders.
  // Another computer's months are its own files and are never written here.
  const months = new Set(byMonth.keys());
  const ownMonth = monthFilePattern(computer.fileId);
  for (const name of readdirSync(TRACKING_DIR)) {
    const found = ownMonth.exec(name);
    if (found) months.add(found[1]);
  }

  const clock = (instant) => toLocalTime(instant, config.timeZone);
  const rebuiltMonths = new Map();
  const unnamed = [];
  for (const month of [...months].sort()) {
    const monthBlocks = byMonth.get(month) ?? [];

    const byDate = new Map();
    for (const block of monthBlocks) {
      const bucket = byDate.get(block.day);
      if (bucket) bucket.push(block);
      else byDate.set(block.day, [block]);
    }
    const file = monthFilePath(month, computer.fileId);
    const parsed = existsSync(file) ? parseMonthFile(readFileSync(file, "utf8")) : null;
    // Days recorded before the boundary are dropped. Days after it that this
    // machine holds no evidence for are left alone - the evidence may simply
    // have expired, and dropping the day would delete recorded work.
    const existing = parsed
      ? { ...parsed, days: parsed.days.filter((day) => day.date >= trackedFrom) }
      : null;

    const ranges = new Map();
    const measured = [...byDate.entries()].map(([date, dayBlocks]) => {
      const dayMainBlocks = mainBlocks.filter((block) => block.day === date);
      const ids = [];
      for (const block of dayBlocks) {
        for (const session of block.sessions) if (!ids.includes(session.id)) ids.push(session.id);
      }
      const dayRanges = dayBlocks.map((block) => ({
        start: clock(block.start),
        end: clock(block.end),
        sessions: block.sessions.map((session) => sessionRef(session.id)),
      }));
      ranges.set(date, dayRanges);
      return {
        date,
        blocks: dayMainBlocks,
        unscaledSeconds: uncoveredSeconds(dayBlocks, dayMainBlocks),
        ranges: dayRanges,
        sessions: ids.map((id) => ({ ref: sessionRef(id), label: labels.get(id) ?? `session ${sessionRef(id)}` })),
      };
    });

    const rebuilt = rebuild(
      existing,
      month,
      measured,
      todayDay,
      config.idleGapMinutes,
      config.hoursMultiplier,
      config.subagentMultiplier,
      { fullCountFrom: config.fullCountFrom },
    );
    rebuiltMonths.set(month, rebuilt);
    for (const day of rebuilt.days) {
      if (day.tasks.some((task) => isPlaceholder(task.name))) unnamed.push(day.date);
    }
    if (!write) continue;
    if (rebuilt.days.length === 0) continue;

    const changed = writeIfChanged(file, renderMonthFile(rebuilt, config.workdays));
    warnUnknownTypes(month, rebuilt, config.categories);
    const slips = rebuilt.days.flatMap((day) =>
      ranges.has(day.date)
        ? spanProblems(day, ranges.get(day.date), config.idleGapMinutes).map((problem) => `${day.date} ${problem}`)
        : [],
    );
    if (slips.length > 0) console.warn(`Warning: ${slips.join("; ")}. Fix the When/Session cells.`);
    writeEvidence(month, computer.fileId, rebuilt, monthBlocks, prompts, commits, config.timeZone, config.fullCountFrom);

    // Match the rounding the month file itself prints, so the two never differ.
    const total = rebuilt.days.reduce((sum, day) => sum + Math.round(day.seconds / 60) * 60, 0);
    const count = rebuilt.days.length;
    console.log(
      `${month}: ${formatDuration(total)} across ${count} tracked ${count === 1 ? "day" : "days"}` +
        `${changed ? "" : " (unchanged)"}`,
    );
  }

  // Unnamed time is counted and goes on the PDFs as research - it is real
  // time - but a client reads it as less than a named task, so say which
  // days still have some.
  if (write && unnamed.length > 0) {
    console.warn(
      `Unnamed: ${unnamed.join(", ")} - shown on PDFs as "${FALLBACK_NAME}" until named ("update tracker").`,
    );
  }

  return { config, computer, todayDay, months: rebuiltMonths };
}

function main() {
  const result = collect();
  if (!result) return;
  // The hour budget. Over it, the hours are still recorded as measured - the
  // record is never trimmed - but it is said, and logged once per week or
  // month that crossed it.
  const budget = budgetFor(result.config, result.todayDay);
  if (budget && budget.over.length > 0) {
    console.warn(`Warning: ${describeBudget(budget)}`);
    noteOverBudget(result.computer.fileId, result.config, budget);
  }
}

// A computer with no name yet is an ordinary condition with a one-line fix,
// so it prints as a sentence rather than a stack trace.
// Guarded so the pure parts above can be imported by tests without a run.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
