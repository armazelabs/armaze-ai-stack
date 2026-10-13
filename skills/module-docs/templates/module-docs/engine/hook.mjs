// The Claude Code hooks: every session is reminded to offer documentation.
//
//   node <engine>/hook.mjs session-start   # SessionStart
//   node <engine>/hook.mjs stop            # Stop
//
// Setup wires these into the project's .claude/settings.json. (The file is
// `hook.mjs`, not `hooks.mjs`: the time tracker's setup removes any hook whose
// command contains `engine/hooks.mjs` as its own.)
//
// - session-start tells the session it should offer to document finished
//   work, and lists the work earlier sessions on this computer left
//   undocumented, so the first reply can raise it before anything else.
// - stop runs at every turn end. Claude Code has no "task finished" event, so
//   when the turn changed documentable files since the last time anyone
//   asked, it hands Claude a short nudge to ask now - or, if the request is
//   not finished, to let the turn end.
//
// A hook never breaks a session: everything that goes wrong is swallowed, and
// both modes always exit 0. Neither writes anything committed; the only write
// is the gitignored scan cache.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MODULES_DIR, REPO_ROOT, groupOf, loadConfig } from "./config.mjs";
import { readLog, resolvedThrough } from "./log.mjs";
import { documentedRefs } from "./pages.mjs";
import { describeItem, pendingWork } from "./scan.mjs";
import { isDeferAnswer, isSkipAnswer, readSession } from "./transcripts.mjs";

const DOC_HEADER = "Document";
const MAX_LISTED = 10;
const MAX_FILES = 8;

function readInput() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return {};
  }
}

function quietly(fn) {
  const saved = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = () => {};
  try {
    return fn();
  } catch {
    return null;
  } finally {
    Object.assign(console, saved);
  }
}

/** The instruction every session carries. Short: it is read on every start. */
export function standingInstruction(sessionId) {
  return [
    "Module docs (the module-docs skill, project-management/module-docs/) keeps one page per product module.",
    sessionId ? `This session is ${sessionId}.` : null,
    `When you finish a task the person asked for and it changed project files outside the tooling list, ask with AskUserQuestion (header "${DOC_HEADER}") whether to document it, following the skill's "Document a task" mode: the module and a one-line summary, options Yes, under <Module> / Different module / Not now / Don't document.`,
    'If they answer "Not now", do not ask again this session. Never ask in plan mode, mid-task, or while you are waiting on them.',
  ]
    .filter(Boolean)
    .join(" ");
}

export function sessionStartOutput(input, { config, repoRoot = REPO_ROOT, scan = pendingWork } = {}) {
  const sessionId = typeof input.session_id === "string" ? input.session_id : null;
  const parts = [standingInstruction(sessionId)];
  let systemMessage = null;
  const source = input.source ?? "startup";
  if (source !== "compact") {
    const result = scan({ config, repoRoot, excludeSession: sessionId });
    if (result) {
      const { items, areas, adopt, unpublished } = result;
      if (items.length > 0) {
        const listed = items.slice(-MAX_LISTED).map((item) => `- ${describeItem(item)}`);
        const more = items.length > MAX_LISTED ? [`- and ${items.length - MAX_LISTED} more (scan.mjs lists them all)`] : [];
        parts.push(
          [
            `Earlier sessions on this computer left ${items.length} piece${items.length === 1 ? "" : "s"} of work undocumented:`,
            ...listed,
            ...more,
            'Open your first reply - before the person\'s request - by asking about these with AskUserQuestion, header "Catch-up", following the skill\'s "Catch-up" mode, then carry on with what they asked. They can also say "update docs" at any time.',
          ].join("\n"),
        );
        systemMessage = `Module docs: ${items.length} earlier piece${items.length === 1 ? "" : "s"} of work not documented yet.`;
      }
      if (areas.length > 0) {
        parts.push(`Some of that work is in areas no module covers yet (${areas.map((area) => area.label).join(", ")}): ask about each area once ("New area"), as the skill says, before documenting it.`);
      }
      if (adopt.length > 0) {
        parts.push(`The requirements have module(s) module-docs does not: ${adopt.map((module) => module.name).join(", ")}. Run config.mjs adopt during the catch-up.`);
      }
      if (unpublished.length > 0) {
        parts.push(`${unpublished.length} docs file(s) are written but not committed - publish them during the catch-up once their work is committed.`);
      }
    }
  }
  const output = { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: parts.join("\n\n") } };
  if (systemMessage) output.systemMessage = systemMessage;
  return output;
}

function subagentFiles(transcriptPath) {
  const dir = path.join(path.dirname(transcriptPath), path.basename(transcriptPath, ".jsonl"), "subagents");
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith(".jsonl"))
      .map((name) => path.join(dir, name));
  } catch {
    return [];
  }
}

/**
 * The turn-end nudge, or null for silence. Silent when: a stop hook is already
 * continuing the turn, the session is in plan mode, Claude ended on a question
 * to the person, a "Not now" was given this session, or nothing documentable
 * changed since the last ask or decision.
 */
export function stopOutput(input, { config, repoRoot = REPO_ROOT, modulesDir = MODULES_DIR, records = readLog() } = {}) {
  if (input.stop_hook_active) return null;
  if (input.permission_mode === "plan") return null;
  const last = typeof input.last_assistant_message === "string" ? input.last_assistant_message.trim() : "";
  if (last.endsWith("?")) return null;
  if (typeof input.transcript_path !== "string") return null;

  const session = readSession(input.transcript_path, { repoRoot, light: true, subagents: subagentFiles(input.transcript_path) });
  const sessionId = input.session_id ?? session.id;
  let lastAsk = -Infinity;
  const skipped = new Map();
  for (const ask of session.asks) {
    const own = ask.questions.filter((question) => question.header === DOC_HEADER || question.header === "Catch-up");
    if (own.length === 0) continue;
    if (own.some((question) => isDeferAnswer(question.answer))) return null;
    if (own.some((question) => question.header === DOC_HEADER)) lastAsk = Math.max(lastAsk, ask.at ?? -Infinity);
    for (const question of own) if (isSkipAnswer(question.answer)) skipped.set("*", Math.max(skipped.get("*") ?? -Infinity, ask.answeredAt ?? ask.at ?? 0));
  }

  const refs = documentedRefs(modulesDir);
  const groups = new Map();
  for (const edit of session.edits) {
    const group = groupOf(edit.path, config);
    if (!group) continue;
    const through = Math.max(lastAsk, resolvedThrough(records, sessionId, group), skipped.get("*") ?? -Infinity);
    if ((edit.at ?? 0) <= through) continue;
    if (refs.some((ref) => ref.module === group && ref.sessions.some((id) => id && (sessionId.startsWith(id) || id.startsWith(sessionId))))) continue;
    if (!groups.has(group)) groups.set(group, new Set());
    groups.get(group).add(edit.path);
  }
  if (groups.size === 0) return null;

  const lines = [...groups].map(([group, files]) => {
    const list = [...files];
    const shown = list.slice(0, MAX_FILES).join(", ") + (list.length > MAX_FILES ? `, and ${list.length - MAX_FILES} more` : "");
    if (group.startsWith("area:")) return `- ${group.slice(5)} (no module covers it yet - ask the "New area" question first): ${shown}`;
    const module = config.modules.find((entry) => entry.id === group);
    return `- ${module?.name ?? group}: ${shown}`;
  });
  const context = [
    `Module docs: this turn changed documentable files (session ${sessionId}):`,
    ...lines,
    `If the person's request is finished, ask now whether to document it - AskUserQuestion, header "${DOC_HEADER}", as the module-docs skill's "Document a task" mode says.`,
    "If the request is not finished, you are waiting on the person, or you cannot ask here, end your turn without asking: the next session's catch-up will raise it.",
  ].join("\n");
  return { hookSpecificOutput: { hookEventName: "Stop", additionalContext: context } };
}

function main() {
  const event = (process.argv[2] ?? "").toLowerCase();
  const input = readInput();
  const config = quietly(() => loadConfig());
  if (!config || config.modules.length === 0) return;
  const output = event === "session-start" ? quietly(() => sessionStartOutput(input, { config })) : event === "stop" ? quietly(() => stopOutput(input, { config })) : null;
  if (output) process.stdout.write(`${JSON.stringify(output)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch {
    // Never break the session over the docs.
  }
}
