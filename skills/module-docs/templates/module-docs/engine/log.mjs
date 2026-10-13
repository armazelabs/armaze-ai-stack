// The local log: what this computer decided about each piece of work.
//
//   node <engine>/log.mjs record --decision documented --item s-1a2b3c4d-profiles --entry <file>
//   node <engine>/log.mjs record --decision skipped --session <id> --group profiles
//   node <engine>/log.mjs record --decision deferred --item c-2026-10-13-forums
//   node <engine>/log.mjs show
//
// One JSON object per line in local/log.jsonl, appended, never rewritten. It is
// gitignored on purpose: it records this computer's own sessions, which no
// other computer has. What is documented is also recorded durably in the
// committed entries themselves (their `sessions` and `commits`), so a fresh
// clone that has lost this log still knows what is documented; it only
// forgets what was skipped.
//
// `through` is the moment a decision covers up to: the last edit of that
// group in that session, or the newest of its commits. Work after it is new
// work. The engine computes it from the evidence - it is never typed in.
//
// "deferred" (Not now) resolves nothing. It is kept so the audit shows the
// question was asked.

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { LOCAL_DIR, groupOf, loadConfig, readJson, toRepoRelative } from "./config.mjs";
import { localCommits } from "./git.mjs";
import { findSession, readSession } from "./transcripts.mjs";

export const LOG_PATH = path.join(LOCAL_DIR, "log.jsonl");
export const DECISIONS = ["documented", "skipped", "deferred"];

/** Every record, oldest first. A malformed line is skipped, not fatal. */
export function readLog(file = LOG_PATH) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return [];
  }
  return text
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

export function appendRecord(record, file = LOG_PATH) {
  mkdirSync(path.dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(record)}\n`);
}

/** Whether log records resolve a session's group up to `at`: the latest documented or skipped `through`. */
export function resolvedThrough(records, sessionId, group) {
  let through = -Infinity;
  for (const record of records) {
    if (record.kind !== "documented" && record.kind !== "skipped") continue;
    if (!record.session || !sessionId || !(record.session.startsWith(sessionId) || sessionId.startsWith(record.session))) continue;
    if (record.group !== group) continue;
    const at = Date.parse(record.through ?? "");
    if (!Number.isNaN(at)) through = Math.max(through, at);
  }
  return through;
}

/** Commits a documented or skipped record names. */
export function resolvedCommits(records) {
  const shas = new Set();
  for (const record of records) {
    if (record.kind === "documented" || record.kind === "skipped") for (const sha of record.commits ?? []) shas.add(String(sha));
  }
  return shas;
}

function flagValues(args, name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) if (args[index] === name && args[index + 1] != null) values.push(args[index + 1]);
  return values;
}

/** The group's last edit in a session, as an ISO time - or null when it made none. */
export function lastEditOf(session, group, config) {
  let last = null;
  for (const edit of session.edits) {
    if (groupOf(edit.path, config) === group && edit.at != null) last = Math.max(last ?? 0, edit.at);
  }
  return last === null ? null : new Date(last).toISOString();
}

async function record(args) {
  const config = loadConfig();
  if (!config) throw new Error("module-docs is not set up here.");
  const decision = flagValues(args, "--decision")[0];
  if (!DECISIONS.includes(decision)) throw new Error(`--decision must be ${DECISIONS.join(", ")}.`);
  const itemId = flagValues(args, "--item")[0] ?? null;
  const entryArg = flagValues(args, "--entry")[0] ?? null;
  const entry = entryArg ? toRepoRelative(entryArg) ?? entryArg : null;
  const filedUnder = flagValues(args, "--filed-under")[0] ?? null;
  const extraCommits = flagValues(args, "--commit");

  let sessionId = flagValues(args, "--session")[0] ?? null;
  let group = flagValues(args, "--group")[0] ?? null;
  let through = null;
  let commits = [...extraCommits];

  if (itemId) {
    // From the item's evidence file when there is one: by the time a decision
    // is recorded, the entry it wrote already resolves the item, so it is no
    // longer in the pending list.
    const evidence = readJson(path.join(LOCAL_DIR, "evidence", `${itemId}.json`));
    let item = null;
    if (!evidence) {
      const { pendingWork } = await import("./scan.mjs");
      item = pendingWork({ config }).items.find((candidate) => candidate.id === itemId) ?? null;
      if (!item) throw new Error(`No evidence and no pending item for ${itemId} - run evidence.mjs ${itemId} first.`);
    }
    group = evidence?.group ?? item.group;
    if ((evidence?.kind ?? item.kind) === "session") {
      const session = findSession(evidence?.session ?? item.session);
      sessionId = session?.id ?? evidence?.session ?? item.session;
      through = (session && lastEditOf(readSession(session.file, { light: true, subagents: session.subagents }), group, config)) ?? new Date(item?.lastAt ?? Date.now()).toISOString();
    } else {
      const own = evidence?.commits ?? [];
      commits = [...new Set([...commits, ...own.map((commit) => commit.sha), ...(item?.commits ?? [])])];
      const latest = Math.max(...own.map((commit) => commit.at ?? 0), item?.lastAt ?? 0);
      through = new Date(latest > 0 ? latest : Date.now()).toISOString();
    }
  } else if (sessionId && group) {
    const session = findSession(sessionId);
    if (!session) throw new Error(`No transcript for session ${sessionId}.`);
    sessionId = session.id;
    through = lastEditOf(readSession(session.file, { light: true, subagents: session.subagents }), group, config);
    if (!through) through = new Date().toISOString();
  } else if (commits.length > 0) {
    const known = localCommits({}).filter((commit) => commits.some((sha) => commit.full.startsWith(sha)));
    through = new Date(Math.max(...known.map((commit) => commit.at), Date.now() - 1)).toISOString();
  } else {
    throw new Error("record needs --item, or --session with --group, or --commit.");
  }

  const line = {
    at: new Date().toISOString(),
    kind: decision,
    item: itemId,
    session: sessionId,
    group,
    filedUnder,
    through,
    commits,
    entry,
  };
  appendRecord(line);
  console.log(`Recorded ${decision}${group ? ` for ${group}` : ""}${sessionId ? ` (session ${sessionId.slice(0, 8)})` : ""}, through ${through}.`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "record") return record(args);
  if (command === "show" || !command) {
    for (const line of readLog()) {
      console.log(`${line.at} ${line.kind} ${line.group ?? ""} ${line.session ? line.session.slice(0, 8) : ""} ${line.entry ?? ""}`.trim());
    }
    return;
  }
  throw new Error(`Unknown command "${command}". Try record or show.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}

