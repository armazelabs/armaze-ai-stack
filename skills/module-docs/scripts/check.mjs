#!/usr/bin/env node
// Check that module docs work in the project this is run from - and, with
// --fix, put right whatever setup can put right.
//
//   node <skill_dir>/scripts/check.mjs                    # check only
//   node <skill_dir>/scripts/check.mjs --fix              # check, fix, check again
//   node <skill_dir>/scripts/check.mjs --fix --publish leave
//
// It lives in the skill rather than the project's engine so it can compare the
// project against the skill installed now: after `aistack update`, the
// project's engine is the stale copy, and this is what notices.
//
// The fix is always setup itself, run again. The one thing it cannot invent
// is the publish mode; when that is missing it prints `needs: publish` and
// exits 2, the skill asks the person, and runs it again with the answer.
//
// Exit codes: 0 everything works (warnings allowed), 1 something still fails,
// 2 needs an answer from the person before it can fix.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { DOCS_REL, PUBLISH_MODES, withDocsHooks } from "./setup.mjs";

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE_ENGINE = path.join(SKILL_DIR, "templates", "module-docs", "engine");
const SETUP = path.join(SKILL_DIR, "scripts", "setup.mjs");
const TARGET_ROOT = process.cwd();

/** How the project's engine differs from the skill's templates. All empty means up to date. */
export function engineDrift(templateDir, engineDir) {
  const drift = { changed: [], missing: [], extra: [] };
  const shipped = readdirSync(templateDir).sort();
  for (const name of shipped) {
    const installed = path.join(engineDir, name);
    if (!existsSync(installed)) drift.missing.push(name);
    else if (!readFileSync(installed).equals(readFileSync(path.join(templateDir, name)))) drift.changed.push(name);
  }
  let present = [];
  try {
    present = readdirSync(engineDir);
  } catch {
    // No engine folder: every file is missing, which the loop said.
  }
  drift.extra = present.filter((name) => !shipped.includes(name)).sort();
  return drift;
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

function flagValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function runEngine(engineDir, script, args = [], input = "") {
  return spawnSync(process.execPath, [path.join(engineDir, script), ...args], {
    cwd: TARGET_ROOT,
    input,
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: TARGET_ROOT },
    timeout: 60_000,
  });
}

function git(args) {
  const result = spawnSync("git", args, { cwd: TARGET_ROOT, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function firstLine(text) {
  return (text ?? "").trim().split("\n")[0] ?? "";
}

async function runChecks() {
  const results = [];
  const needs = [];
  const add = (status, text, fixable = false) => results.push({ status, text, fixable });

  // 1. Installed.
  const docsDir = path.join(TARGET_ROOT, DOCS_REL);
  const configPath = path.join(docsDir, "config.json");
  if (!existsSync(configPath)) {
    add("fail", "Module docs are not set up in this project.", true);
    needs.push("publish");
    return { results, needs, hooksInstalled: false };
  }
  add("ok", `Set up in ${DOCS_REL}/`);
  const engineDir = path.join(docsDir, "engine");

  // 2. Version.
  const drift = engineDrift(TEMPLATE_ENGINE, engineDir);
  const stale = drift.changed.length + drift.missing.length + drift.extra.length > 0;
  if (stale) {
    const parts = [
      drift.missing.length && `${drift.missing.length} new file(s) missing`,
      drift.changed.length && `${drift.changed.length} changed`,
      drift.extra.length && `${drift.extra.length} left over`,
    ].filter(Boolean);
    add("fail", `Older version than the installed module-docs (${parts.join(", ")}).`, true);
  } else {
    add("ok", "Same version as the installed module-docs");
  }

  // 3. Settings.
  const config = readJson(configPath);
  if (config === undefined) {
    add("fail", `${DOCS_REL}/config.json will not parse - fix it by hand.`);
    return { results, needs, hooksInstalled: false };
  }
  if (!PUBLISH_MODES.includes(config.publish?.mode)) {
    add("fail", "No publish mode set.", true);
    needs.push("publish");
  } else if (config.publish.mode === "commit-and-push") {
    const remoteOk = git(["remote", "get-url", config.publish.remote]) !== null;
    add(remoteOk ? "ok" : "warn", remoteOk ? `Publishing: Claude commits the docs only and pushes to ${config.publish.remote}/${config.publish.branch}` : `Publishing: remote "${config.publish.remote}" does not exist - pushes will fail until it does.`);
    if (!git(["config", "user.name"]) || !git(["config", "user.email"])) add("warn", "No git user set here - publishing refuses to commit until there is one.");
  } else {
    add("ok", "Publishing: Claude writes the docs and leaves them for you to commit");
  }
  const modules = Array.isArray(config.modules) ? config.modules : [];
  const ids = modules.map((module) => module.id);
  const badIds = ids.filter((id, index) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id ?? "") || ids.indexOf(id) !== index);
  if (badIds.length > 0) add("fail", `Module ids must be unique kebab-case: ${badIds.join(", ")} - fix config.json.`);
  else if (modules.length === 0) add("warn", 'No modules yet - the first run sets them up ("run the module docs first run").');
  else add("ok", `${modules.length} module(s): ${modules.map((module) => module.name).join(", ")}`);
  const requirementsExist = existsSync(path.join(TARGET_ROOT, "project-management", "requirements"));
  if (requirementsExist && !config.requirements) add("fail", "project-management/requirements/ exists but is not linked.", true);

  // 4. Hooks: written, then actually run.
  const settingsPath = path.join(TARGET_ROOT, ".claude", "settings.json");
  const settings = existsSync(settingsPath) ? readJson(settingsPath) : {};
  let hooksInstalled = false;
  if (settings === undefined) {
    add("fail", ".claude/settings.json will not parse - fix it by hand, then check again.");
  } else if (JSON.stringify(withDocsHooks(settings)) === JSON.stringify(settings)) {
    hooksInstalled = true;
    add("ok", "Hooks installed: session start, turn end");
  } else {
    add("fail", "Hooks not installed, or out of date.", true);
  }

  // 5. .gitignore.
  const gitignore = existsSync(path.join(TARGET_ROOT, ".gitignore")) ? readFileSync(path.join(TARGET_ROOT, ".gitignore"), "utf8") : "";
  if (gitignore.split("\n").some((line) => [`${DOCS_REL}/local/`, `/${DOCS_REL}/local/`].includes(line.trim()))) add("ok", "local/ is gitignored");
  else add("fail", `${DOCS_REL}/local/ is not gitignored.`, true);

  if (stale) {
    add("warn", "Hooks, pages and pending work not tested yet - the version has to be fixed first.");
    return { results, needs, hooksInstalled };
  }

  if (hooksInstalled) {
    const start = runEngine(engineDir, "hook.mjs", ["session-start"], JSON.stringify({ source: "compact" }));
    let startOk = start.status === 0;
    if (startOk && start.stdout.trim()) {
      try {
        JSON.parse(start.stdout);
      } catch {
        startOk = false;
      }
    }
    const stop = runEngine(engineDir, "hook.mjs", ["stop"], JSON.stringify({ stop_hook_active: true }));
    if (startOk && stop.status === 0 && stop.stdout.trim() === "") add("ok", "Hooks run");
    else add("fail", `A hook failed when run: ${firstLine(start.stderr || stop.stderr || stop.stdout) || `exit ${start.status ?? stop.status}`}`);
  }

  // 6. Pages.
  const lint = runEngine(engineDir, "pages.mjs", ["lint"]);
  const summary = (lint.stdout ?? "").trim().split("\n").at(-1) ?? "";
  if (lint.status === 0) add(/[1-9]\d* warning/.test(summary) ? "warn" : "ok", `Pages: ${summary || "none yet"}${/[1-9]\d* warning/.test(summary) ? ' - run "pages.mjs lint" to see them' : ""}`);
  else add("fail", `Pages: ${summary || firstLine(lint.stderr)} - run "pages.mjs lint" and fix them.`);

  // 7. Pending work and requirements to adopt.
  try {
    const { pendingWork } = await import(pathToFileURL(path.join(engineDir, "scan.mjs")).href);
    const { loadConfig } = await import(pathToFileURL(path.join(engineDir, "config.mjs")).href);
    const pending = pendingWork({ config: loadConfig() });
    add("ok", pending.items.length === 0 ? "Nothing pending on this computer" : `${pending.items.length} piece(s) of work on this computer not documented yet - say "update docs"`);
    if (pending.adopt.length > 0) add("warn", `Requirements modules not here yet: ${pending.adopt.map((module) => module.slug).join(", ")} - run config.mjs adopt.`);
  } catch (error) {
    add("warn", `Could not scan for pending work: ${firstLine(error.message)}`);
  }

  return { results, needs, hooksInstalled };
}

function print({ results }) {
  const mark = { ok: "✔", warn: "!", fail: "✘" };
  for (const result of results) console.log(`${mark[result.status]} ${result.text}`);
}

async function main() {
  const fix = process.argv.includes("--fix");
  const publish = flagValue("--publish");
  console.log(`Module docs check - ${path.basename(TARGET_ROOT)}`);
  console.log("");

  let report = await runChecks();
  const fixable = report.results.some((result) => result.status === "fail" && result.fixable);
  const needs = report.needs.filter((need) => !(need === "publish" && publish));
  if (fix && fixable && needs.length > 0) {
    print(report);
    console.log("");
    for (const need of needs) console.log(`needs: ${need}`);
    process.exit(2);
  }

  let fixed = false;
  if (fix && (fixable || publish)) {
    const args = [SETUP];
    if (publish) args.push("--publish", publish);
    const setup = spawnSync(process.execPath, args, { cwd: TARGET_ROOT, encoding: "utf8" });
    if (setup.status !== 0) {
      print(report);
      console.log("");
      console.log("Fixing failed - setup said:");
      console.log((setup.stderr || setup.stdout).trim());
      process.exit(1);
    }
    fixed = true;
    const hooksWereMissing = !report.hooksInstalled;
    report = await runChecks();
    if (hooksWereMissing && report.hooksInstalled) report.hooksJustInstalled = true;
  }

  print(report);
  console.log("");
  const failures = report.results.filter((result) => result.status === "fail");
  if (fixed) console.log("Fixed by re-running setup.");
  if (report.hooksJustInstalled) console.log("The hooks start with your next Claude Code session. Commit .claude/settings.json so teammates get them.");
  if (failures.length === 0) {
    console.log("All good - module docs are working.");
    return;
  }
  console.log(`${failures.length} problem${failures.length === 1 ? "" : "s"} left.${!fix && failures.some((result) => result.fixable) ? " Run again with --fix to fix them." : ""}`);
  const unmet = report.needs.filter((need) => !(need === "publish" && publish));
  if (unmet.length > 0) {
    for (const need of unmet) console.log(`needs: ${need}`);
    process.exit(2);
  }
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
