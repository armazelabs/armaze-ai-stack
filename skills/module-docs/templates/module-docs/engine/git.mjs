// Git, read-only. Every git call module-docs makes outside publish.mjs is here,
// and none of them stages, commits, fetches or pushes.
//
// Two kinds of commit evidence:
//
//   - localCommits()    commits made in this checkout (its reflog) - the
//                       evidence for this computer's own work, the same rule
//                       time-tracker uses
//   - historyCommits()  every author's commits in a date range - the first
//                       run's backfill, which documents the project's past
//
// Neither reads author names or emails: who did what never reaches a page,
// and the simplest way to keep it off is never to read it.

import { execFileSync } from "node:child_process";

import { REPO_ROOT } from "./config.mjs";

const RECORD = "\x1e";
const FIELD = "\x1f";
const FILES = "\x1d";

export function git(args, { cwd = REPO_ROOT, input } = {}) {
  return execFileSync("git", args, {
    cwd,
    input,
    encoding: "utf8",
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "ignore"],
    maxBuffer: 128 * 1024 * 1024,
  });
}

function tryGit(args, options) {
  try {
    return git(args, options);
  } catch {
    return null;
  }
}

/**
 * A reflog entry that is a commit made here: a plain commit, an amend, a
 * merge commit, the first commit. Pulls, fast-forwards, checkouts, resets and
 * cherry-picks move HEAD onto commits made somewhere else.
 */
const MADE_HERE = /^commit(?: \((?:initial|amend|merge)\))?:/;

function splitFiles(text) {
  return (text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * `git log -g` output made with {@link REFLOG_FORMAT}, as commits made here,
 * newest first. An amend chain - the same author time and subject - is kept
 * once, as its newest entry.
 */
export function parseReflog(text) {
  const seen = new Set();
  const commits = [];
  for (const record of text.split(RECORD)) {
    if (!record.trim()) continue;
    const [header, files] = record.split(FILES);
    const [full, sha, seconds, reflog, subject, body] = header.replace(/^\n+/, "").split(FIELD);
    if (!MADE_HERE.test(reflog ?? "")) continue;
    const at = Number(seconds) * 1000;
    const chain = `${at}\t${subject}`;
    if (seen.has(full) || seen.has(chain)) continue;
    seen.add(full);
    seen.add(chain);
    commits.push({ full, sha, at, subject: subject ?? "", body: (body ?? "").trim(), files: splitFiles(files) });
  }
  return commits;
}

const REFLOG_FORMAT = `--format=${RECORD}%H${FIELD}%h${FIELD}%at${FIELD}%gs${FIELD}%s${FIELD}%b${FILES}`;
const LOG_FORMAT = `--format=${RECORD}%H${FIELD}%h${FIELD}%at${FIELD}%s${FIELD}%b${FILES}`;

/** `git log` output made with {@link LOG_FORMAT}, newest first. */
export function parseLog(text) {
  const commits = [];
  for (const record of text.split(RECORD)) {
    if (!record.trim()) continue;
    const [header, files] = record.split(FILES);
    const [full, sha, seconds, subject, body] = header.replace(/^\n+/, "").split(FIELD);
    if (!full) continue;
    commits.push({ full, sha, at: Number(seconds) * 1000, subject: subject ?? "", body: (body ?? "").trim(), files: splitFiles(files) });
  }
  return commits;
}

/** Commits made in this checkout since `sinceMs`, oldest first, with the files each touched. */
export function localCommits({ sinceMs = 0, repoRoot = REPO_ROOT } = {}) {
  const out = tryGit(["log", "-g", "HEAD", "--name-only", REFLOG_FORMAT], { cwd: repoRoot });
  if (!out) return [];
  return parseReflog(out)
    .filter((commit) => commit.at >= sinceMs)
    .reverse();
}

/** Every author's commits (no merges) from `since` to `until` (`YYYY-MM-DD` or ISO), oldest first. */
export function historyCommits({ since, until, repoRoot = REPO_ROOT } = {}) {
  const args = ["log", "--no-merges", "--name-only", LOG_FORMAT];
  if (since) args.push(`--since=${since.length === 10 ? `${since}T00:00:00` : since}`);
  if (until) args.push(`--until=${until}`);
  const out = tryGit(args, { cwd: repoRoot });
  if (!out) return [];
  return parseLog(out).reverse();
}

/**
 * Uncommitted state of the given paths (or all), as `Map<path, code>`: the
 * two-letter porcelain code, `??` for untracked. Absent means committed.
 */
export function uncommitted(paths = [], repoRoot = REPO_ROOT) {
  const out = tryGit(["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ...paths], { cwd: repoRoot });
  const result = new Map();
  if (!out) return result;
  const parts = out.split("\0");
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (!part) continue;
    const code = part.slice(0, 2);
    result.set(part.slice(3), code);
    // A rename carries its old path as the next field.
    if (code[0] === "R" || code[0] === "C") index += 1;
  }
  return result;
}

export function isGitRepo(repoRoot = REPO_ROOT) {
  return tryGit(["rev-parse", "--is-inside-work-tree"], { cwd: repoRoot })?.trim() === "true";
}

export function currentBranch(repoRoot = REPO_ROOT) {
  return tryGit(["branch", "--show-current"], { cwd: repoRoot })?.trim() || null;
}

export function remoteExists(remote, repoRoot = REPO_ROOT) {
  return tryGit(["remote", "get-url", remote], { cwd: repoRoot }) !== null;
}

export function gitUser(repoRoot = REPO_ROOT) {
  return {
    name: tryGit(["config", "user.name"], { cwd: repoRoot })?.trim() || null,
    email: tryGit(["config", "user.email"], { cwd: repoRoot })?.trim() || null,
  };
}

/** Commits on HEAD the remote branch has not got, by the last fetch. Null when unknown. */
export function unpushed(remote, branch, repoRoot = REPO_ROOT) {
  const upstream = tryGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], { cwd: repoRoot })?.trim();
  const base = upstream || `${remote}/${branch}`;
  const out = tryGit(["log", "--format=%h %s", `${base}..HEAD`], { cwd: repoRoot });
  if (out === null) return null;
  return out.split("\n").filter(Boolean);
}

/** Every author name and email in the history - for the lint that keeps them off the pages. */
export function authorIdentities(repoRoot = REPO_ROOT) {
  const out = tryGit(["log", "--all", `--format=%an${FIELD}%ae`], { cwd: repoRoot });
  const identities = new Set();
  for (const line of (out ?? "").split("\n")) {
    const [name, email] = line.split(FIELD);
    if (name) identities.add(`name\t${name}`);
    if (email) identities.add(`email\t${email}`);
  }
  return [...identities].map((entry) => {
    const [kind, value] = entry.split("\t");
    return { kind, value };
  });
}

/** Files tracked in the checkout. */
export function trackedFiles(repoRoot = REPO_ROOT) {
  return (tryGit(["ls-files"], { cwd: repoRoot }) ?? "").split("\n").filter(Boolean);
}

/** `TODO`, `FIXME` and `OPEN QUESTION` markers in the given files, capped. */
export function markers(files, repoRoot = REPO_ROOT, cap = 40) {
  if (files.length === 0) return [];
  const out = tryGit(["grep", "-n", "-I", "-E", "TODO|FIXME|OPEN QUESTION", "--", ...files], { cwd: repoRoot });
  return (out ?? "")
    .split("\n")
    .filter(Boolean)
    .slice(0, cap)
    .map((line) => line.replace(/\s+/g, " ").slice(0, 240));
}
