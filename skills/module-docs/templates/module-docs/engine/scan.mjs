// What this computer has done since install that nobody has documented yet.
//
//   node <engine>/scan.mjs [--json] [--exclude-session <id>]
//
// Two kinds of pending item, both from this computer's own evidence:
//
//   s-<session8>-<group>   a session's edits to one module (or one unassigned
//                          area) that no decision covers yet
//   c-<day>-<group>        commits made here on one day whose files no session
//                          edited that day - work done outside Claude Code
//
// A session's edits in a group are resolved up to the latest of:
//
//   - a "documented" or "skipped" record in the local log (its `through`)
//   - a "Don't document" answer to module-docs' own question in the transcript
//   - a committed history entry listing the session (resolves the group whole)
//
// "Not now" resolves nothing: the work stays pending and comes back at the next
// session's catch-up. Read-only apart from local/scan-index.json, a cache of
// the light transcript reads keyed by file size and modification time.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { LOCAL_DIR, MODULES_DIR, REPO_ROOT, areaKey, groupOf, groupToken, loadConfig, localDay, toRepoRelative, writeIfChanged } from "./config.mjs";
import { localCommits, uncommitted } from "./git.mjs";
import { readLog, resolvedCommits, resolvedThrough } from "./log.mjs";
import { documentedRefs } from "./pages.mjs";
import { adoptable } from "./requirements.mjs";
import { isSkipAnswer, listSessions, readSession } from "./transcripts.mjs";

export const INDEX_PATH = path.join(LOCAL_DIR, "scan-index.json");
const INDEX_VERSION = 1;
/** Headers of module-docs' own questions whose answers resolve work. */
const DOC_HEADERS = new Set(["Document", "Catch-up"]);

function loadIndex(file) {
  try {
    const index = JSON.parse(readFileSync(file, "utf8"));
    if (index?.version === INDEX_VERSION && index.files) return index;
  } catch {
    // No cache yet.
  }
  return { version: INDEX_VERSION, files: {} };
}

/** A session read lightly, from the cache when its files have not changed. */
function lightSession(session, index, repoRoot) {
  const key = session.file;
  const stamp = `${session.size}:${Math.round(session.mtimeMs)}:${session.subagents.length}`;
  const cached = index.files[key];
  if (cached?.stamp === stamp) return cached.session;
  const read = readSession(session.file, { repoRoot, light: true, subagents: session.subagents });
  const compact = {
    id: read.id,
    title: read.title,
    firstPrompt: read.firstPrompt,
    firstAt: read.firstAt,
    lastAt: read.lastAt,
    edits: read.edits.map(({ path: file, at }) => ({ path: file, at })),
    asks: read.asks.map((ask) => ({
      at: ask.at,
      answeredAt: ask.answeredAt,
      questions: ask.questions.filter((question) => DOC_HEADERS.has(question.header)).map(({ question, header, answer }) => ({ question, header, answer })),
    })),
  };
  index.files[key] = { stamp, session: compact };
  index.dirty = true;
  return compact;
}

/**
 * When a session's "Don't document" answers resolve each group: the answer's
 * time, for the groups its question names - or every group when it names none.
 */
export function skipTimes(session, groups, config) {
  const times = new Map();
  for (const ask of session.asks) {
    for (const question of ask.questions) {
      if (!DOC_HEADERS.has(question.header) || !isSkipAnswer(question.answer)) continue;
      const text = `${question.question} ${question.answer}`.toLowerCase();
      const named = groups.filter((group) => {
        const module = config.modules.find((entry) => entry.id === group);
        const words = module ? [module.name, module.id] : [group.slice(5)];
        return words.some((word) => word && text.includes(String(word).toLowerCase()));
      });
      const at = ask.answeredAt ?? ask.at ?? 0;
      for (const group of named.length > 0 ? named : groups) times.set(group, Math.max(times.get(group) ?? -Infinity, at));
    }
  }
  return times;
}

function shortId(id) {
  return String(id ?? "").slice(0, 8);
}

function labelOf(session) {
  return session.title ?? session.firstPrompt ?? "an untitled session";
}

/** A group's display fields: a module's id and name, or an unassigned area from one of its files. */
function describeGroup(group, config, sampleFile) {
  if (!group.startsWith("area:")) {
    const module = config.modules.find((entry) => entry.id === group);
    return { module: group, name: module?.name ?? group };
  }
  const area = areaKey(sampleFile);
  return { area, name: area.label };
}

/**
 * Everything pending on this computer. `{ items, areas, adopt, unpublished }`.
 * `excludeSession` leaves out the session asking (its own work is the turn-end
 * check's business, not the catch-up's).
 */
export function pendingWork({ config, repoRoot = REPO_ROOT, modulesDir = MODULES_DIR, excludeSession = null, indexPath = INDEX_PATH, sessions = null } = {}) {
  const installedMs = Date.parse(config.installed ?? "") || 0;
  const records = readLog(path.join(path.dirname(indexPath), "log.jsonl"));
  const refs = documentedRefs(modulesDir);
  const index = loadIndex(indexPath);
  const items = [];
  const editedByDay = new Map();

  for (const session of sessions ?? listSessions(repoRoot)) {
    if (session.mtimeMs < installedMs) continue;
    const read = lightSession(session, index, repoRoot);
    for (const edit of read.edits) {
      if (edit.at == null) continue;
      const day = localDay(edit.at, config.timeZone);
      if (!editedByDay.has(day)) editedByDay.set(day, new Set());
      editedByDay.get(day).add(edit.path);
    }
    if (excludeSession && (session.id.startsWith(excludeSession) || excludeSession.startsWith(session.id))) continue;

    const byGroup = new Map();
    for (const edit of read.edits) {
      if (edit.at == null || edit.at < installedMs) continue;
      const group = groupOf(edit.path, config);
      if (!group) continue;
      if (!byGroup.has(group)) byGroup.set(group, []);
      byGroup.get(group).push(edit);
    }
    const skips = skipTimes(read, [...byGroup.keys()], config);
    for (const [group, edits] of byGroup) {
      const documented = refs.some((ref) => ref.module === group && ref.sessions.some((id) => id && (session.id.startsWith(id) || id.startsWith(session.id))));
      if (documented) continue;
      const through = Math.max(resolvedThrough(records, session.id, group), skips.get(group) ?? -Infinity);
      const open = edits.filter((edit) => edit.at > through);
      if (open.length === 0) continue;
      const files = [...new Set(open.map((edit) => edit.path))];
      const lastAt = Math.max(...open.map((edit) => edit.at));
      items.push({
        id: `s-${shortId(session.id)}-${groupToken(group)}`,
        kind: "session",
        session: session.id,
        group,
        ...describeGroup(group, config, files[0]),
        title: labelOf(read),
        files,
        firstAt: Math.min(...open.map((edit) => edit.at)),
        lastAt,
        day: localDay(lastAt, config.timeZone),
      });
    }
  }

  // Commits made here whose files no session edited that day.
  const covered = resolvedCommits(records);
  const entryCommits = refs.flatMap((ref) => ref.commits);
  const commitItems = new Map();
  for (const commit of localCommits({ sinceMs: installedMs, repoRoot })) {
    if ([...covered, ...entryCommits].some((sha) => sha && (commit.full.startsWith(sha) || sha.startsWith(commit.sha)))) continue;
    const day = localDay(commit.at, config.timeZone);
    const edited = editedByDay.get(day) ?? new Set();
    for (const file of commit.files) {
      const rel = toRepoRelative(file, repoRoot) ?? file;
      if (edited.has(rel)) continue;
      const group = groupOf(rel, config);
      if (!group) continue;
      const id = `c-${day}-${groupToken(group)}`;
      if (!commitItems.has(id)) {
        commitItems.set(id, { id, kind: "commits", group, ...describeGroup(group, config, rel), title: commit.subject, files: [], commits: [], firstAt: commit.at, lastAt: commit.at, day });
      }
      const item = commitItems.get(id);
      if (!item.files.includes(rel)) item.files.push(rel);
      if (!item.commits.includes(commit.sha)) item.commits.push(commit.sha);
      item.firstAt = Math.min(item.firstAt, commit.at);
      item.lastAt = Math.max(item.lastAt, commit.at);
    }
  }
  items.push(...commitItems.values());
  items.sort((a, b) => a.lastAt - b.lastAt);

  const areas = new Map();
  for (const item of items) {
    if (!item.group.startsWith("area:")) continue;
    const key = item.group.slice(5);
    const area = areas.get(key) ?? { ...areaKey(item.files[0]), files: [], items: [] };
    for (const file of item.files) if (!area.files.includes(file)) area.files.push(file);
    area.items.push(item.id);
    areas.set(key, area);
  }

  if (index.dirty) {
    delete index.dirty;
    try {
      writeIfChanged(indexPath, `${JSON.stringify(index)}\n`);
    } catch {
      // A cache that cannot be written only costs speed.
    }
  }

  const adopt = config.requirements ? adoptable(config, repoRoot).adopt : [];
  const modulesRel = toRepoRelative(modulesDir, repoRoot);
  const unpublished = config.publish?.mode === "commit-and-push" && modulesRel ? [...uncommitted([modulesRel], repoRoot).keys()] : [];
  return { items, areas: [...areas.values()], adopt, unpublished };
}

/** One line per item, for a person or a hook. */
export function describeItem(item) {
  const where = item.module ? item.name : `${item.name} (no module yet)`;
  const what = item.kind === "session" ? `"${item.title}"` : `commit${item.commits.length === 1 ? "" : "s"} ${item.commits.join(", ")}`;
  return `${item.day} ${where}: ${what} (${item.files.length} file${item.files.length === 1 ? "" : "s"}) [${item.id}]`;
}

function main() {
  const args = process.argv.slice(2);
  const config = loadConfig();
  if (!config) {
    console.error("module-docs is not set up here.");
    process.exit(1);
  }
  const excludeIndex = args.indexOf("--exclude-session");
  const excludeSession = excludeIndex === -1 ? null : args[excludeIndex + 1];
  const result = pendingWork({ config, excludeSession });
  if (args.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (result.items.length === 0) console.log("Nothing pending - every piece of work since install is documented or skipped.");
  else {
    console.log(`${result.items.length} piece${result.items.length === 1 ? "" : "s"} of work not documented yet:`);
    for (const item of result.items) console.log(`- ${describeItem(item)}`);
  }
  for (const area of result.areas) console.log(`Area with no module: ${area.label} (${area.files.length} file(s)) - ask once: a new module, an existing one, or excluded.`);
  for (const module of result.adopt) console.log(`Requirements module not here yet: ${module.slug} (${module.name}) - run config.mjs adopt.`);
  if (result.unpublished.length > 0) console.log(`Docs written but not committed: ${result.unpublished.length} file(s) - publish them once their work is committed.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
