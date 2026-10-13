// What happened in a Claude Code session, read from its transcript.
//
// Claude Code writes one JSONL transcript per session under
// `<config>/projects/<checkout path with / and . as ->/<session>.jsonl`, with
// each subagent's in `<session>/subagents/agent-*.jsonl`. This file turns one
// into the evidence a history entry is written from:
//
//   - prompts     what the person typed (slash commands as `/name args`)
//   - edits       files changed through Edit, Write, MultiEdit, NotebookEdit
//   - reads       files read (to tell whether a requirement was looked at)
//   - asks        every AskUserQuestion: each question, every option, the answer
//   - plans       every plan put up for approval, approved or not
//   - summaries   the last thing Claude said in each turn
//   - title       Claude Code's own one-line title for the session
//
// The asks are where "options considered and dropped" come from: an option
// that was offered and not picked. Nothing here reads who the person is.
//
// Transcripts are read, never written. Unparseable lines are skipped: a live
// session's last line is often half-written.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { REPO_ROOT, toRepoRelative } from "./config.mjs";

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
/** Local commands that say nothing about the work. */
const LOCAL_COMMANDS = new Set([
  "model",
  "effort",
  "config",
  "clear",
  "compact",
  "cost",
  "status",
  "help",
  "login",
  "logout",
  "memory",
  "permissions",
  "hooks",
  "agents",
  "resume",
  "theme",
  "vim",
  "doctor",
  "exit",
  "fast",
  "context",
  "usage",
]);
/** Headers module-docs itself asks with - never evidence of the work. */
export const OWN_HEADERS = new Set(["Document", "Catch-up", "New area", "Commit both", "Module", "Modules", "Paths", "Publishing"]);

const MAX_PROMPT = 400;
const MAX_SUMMARY = 600;
const MAX_PLAN = 6000;

/**
 * Every config folder Claude Code may run from for this checkout: `~/.claude`,
 * the repo's own `.claude-local` and any CLAUDE_CONFIG_DIR set now.
 */
export function configRoots(repoRoot = REPO_ROOT) {
  const roots = [path.join(homedir(), ".claude"), path.join(repoRoot, ".claude-local")];
  if (process.env.CLAUDE_CONFIG_DIR) roots.push(process.env.CLAUDE_CONFIG_DIR);
  return [...new Set(roots.map((root) => path.resolve(root)))];
}

/** Every folder this checkout's transcripts may live in. */
export function transcriptDirs(repoRoot = REPO_ROOT) {
  const encoded = repoRoot.replaceAll("/", "-").replaceAll(".", "-");
  return configRoots(repoRoot).map((root) => path.join(root, "projects", encoded));
}

/** Every session of this checkout: `{ id, file, mtimeMs, size, subagents }`, oldest change first. */
export function listSessions(repoRoot = REPO_ROOT) {
  const sessions = new Map();
  for (const dir of transcriptDirs(repoRoot)) {
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
      const id = entry.name.slice(0, -".jsonl".length);
      const file = path.join(dir, entry.name);
      let stat;
      try {
        stat = statSync(file);
      } catch {
        continue;
      }
      const subagentDir = path.join(dir, id, "subagents");
      let subagents = [];
      try {
        subagents = readdirSync(subagentDir)
          .filter((name) => name.endsWith(".jsonl"))
          .map((name) => path.join(subagentDir, name));
      } catch {
        // No subagents.
      }
      let mtimeMs = stat.mtimeMs;
      for (const sub of subagents) {
        try {
          mtimeMs = Math.max(mtimeMs, statSync(sub).mtimeMs);
        } catch {
          // Vanished between listing and stat.
        }
      }
      const previous = sessions.get(id);
      if (!previous || previous.mtimeMs < mtimeMs) sessions.set(id, { id, file, mtimeMs, size: stat.size, subagents });
    }
  }
  return [...sessions.values()].sort((a, b) => a.mtimeMs - b.mtimeMs);
}

/** The session whose id starts with `prefix`, or null. */
export function findSession(prefix, repoRoot = REPO_ROOT) {
  if (!prefix) return null;
  return listSessions(repoRoot).find((session) => session.id.startsWith(prefix)) ?? null;
}

function clip(text, max) {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** Like `clip`, but keeps line breaks - for plans, whose structure is their meaning. */
function clipLines(text, max) {
  const tidy = String(text ?? "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return tidy.length > max ? `${tidy.slice(0, max - 1)}…` : tidy;
}

function textOf(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join(" ");
}

/**
 * A user line as a prompt the person typed, or null. Task notifications, tool
 * results, injected meta lines and local commands are not prompts.
 */
export function promptOf(entry) {
  if (entry?.type !== "user" || entry.isMeta) return null;
  const content = entry.message?.content;
  if (Array.isArray(content) && content.some((part) => part?.type === "tool_result")) return null;
  const kind = entry.origin?.kind;
  if (kind && kind !== "human") return null;
  const text = textOf(content);
  if (!text.trim() || text.startsWith("<task-notification>") || text.startsWith("<local-command-")) return null;
  const command = /<command-name>\s*\/?([^<\s]+)\s*<\/command-name>/.exec(text);
  if (command) {
    if (LOCAL_COMMANDS.has(command[1])) return null;
    const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(text)?.[1] ?? "";
    return clip(`/${command[1]} ${args}`, MAX_PROMPT);
  }
  if (!kind && /^<[a-z-]+>/.test(text.trim())) return null;
  return clip(text.replace(/<[^>]+>/g, " "), MAX_PROMPT);
}

function timeOf(entry) {
  const at = Date.parse(entry?.timestamp ?? "");
  return Number.isNaN(at) ? null : at;
}

const LIGHT_MARKERS = ['"name":"Edit"', '"name":"Write"', '"name":"MultiEdit"', '"name":"NotebookEdit"', '"name":"AskUserQuestion"', '"ai-title"'];

/**
 * Read one session. `light` reads only what the hooks need - edits, asks, the
 * title and the first prompt - skipping prompts, plans and summaries, which
 * keeps a turn-end check to milliseconds on a long session.
 */
export function readSession(file, { repoRoot = REPO_ROOT, light = false, subagents = [] } = {}) {
  const session = {
    id: path.basename(file, ".jsonl"),
    title: null,
    firstPrompt: null,
    firstAt: null,
    lastAt: null,
    prompts: [],
    reads: [],
    edits: [],
    asks: [],
    plans: [],
    summaries: [],
  };
  const pending = new Map();
  let turnText = null;

  const settle = (id, isError, value, at) => {
    const call = pending.get(id);
    if (!call) return;
    pending.delete(id);
    if (call.name === "AskUserQuestion") {
      const answers = !isError && value && typeof value === "object" ? (value.answers ?? {}) : {};
      const notes = !isError && value && typeof value === "object" ? (value.annotations ?? {}) : {};
      call.ask.answeredAt = at;
      call.ask.dismissed = Boolean(isError);
      for (const question of call.ask.questions) {
        question.answer = typeof answers[question.question] === "string" ? answers[question.question] : null;
        const note = notes[question.question];
        question.notes = typeof note?.notes === "string" ? note.notes : null;
      }
    } else if (call.name === "ExitPlanMode") {
      call.plan.approved = !isError && value !== null && typeof value === "object";
    } else if (EDIT_TOOLS.has(call.name)) {
      if (isError) call.edit.failed = true;
    }
  };

  const readFile = (target, isSubagent) => {
    let text;
    try {
      text = readFileSync(target, "utf8");
    } catch {
      return;
    }
    for (const line of text.split("\n")) {
      if (!line) continue;
      if (light) {
        const resultId = /"tool_use_id":"([^"]+)"/.exec(line)?.[1];
        const wanted =
          LIGHT_MARKERS.some((marker) => line.includes(marker)) ||
          (resultId && pending.has(resultId)) ||
          (!session.firstPrompt && line.includes('"type":"user"'));
        if (!wanted) {
          const at = /"timestamp":"([^"]+)"/.exec(line)?.[1];
          if (at && !isSubagent) {
            const ms = Date.parse(at);
            if (!Number.isNaN(ms)) {
              session.firstAt ??= ms;
              session.lastAt = ms;
            }
          }
          continue;
        }
      }
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const at = timeOf(entry);
      if (at !== null && !isSubagent) {
        session.firstAt ??= at;
        session.lastAt = at;
      }
      if (entry.type === "ai-title" && typeof entry.aiTitle === "string" && !isSubagent) {
        session.title = entry.aiTitle;
        continue;
      }
      const content = entry.message?.content;
      if (entry.type === "user") {
        if (Array.isArray(content)) {
          for (const part of content) {
            if (part?.type === "tool_result" && pending.has(part.tool_use_id)) {
              settle(part.tool_use_id, part.is_error === true, entry.toolUseResult ?? null, at);
            }
          }
        }
        if (isSubagent) continue;
        const prompt = promptOf(entry);
        if (prompt) {
          session.firstPrompt ??= prompt;
          if (!light) {
            if (turnText) session.summaries.push({ at, text: clip(turnText, MAX_SUMMARY) });
            turnText = null;
            session.prompts.push({ at, text: prompt });
          }
        }
        continue;
      }
      if (entry.type !== "assistant" || !Array.isArray(content)) continue;
      for (const part of content) {
        if (part?.type === "text" && !light && !isSubagent && part.text?.trim()) turnText = part.text;
        if (part?.type !== "tool_use") continue;
        const input = part.input ?? {};
        if (EDIT_TOOLS.has(part.name)) {
          const rel = toRepoRelative(input.file_path ?? input.notebook_path, repoRoot);
          if (!rel) continue;
          const edit = { path: rel, at, failed: false };
          session.edits.push(edit);
          pending.set(part.id, { name: part.name, edit });
        } else if (part.name === "AskUserQuestion" && !isSubagent) {
          const questions = (Array.isArray(input.questions) ? input.questions : []).map((question) => ({
            question: String(question?.question ?? ""),
            header: String(question?.header ?? ""),
            multiSelect: Boolean(question?.multiSelect),
            options: (Array.isArray(question?.options) ? question.options : []).map((option) => ({
              label: String(option?.label ?? ""),
              description: String(option?.description ?? ""),
            })),
            answer: null,
            notes: null,
          }));
          const ask = { at, answeredAt: null, dismissed: false, questions };
          session.asks.push(ask);
          pending.set(part.id, { name: part.name, ask });
        } else if (part.name === "Read" && !light) {
          const rel = toRepoRelative(input.file_path, repoRoot);
          if (rel && !session.reads.includes(rel)) session.reads.push(rel);
        } else if (part.name === "ExitPlanMode" && !light && !isSubagent) {
          const plan = { at, approved: null, text: clipLines(input.plan ?? "", MAX_PLAN) };
          session.plans.push(plan);
          pending.set(part.id, { name: part.name, plan });
        }
      }
    }
  };

  readFile(file, false);
  for (const sub of subagents) readFile(sub, true);
  if (!light && turnText) session.summaries.push({ at: session.lastAt, text: clip(turnText, MAX_SUMMARY) });
  session.edits = session.edits.filter((edit) => !edit.failed).sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  return session;
}

/** The chosen labels of an answer: multi-select answers come back comma-joined. */
export function chosenLabels(question) {
  if (typeof question.answer !== "string") return [];
  const labels = question.options.map((option) => option.label);
  if (labels.includes(question.answer)) return [question.answer];
  if (!question.multiSelect) return [];
  return labels.filter((label) => question.answer.split(/,\s*/).includes(label));
}

/** An ask's questions with each option marked chosen or not - the "considered and dropped". */
export function decisionsOf(ask) {
  return ask.questions
    .filter((question) => !OWN_HEADERS.has(question.header))
    .map((question) => {
      const chosen = chosenLabels(question);
      const typed = typeof question.answer === "string" && chosen.length === 0 ? question.answer : null;
      return {
        question: question.question,
        header: question.header,
        options: question.options.map((option) => ({ ...option, chosen: chosen.includes(option.label) })),
        answer: question.answer,
        typed,
        notes: question.notes,
      };
    })
    .filter((decision) => decision.answer !== null);
}

/** Whether a module-docs question was answered "Don't document". */
export function isSkipAnswer(answer) {
  return typeof answer === "string" && /^(don'?t document|skip)/i.test(answer.trim());
}

/** Whether a module-docs question was answered "Not now". */
export function isDeferAnswer(answer) {
  return typeof answer === "string" && /^not now/i.test(answer.trim());
}

export function sessionExists(file) {
  return existsSync(file);
}
