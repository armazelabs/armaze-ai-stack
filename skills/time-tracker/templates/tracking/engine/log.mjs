// The run log: what each `update tracker` actually did.
//
//   node <tracking>/engine/log.mjs record --named 2026-09-08,2026-09-09 --session 4c11d0a
//
// One JSON object per line in <tracking>/log.<computer>.jsonl, appended
// newest-last - one per computer, so two computers never append to the same
// file, and each reads commits forward from where it itself left off. It
// records the days named, the commits consumed, the session that did it and
// the month total afterwards - an audit trail for a timesheet a client sees.
//
// It is also the watermark. The last line's `throughCommit` is where the next
// run starts reading commits from, so there is no separate state file to fall
// out of step with the log - the log *is* the state.
//
// Two things it is deliberately not:
//
//   - A source of hours. The month markdown is the record; nothing here ever
//     feeds a number back into it.
//   - A gate on what gets named. The watermark narrows what has to be *read*,
//     never what is allowed to be named. A day with hours and no commits is
//     still named, which is why `pending.json` is built from placeholders
//     rather than from this file. Most work is uncommitted at the moment it is
//     measured, so a log-driven skip would lose real days.

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { formatDuration } from "./blocks.mjs";
import { REPO_ROOT, currentComputer, loadConfig, logPath, monthFilePath, monthOf } from "./config.mjs";
import { parseMonthFile } from "./month-file.mjs";

/**
 * Every entry, oldest first. A malformed line is skipped rather than fatal -
 * an append-only log that has been hand-edited must still be readable, and a
 * corrupt line costs a watermark, not the timesheet.
 */
export function readLog(id) {
  const file = logPath(id);
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * The watermark: the last commit a previous run got through, or null.
 *
 * Read from the newest entry that has one, so a run in a project with no git
 * (which logs `throughCommit: null`) does not erase the watermark left by a
 * run that did have commits.
 */
export function lastCommit(id, entries = readLog(id)) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (entries[index]?.throughCommit) return entries[index].throughCommit;
  }
  return null;
}

function git(args) {
  return execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
}

/** Short HEAD sha, or null where there is no git - which is not an error. */
export function headCommit() {
  try {
    return git(["rev-parse", "--short", "HEAD"]).trim() || null;
  } catch {
    return null;
  }
}

function isKnownCommit(sha) {
  if (!sha) return false;
  try {
    git(["rev-parse", "--verify", `${sha}^{commit}`]);
    return true;
  } catch {
    // Rebased, amended or squashed away. The watermark is gone, and the
    // fallback below is what keeps that from being a failure.
    return false;
  }
}

/**
 * A reflog entry that is a commit made here: a plain commit, an amend, a
 * merge commit, the first commit. Pulls, merges that fast-forward, checkouts,
 * resets and cherry-picks move HEAD onto commits made somewhere else.
 */
const MADE_HERE = /^commit(?: \((?:initial|amend|merge)\))?:/;

/**
 * Commits made on this computer, from `git log -g` output, newest first.
 *
 * The reflog is the one record git keeps per checkout of what happened in
 * it, so it answers "which commits did this computer make" without asking
 * who anyone is. A commit amended or rebased away stays in it, so its
 * evidence is not lost; an amend chain - the same author time and subject -
 * is kept once, as its newest entry.
 *
 * Records are `\x1e`-separated `full sha, short sha, author time, reflog
 * subject, subject, body` with tabs between - see `localCommits`.
 */
export function parseReflog(text) {
  const seen = new Set();
  const commits = [];
  for (const record of text.split("\x1e")) {
    if (!record.trim()) continue;
    const [full, sha, seconds, reflog, subject, ...body] = record.replace(/^\n+/, "").split("\t");
    if (!MADE_HERE.test(reflog ?? "")) continue;
    const at = Number(seconds) * 1000;
    const chain = `${at}\t${subject}`;
    if (seen.has(full) || seen.has(chain)) continue;
    seen.add(full);
    seen.add(chain);
    commits.push({ full, sha, at, subject: subject ?? "", body: body.join("\t") });
  }
  return commits;
}

/** The reflog of this checkout's HEAD, parsed. Empty where there is no git. */
function reflog() {
  try {
    return parseReflog(
      execFileSync("git", ["log", "-g", "HEAD", "--format=%x1e%H%x09%h%x09%at%x09%gs%x09%s%x09%b"], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        maxBuffer: 64 * 1024 * 1024,
      }),
    );
  } catch {
    return [];
  }
}

/**
 * This computer's commits since `sinceMs`, oldest first, for the labelling
 * evidence. Read-only, like every git call here - nothing stages, commits or
 * pushes. A teammate's commit pulled in is not evidence of what this
 * computer did, and naming its time from it would put their work on it.
 */
export function localCommits(sinceMs, maxBody = 600) {
  return reflog()
    .filter((commit) => commit.at >= sinceMs)
    .map(({ at, sha, subject, body }) => ({
      at,
      sha,
      subject,
      body: body.replace(/\s+/g, " ").trim().slice(0, maxBody),
    }))
    .reverse();
}

/** Full shas of every commit made on this computer. */
export function localCommitShas() {
  return new Set(reflog().map((commit) => commit.full));
}

/**
 * The commits this run consumed - this computer's only, the same rule the
 * collector applies to its evidence.
 *
 * From the watermark where it still exists in history, and otherwise from the
 * earliest day being named - because a rebase must degrade to "read a bit
 * more" rather than to an error or to silently reading nothing.
 */
export function commitsSince(sha, sinceDay, localShas) {
  const format = "--format=%H%x09%h%x09%s";
  try {
    const out = isKnownCommit(sha)
      ? git(["log", `${sha}..HEAD`, format])
      : git(["log", `--since=${sinceDay}T00:00:00`, format]);
    return out
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [full, short, ...rest] = line.split("\t");
        return { full, sha: short, subject: rest.join("\t") };
      })
      .filter((commit) => localShas.has(commit.full))
      .map(({ sha: short, subject }) => ({ sha: short, subject }))
      .reverse();
  } catch {
    return [];
  }
}

/** The month's recorded total, read back from the markdown after the naming. */
export function monthTotal(month, id) {
  const file = monthFilePath(month, id);
  if (!existsSync(file)) return null;
  const { days } = parseMonthFile(readFileSync(file, "utf8"));
  return formatDuration(days.reduce((sum, day) => sum + Math.round(day.seconds / 60) * 60, 0));
}

export function appendEntry(id, entry) {
  appendFileSync(logPath(id), `${JSON.stringify(entry)}\n`);
  return entry;
}

function flag(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function main() {
  if ((process.argv[2] ?? "").toLowerCase() !== "record") {
    console.error("Usage: node log.mjs record --named <YYYY-MM-DD,…> [--session <id>]");
    process.exit(1);
  }

  const named = (flag("named") ?? "")
    .split(",")
    .map((day) => day.trim())
    .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day))
    .sort();

  const config = loadConfig();
  const computer = currentComputer();
  const month = flag("month") ?? monthOf(named[0] ?? new Date().toISOString().slice(0, 10));
  const previous = lastCommit(computer.fileId);
  const commits = commitsSince(previous, named[0] ?? month + "-01", localCommitShas());
  const head = headCommit();

  const entry = appendEntry(computer.fileId, {
    at: new Date().toLocaleString("sv", { timeZone: config.timeZone }).replace(" ", "T"),
    month,
    session: flag("session"),
    namedDays: named,
    // The watermark moves to HEAD, not to the newest commit read - so commits
    // landing between the read and now are picked up next time rather than
    // being stepped over.
    throughCommit: head,
    commits,
    monthTotal: monthTotal(month, computer.fileId),
  });

  console.log(
    `Logged: named ${named.length > 0 ? named.join(", ") : "nothing"}` +
      `${commits.length > 0 ? `, ${commits.length} commit(s)` : ""}` +
      `${entry.monthTotal ? `, ${month} now ${entry.monthTotal}` : ""}.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
