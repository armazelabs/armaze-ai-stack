// The evidence a history entry is written from - so Claude reads one small
// file, never a whole transcript.
//
//   node <engine>/evidence.mjs <item-id>                       # a pending item from scan.mjs
//   node <engine>/evidence.mjs --session <id> --group <group>  # the work just finished, in-session
//   node <engine>/evidence.mjs backfill [--since YYYY-MM-DD] [--until <ISO>]
//   node <engine>/evidence.mjs inventory <module>
//
// Each writes JSON under local/evidence/ (backfill: local/backfill.json) and
// prints where, with a short summary. What goes in:
//
//   - files       the group's files, each committed or not
//   - prompts     what the person asked
//   - plans       plans put up for approval, approved or not
//   - questions   every question asked, every option marked chosen or not -
//                 the "Decisions made", including what was dropped
//   - summaries   what Claude reported at the end of each turn
//   - commits     commits made here around the session, on those files
//   - requirements the module's PRDs, asks and decisions, each marked
//                 `mentioned` when the session named or read it
//
// What never goes in: author names, emails, durations, computer names.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { LOCAL_DIR, REPO_ROOT, areaKey, classify, groupOf, groupToken, loadConfig, localDay } from "./config.mjs";
import { historyCommits, localCommits, markers, trackedFiles, uncommitted } from "./git.mjs";
import { forModule, readRequirements } from "./requirements.mjs";
import { decisionsOf, findSession, readSession } from "./transcripts.mjs";

export const EVIDENCE_DIR = path.join(LOCAL_DIR, "evidence");
export const BACKFILL_PATH = path.join(LOCAL_DIR, "backfill.json");
const MAX_BYTES = 30 * 1024;
const HOUR = 60 * 60 * 1000;

function clip(text, max) {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** The module's requirements, each marked `mentioned` when the corpus names its ID, file or title. */
export function requirementEvidence(config, moduleId, corpus, reads = [], repoRoot = REPO_ROOT) {
  if (!config.requirements || !moduleId || moduleId.startsWith("area:")) return null;
  const found = forModule(readRequirements(config, repoRoot), moduleId);
  const text = corpus.toLowerCase();
  const mentioned = (item) =>
    (item.ids ?? (item.id ? [item.id] : [])).some((id) => text.includes(id.toLowerCase())) ||
    (item.file && (reads.includes(item.file) || text.includes(item.file.toLowerCase()))) ||
    (item.title && item.title.length > 8 && text.includes(item.title.toLowerCase()));
  return {
    features: found.features.map((item) => ({ title: item.title, status: item.status, summary: item.summary, file: item.file, ids: item.ids, mentioned: mentioned(item) })),
    asks: found.asks.map((item) => ({ title: item.title, status: item.status, ids: item.ids, mentioned: mentioned(item) })),
    decisions: found.decisions.map((item) => ({ title: item.title, status: item.status, id: item.id, file: item.file, mentioned: mentioned(item) })),
  };
}

function fileStates(files, repoRoot) {
  const state = uncommitted(files, repoRoot);
  return files.map((file) => ({ path: file, committed: !state.has(file) }));
}

/** Trim the bulkiest parts until the evidence fits in {@link MAX_BYTES}. */
export function fit(evidence) {
  const size = () => Buffer.byteLength(JSON.stringify(evidence));
  const steps = [
    () => (evidence.summaries = (evidence.summaries ?? []).slice(-12)),
    () => (evidence.prompts = (evidence.prompts ?? []).slice(-25)),
    () => (evidence.plans = (evidence.plans ?? []).map((plan) => ({ ...plan, text: plan.text.length > 3000 ? `${plan.text.slice(0, 2999)}…` : plan.text }))),
    () => (evidence.questions = (evidence.questions ?? []).map((question) => ({ ...question, options: question.options.map(({ label, chosen }) => ({ label, chosen })) }))),
    () => (evidence.summaries = (evidence.summaries ?? []).slice(-5)),
    () => (evidence.plans = (evidence.plans ?? []).slice(-2).map((plan) => ({ ...plan, text: plan.text.length > 1500 ? `${plan.text.slice(0, 1499)}…` : plan.text }))),
    () => (evidence.commits = (evidence.commits ?? []).map((commit) => ({ ...commit, body: clip(commit.body, 200) }))),
    () => (evidence.files = (evidence.files ?? []).slice(0, 60)),
  ];
  for (const step of steps) {
    if (size() <= MAX_BYTES) break;
    step();
  }
  evidence.trimmed = size() > MAX_BYTES ? "still over 30 KB after trimming" : undefined;
  return evidence;
}

/** Evidence for one session's work in one group. `since` limits it to edits after a resolved point. */
export function sessionEvidence({ config, session, group, since = -Infinity, repoRoot = REPO_ROOT }) {
  const read = readSession(session.file, { repoRoot, subagents: session.subagents });
  const edits = read.edits.filter((edit) => groupOf(edit.path, config) === group && (edit.at ?? 0) > since);
  const counts = new Map();
  for (const edit of edits) counts.set(edit.path, (counts.get(edit.path) ?? 0) + 1);
  const files = [...counts.keys()];
  const otherGroups = [...new Set(read.edits.map((edit) => groupOf(edit.path, config)).filter((other) => other && other !== group))];
  // Commits made here from the session's start to an hour after its last
  // edit in the group - the person often commits just after the session ends.
  const firstAt = read.firstAt ?? edits[0]?.at ?? 0;
  const lastAt = edits.at(-1)?.at ?? read.lastAt ?? Date.now();
  const commits = localCommits({ sinceMs: firstAt, repoRoot })
    .filter((commit) => commit.at <= lastAt + HOUR && commit.files.some((file) => files.includes(file)))
    .map((commit) => ({ sha: commit.sha, subject: commit.subject, body: clip(commit.body, 600), files: commit.files.filter((file) => files.includes(file)) }));
  const questions = read.asks.flatMap(decisionsOf);
  const plans = read.plans.map((plan) => ({ approved: plan.approved, text: plan.text }));
  const corpus = [...read.prompts.map((prompt) => prompt.text), ...plans.map((plan) => plan.text), ...questions.map((question) => `${question.question} ${question.answer}`)].join("\n");
  const module = group.startsWith("area:") ? null : config.modules.find((entry) => entry.id === group);
  return fit({
    kind: "session",
    session: read.id,
    group,
    module: module ? { id: module.id, name: module.name } : null,
    area: group.startsWith("area:") && files[0] ? areaKey(files[0]) : null,
    title: read.title ?? read.firstPrompt,
    date: localDay(lastAt, config.timeZone),
    files: fileStates(files, repoRoot).map((file) => ({ ...file, edits: counts.get(file.path) })),
    otherGroups,
    prompts: read.prompts.slice(-40).map((prompt) => prompt.text),
    plans,
    questions,
    summaries: read.summaries.map((summary) => summary.text),
    commits,
    requirements: requirementEvidence(config, group, corpus, read.reads, repoRoot),
  });
}

/** Evidence for a commit-only item: commits made here with no session behind them. */
export function commitEvidence({ config, item, repoRoot = REPO_ROOT }) {
  const wanted = new Set(item.commits);
  const commits = localCommits({ sinceMs: item.firstAt - 1, repoRoot })
    .filter((commit) => wanted.has(commit.sha))
    .map((commit) => ({ sha: commit.sha, at: commit.at, subject: commit.subject, body: clip(commit.body, 600), files: commit.files.filter((file) => groupOf(file, config) === item.group) }));
  const corpus = commits.map((commit) => `${commit.subject} ${commit.body}`).join("\n");
  const module = config.modules.find((entry) => entry.id === item.group);
  return fit({
    kind: "commits",
    group: item.group,
    module: module ? { id: module.id, name: module.name } : null,
    area: item.area ?? null,
    title: item.title,
    date: item.day,
    files: fileStates(item.files, repoRoot),
    commits,
    requirements: requirementEvidence(config, item.group, corpus, [], repoRoot),
  });
}

/**
 * The first run's history: every author's commits from `since` to `until`,
 * grouped one entry per module per day. A commit touching two modules is
 * listed under both, each with only its own files. Unassigned files come back
 * as areas, so each is asked about once.
 */
export function backfill({ config, since, until, repoRoot = REPO_ROOT }) {
  const groups = new Map();
  const areas = new Map();
  let considered = 0;
  for (const commit of historyCommits({ since, until, repoRoot })) {
    considered += 1;
    const day = localDay(commit.at, config.timeZone);
    const byGroup = new Map();
    for (const file of commit.files) {
      const found = classify(file, config);
      if (found.kind === "ignored" || found.kind === "excluded") continue;
      const group = found.kind === "module" ? found.id : `area:${found.key}`;
      if (!byGroup.has(group)) byGroup.set(group, []);
      byGroup.get(group).push(file);
      if (found.kind === "unassigned") {
        const area = areas.get(found.key) ?? { key: found.key, label: found.label, globs: found.globs, files: [], subjects: [], days: [] };
        if (area.files.length < 20 && !area.files.includes(file)) area.files.push(file);
        if (area.subjects.length < 5 && !area.subjects.includes(commit.subject)) area.subjects.push(commit.subject);
        if (!area.days.includes(day)) area.days.push(day);
        areas.set(found.key, area);
      }
    }
    for (const [group, files] of byGroup) {
      const key = `${day}|${group}`;
      if (!groups.has(key)) {
        const module = config.modules.find((entry) => entry.id === group);
        groups.set(key, { day, group, token: groupToken(group), module: module ? { id: module.id, name: module.name } : null, commits: [] });
      }
      groups.get(key).commits.push({ sha: commit.sha, subject: commit.subject, body: clip(commit.body, 600), files });
    }
  }
  const list = [...groups.values()].sort((a, b) => (a.day === b.day ? a.group.localeCompare(b.group) : a.day.localeCompare(b.day)));
  return {
    since,
    until,
    commits: considered,
    groups: list,
    areas: [...areas.values()].sort((a, b) => b.days.length - a.days.length),
    modules: Object.fromEntries(config.modules.map((module) => [module.id, list.filter((group) => group.group === module.id).length])),
  };
}

/** What a module has today, for writing its "What's built now": files by kind, and explicit open markers. */
export function inventory({ config, moduleId, repoRoot = REPO_ROOT }) {
  const files = trackedFiles(repoRoot).filter((file) => {
    const found = classify(file, config);
    return found.kind === "module" && found.id === moduleId;
  });
  const kinds = { pages: [], components: [], logic: [], styles: [], tests: [], other: [] };
  for (const file of files) {
    if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(file)) kinds.tests.push(file);
    else if (/(^|\/)(page|layout|route|loading|error)\.[cm]?[jt]sx?$|-page\.[cm]?[jt]sx?$|(^|\/)routes?\.[cm]?[jt]sx?$/.test(file)) kinds.pages.push(file);
    else if (/\.(css|scss|sass|less)$/.test(file)) kinds.styles.push(file);
    else if (/(^|\/)components?\//.test(file) || /\.[jt]sx$/.test(file)) kinds.components.push(file);
    else if (/\.[cm]?[jt]s$/.test(file)) kinds.logic.push(file);
    else kinds.other.push(file);
  }
  return { module: moduleId, fileCount: files.length, ...kinds, markers: markers(files.slice(0, 1000), repoRoot) };
}

function write(file, data) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  return path.relative(REPO_ROOT, file);
}

function flag(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? null : (args[index + 1] ?? null);
}

async function main() {
  const args = process.argv.slice(2);
  const config = loadConfig();
  if (!config) throw new Error("module-docs is not set up here.");

  if (args[0] === "backfill") {
    const since = flag(args, "--since") ?? config.historyFrom;
    const until = flag(args, "--until") ?? config.installed;
    if (!since) throw new Error("backfill needs --since YYYY-MM-DD (or historyFrom in config.json).");
    const result = backfill({ config, since, until });
    const where = write(BACKFILL_PATH, result);
    console.log(`Backfill evidence: ${where}`);
    console.log(`${result.commits} commits since ${since} -> ${result.groups.length} day-and-module group(s).`);
    for (const [id, count] of Object.entries(result.modules)) console.log(`- ${id}: ${count} day(s)`);
    const unassigned = result.groups.filter((group) => group.group.startsWith("area:")).length;
    if (result.areas.length > 0) {
      console.log(`${result.areas.length} area(s) with no module yet (${unassigned} group(s)) - ask about each once, save the answer, run backfill again:`);
      for (const area of result.areas) console.log(`- ${area.label} (${area.days.length} day(s); e.g. "${area.subjects[0] ?? ""}")`);
    }
    return;
  }

  if (args[0] === "inventory") {
    const moduleId = args[1];
    if (!config.modules.some((module) => module.id === moduleId)) throw new Error(`No module "${moduleId}".`);
    const result = inventory({ config, moduleId });
    const where = write(path.join(EVIDENCE_DIR, `inventory-${moduleId}.json`), result);
    console.log(`Inventory: ${where}`);
    console.log(`${result.fileCount} file(s): ${result.pages.length} pages/routes, ${result.components.length} components, ${result.logic.length} logic, ${result.styles.length} styles, ${result.tests.length} tests; ${result.markers.length} open marker(s).`);
    return;
  }

  const sessionId = flag(args, "--session");
  if (sessionId) {
    const group = flag(args, "--group");
    if (!group) throw new Error("--session needs --group (a module id, or area:<key>).");
    const session = findSession(sessionId);
    if (!session) throw new Error(`No transcript for session ${sessionId}.`);
    const evidence = sessionEvidence({ config, session, group });
    const where = write(path.join(EVIDENCE_DIR, `s-${session.id.slice(0, 8)}-${groupToken(group)}.json`), evidence);
    console.log(`Evidence: ${where}`);
    console.log(`${evidence.files.length} file(s), ${evidence.prompts.length} prompt(s), ${evidence.plans.length} plan(s), ${evidence.questions.length} question(s), ${evidence.commits.length} commit(s).`);
    return;
  }

  const itemId = args[0];
  if (!itemId) throw new Error("Pass an item id from scan.mjs, --session with --group, backfill or inventory.");
  const { pendingWork } = await import("./scan.mjs");
  const { readLog, resolvedThrough } = await import("./log.mjs");
  const item = pendingWork({ config }).items.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error(`No pending item ${itemId}.`);
  let evidence;
  if (item.kind === "session") {
    const session = findSession(item.session);
    if (!session) throw new Error(`The transcript for ${item.session} is gone.`);
    evidence = sessionEvidence({ config, session, group: item.group, since: resolvedThrough(readLog(), item.session, item.group) });
  } else {
    evidence = commitEvidence({ config, item });
  }
  evidence.item = item.id;
  const where = write(path.join(EVIDENCE_DIR, `${item.id}.json`), evidence);
  console.log(`Evidence: ${where}`);
  console.log(`${evidence.files.length} file(s)${evidence.prompts ? `, ${evidence.prompts.length} prompt(s)` : ""}, ${evidence.commits.length} commit(s).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
