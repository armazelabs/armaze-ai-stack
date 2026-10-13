#!/usr/bin/env node
// Install module-docs into whichever project this is run from.
//
//   node <skill_dir>/scripts/setup.mjs --publish commit-and-push|leave [--remote origin] [--branch main] [--history-from YYYY-MM-DD]
//
// Everything lives in project-management/module-docs/. The engine goes in
// engine/ and is always re-synced - it is generated code nobody edits by hand.
// config.json and the readme are the project's own and are written only when
// absent; a re-run adds settings that are missing and changes one only when a
// flag asks for it. Nothing here commits.
//
// Publishing is the one choice setup cannot default: whether Claude commits
// and pushes the docs itself ("commit-and-push") or leaves them for the person
// to commit ("leave"). A first install without --publish stops with exit 2 and
// a `needs: publish` line; the skill asks the person and runs it again.
//
// Two hooks go into the project's .claude/settings.json, next to any already
// there: SessionStart (the standing instruction and the catch-up list) and
// Stop (the turn-end nudge). The settings file is committed, so every
// teammate's sessions get them.

import { execFileSync } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_CONFIG, DEFAULT_IGNORE } from "../templates/module-docs/engine/config.mjs";

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATES_DIR = path.join(SKILL_DIR, "templates");
const TARGET_ROOT = process.cwd();

export const DOCS_REL = "project-management/module-docs";
export const PUBLISH_MODES = ["commit-and-push", "leave"];
const REQUIREMENTS_REL = "project-management/requirements";
const GITIGNORE_ENTRY = `${DOCS_REL}/local/`;

/** Which hook runs which mode of `engine/hook.mjs`. */
export const HOOK_EVENTS = { SessionStart: "session-start", Stop: "stop" };

/** A hook this skill wrote. Deliberately not matched by the time tracker's `engine/hooks.mjs` test. */
export function isOurHook(hook) {
  return /module-docs\/engine\/hook\.mjs/.test(hook?.command ?? "");
}

/** `settings` with this skill's hooks replaced by the current ones; everyone else's kept exactly. */
export function withDocsHooks(settings, engineRel = `${DOCS_REL}/engine`) {
  const next = { ...settings, hooks: { ...(settings?.hooks ?? {}) } };
  for (const [event, mode] of Object.entries(HOOK_EVENTS)) {
    const kept = [];
    for (const group of Array.isArray(next.hooks[event]) ? next.hooks[event] : []) {
      const hooks = (group?.hooks ?? []).filter((hook) => !isOurHook(hook));
      if (hooks.length > 0) kept.push({ ...group, hooks });
    }
    const script = `$CLAUDE_PROJECT_DIR/${engineRel.split(path.sep).join("/")}/hook.mjs`;
    kept.push({ hooks: [{ type: "command", command: `node "${script}" ${mode}`, timeout: 15 }] });
    next.hooks[event] = kept;
  }
  return next;
}

function flagValue(name) {
  const args = process.argv.slice(2);
  const index = args.indexOf(name);
  return index === -1 ? null : (args[index + 1] ?? null);
}

function gitRead(args) {
  try {
    return execFileSync("git", args, { cwd: TARGET_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

function detectTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** The remote to push to and its default branch, as git knows them. */
function detectRemote() {
  const remotes = (gitRead(["remote"]) ?? "").split("\n").filter(Boolean);
  const remote = flagValue("--remote") ?? (remotes.includes("origin") ? "origin" : (remotes[0] ?? "origin"));
  const head = gitRead(["symbolic-ref", "--short", `refs/remotes/${remote}/HEAD`]);
  const branch = flagValue("--branch") ?? (head ? head.replace(`${remote}/`, "") : null) ?? gitRead(["branch", "--show-current"]) ?? "main";
  return { remote, branch };
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

function syncEngine(docsDir) {
  const source = path.join(TEMPLATES_DIR, "module-docs", "engine");
  const dest = path.join(docsDir, "engine");
  mkdirSync(dest, { recursive: true });
  cpSync(source, dest, { recursive: true });
  const shipped = new Set(readdirSync(source));
  for (const name of readdirSync(dest)) if (!shipped.has(name)) rmSync(path.join(dest, name), { recursive: true, force: true });
  return readdirSync(dest).filter((name) => name.endsWith(".mjs")).length;
}

function ensureGitignore() {
  const file = path.join(TARGET_ROOT, ".gitignore");
  const block = `# module docs - this computer's own records and caches\n${GITIGNORE_ENTRY}\n`;
  if (!existsSync(file)) {
    writeFileSync(file, block);
    return true;
  }
  const content = readFileSync(file, "utf8");
  if (content.split("\n").some((line) => line.trim() === GITIGNORE_ENTRY || line.trim() === `/${GITIGNORE_ENTRY}`)) return false;
  appendFileSync(file, `${content.length === 0 || content.endsWith("\n") ? "" : "\n"}\n${block}`);
  return true;
}

function installHooks() {
  const file = path.join(TARGET_ROOT, ".claude", "settings.json");
  let settings = {};
  if (existsSync(file)) {
    settings = readJson(file);
    if (settings === undefined) return { changed: false, error: ".claude/settings.json is not valid JSON - fix it and re-run." };
  }
  const json = `${JSON.stringify(withDocsHooks(settings), null, 2)}\n`;
  if (existsSync(file) && readFileSync(file, "utf8") === json) return { changed: false };
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, json);
  return { changed: true };
}

function publishLine(mode) {
  return mode === "commit-and-push"
    ? "Claude commits only the docs files and pushes them; anything else in the checkout is left alone."
    : "Claude writes the files and leaves them uncommitted; commit them with your work.";
}

function main() {
  const docsDir = path.join(TARGET_ROOT, DOCS_REL);
  const configPath = path.join(docsDir, "config.json");
  const existing = existsSync(configPath) ? readJson(configPath) : null;
  if (existsSync(configPath) && existing === undefined) {
    console.error(`module-docs setup: ${DOCS_REL}/config.json will not parse - fix it by hand, then re-run.`);
    process.exit(1);
  }

  const publishFlag = flagValue("--publish");
  if (publishFlag && !PUBLISH_MODES.includes(publishFlag)) {
    console.error(`module-docs setup: --publish must be ${PUBLISH_MODES.join(" or ")}.`);
    process.exit(1);
  }
  if (!existing && !publishFlag) {
    console.error("module-docs setup: should Claude commit and push the docs itself, or leave them for you to");
    console.error("commit? Only the docs files are ever committed. Re-run with one of:");
    console.error("");
    console.error("  --publish commit-and-push");
    console.error("  --publish leave");
    console.error("");
    console.error("needs: publish");
    process.exit(2);
  }
  const historyFrom = flagValue("--history-from");
  if (historyFrom && !/^\d{4}-\d{2}-\d{2}$/.test(historyFrom)) {
    console.error("module-docs setup: --history-from must be YYYY-MM-DD.");
    process.exit(1);
  }

  const isGit = gitRead(["rev-parse", "--is-inside-work-tree"]) === "true";
  console.log(`Setting up module docs for ${path.basename(TARGET_ROOT)} (${TARGET_ROOT})`);
  console.log(`Node ${process.version}.${isGit ? "" : " Not a git repository - history and publishing need git."}`);
  console.log("");

  const createdDir = !existsSync(docsDir);
  mkdirSync(path.join(docsDir, "modules"), { recursive: true });
  const engineCount = syncEngine(docsDir);
  const lines = [`- ${DOCS_REL}/: ${createdDir ? "created" : "found, reused"}`, `- ${DOCS_REL}/engine/: ${engineCount} engine files synced`];

  const hasRequirements = existsSync(path.join(TARGET_ROOT, REQUIREMENTS_REL));
  let config;
  if (!existing) {
    config = {
      ...DEFAULT_CONFIG,
      installed: new Date().toISOString(),
      historyFrom: historyFrom ?? null,
      timeZone: detectTimeZone(),
      publish: { mode: publishFlag, ...detectRemote() },
      requirements: hasRequirements ? { dir: REQUIREMENTS_REL, comingNext: ["client-approved", "building"] } : null,
      modules: [],
      excluded: [],
      ignore: DEFAULT_IGNORE,
    };
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    lines.push(`- ${DOCS_REL}/config.json: created - publish ${config.publish.mode} to ${config.publish.remote}/${config.publish.branch}${config.requirements ? ", requirements linked" : ""}`);
  } else {
    config = { ...existing };
    const changes = [];
    for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
      if (!(key in config)) {
        config[key] = key === "installed" ? new Date().toISOString() : key === "timeZone" ? detectTimeZone() : value;
        changes.push(`added ${key}`);
      }
    }
    if (publishFlag && config.publish?.mode !== publishFlag) {
      config.publish = { ...DEFAULT_CONFIG.publish, ...config.publish, mode: publishFlag };
      changes.push(`publish mode now ${publishFlag}`);
    }
    if (flagValue("--remote") || flagValue("--branch")) {
      config.publish = { ...config.publish, ...detectRemote() };
      changes.push(`publishing to ${config.publish.remote}/${config.publish.branch}`);
    }
    if (historyFrom && config.historyFrom !== historyFrom) {
      config.historyFrom = historyFrom;
      changes.push(`history from ${historyFrom}`);
    }
    if (hasRequirements && !config.requirements) {
      config.requirements = { dir: REQUIREMENTS_REL, comingNext: ["client-approved", "building"] };
      changes.push("requirements linked");
    }
    if (changes.length > 0) writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    lines.push(`- ${DOCS_REL}/config.json: ${changes.length ? changes.join(", ") : "already existed, left untouched"}`);
  }

  const readmePath = path.join(docsDir, "readme.md");
  if (!existsSync(readmePath)) {
    writeFileSync(readmePath, readFileSync(path.join(TEMPLATES_DIR, "readme.md"), "utf8").replace("{{PUBLISH_LINE}}", publishLine(config.publish.mode)));
    lines.push(`- ${DOCS_REL}/readme.md: created`);
  } else {
    lines.push(`- ${DOCS_REL}/readme.md: already existed, left untouched`);
  }

  lines.push(`- .gitignore: ${ensureGitignore() ? `added ${GITIGNORE_ENTRY}` : "already ignored"}`);
  const hooks = installHooks();
  lines.push(`- .claude/settings.json hooks (SessionStart, Stop): ${hooks.error ?? (hooks.changed ? "installed" : "already installed")}`);
  for (const line of lines) console.log(line);
  console.log("");

  if (config.modules.length === 0) {
    console.log("Next: the first run - confirm the modules, then write each module's page and its history.");
    console.log('Ask Claude to "run the module docs first run".');
  } else {
    console.log(`${config.modules.length} module(s) configured. Say "update docs" to catch up, "check module docs" to check.`);
  }
  if (hooks.changed) console.log("The hooks start with the next Claude Code session. Commit .claude/settings.json so teammates get them.");
  if (hooks.error) process.exit(1);
}

// Guarded so the hook helpers can be imported by the tests without installing anything.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
