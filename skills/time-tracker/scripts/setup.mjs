#!/usr/bin/env node
// Sets up time tracking (the engine library, the labelling agent, the
// SessionStart hook, the project rule, and the project-management/ scaffold)
// in whichever project this is run from.
//
// Idempotent: safe to run again later. Engine files - the library and the
// agent definition - are always re-synced from this skill's templates, since
// they are generated code nobody is meant to hand-edit. Project-owned files -
// config.json, the project-management readme, the rule file - are written
// only if absent, so a project's own choices are never clobbered.

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATES_DIR = path.join(SKILL_DIR, "templates");
const TARGET_ROOT = process.cwd();

const ENGINE_FILES = [
  "blocks.mts",
  "config.mts",
  "collect.mts",
  "month-file.mts",
  "report.mts",
  "session-start.mts",
];

function fail(message) {
  console.error(`time-tracker setup: ${message}`);
  process.exit(1);
}

function readTemplate(relativePath) {
  return readFileSync(path.join(TEMPLATES_DIR, relativePath), "utf8");
}

function fill(text, values) {
  return text.replace(/{{(\w+)}}/g, (match, key) =>
    Object.hasOwn(values, key) ? String(values[key]) : match,
  );
}

function writeFile(target, content) {
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

// --- detection -------------------------------------------------------

function detectPackageManager() {
  if (existsSync(path.join(TARGET_ROOT, "pnpm-lock.yaml"))) return { name: "pnpm", run: "pnpm run" };
  if (existsSync(path.join(TARGET_ROOT, "yarn.lock"))) return { name: "yarn", run: "yarn" };
  if (existsSync(path.join(TARGET_ROOT, "bun.lockb"))) return { name: "bun", run: "bun run" };
  return { name: "npm", run: "npm run" };
}

function readPackageJson() {
  const file = path.join(TARGET_ROOT, "package.json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function detectProjectName(pkg) {
  return pkg?.name || path.basename(TARGET_ROOT);
}

function detectTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function todayInZone(timeZone) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "project";
}

// --- steps -------------------------------------------------------------

function copyEngineFiles() {
  const destDir = path.join(TARGET_ROOT, "lib", "time-tracking");
  mkdirSync(destDir, { recursive: true });
  for (const file of ENGINE_FILES) {
    writeFileSync(path.join(destDir, file), readTemplate(path.join("lib-time-tracking", file)));
  }
  return ENGINE_FILES.length;
}

function writeAgent() {
  writeFile(
    path.join(TARGET_ROOT, ".claude", "agents", "time-tracker.md"),
    readTemplate("agent-time-tracker.md"),
  );
}

function ensureProjectManagement(values) {
  const dir = path.join(TARGET_ROOT, "project-management");
  mkdirSync(dir, { recursive: true });

  const configPath = path.join(dir, "config.json");
  const configCreated = !existsSync(configPath);
  if (configCreated) writeFileSync(configPath, fill(readTemplate("config.json"), values));

  const readmePath = path.join(dir, "readme.md");
  const readmeCreated = !existsSync(readmePath);
  if (readmeCreated) {
    writeFileSync(readmePath, fill(readTemplate("project-management-readme.md"), values));
  }

  return { configCreated, readmeCreated };
}

function ensureRule() {
  const dest = path.join(TARGET_ROOT, "rules", "time-tracking.md");
  if (existsSync(dest)) return false;
  writeFile(dest, readTemplate("rule-time-tracking.md"));
  return true;
}

function ensureGitignore() {
  const file = path.join(TARGET_ROOT, ".gitignore");
  const entry = "project-management/cache/";

  if (existsSync(file)) {
    const content = readFileSync(file, "utf8");
    if (content.split("\n").some((line) => line.trim() === entry)) return false;
    const separator = content.length === 0 || content.endsWith("\n") ? "" : "\n";
    appendFileSync(file, `${separator}\n# time tracking - the evidence cache is scratch\n${entry}\n`);
    return true;
  }

  writeFileSync(file, `# time tracking - the evidence cache is scratch\n${entry}\n`);
  return true;
}

function mergePackageScripts() {
  const file = path.join(TARGET_ROOT, "package.json");
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  pkg.scripts ??= {};

  const wanted = {
    "time:collect": "node lib/time-tracking/collect.mts",
    "time:report": "node lib/time-tracking/report.mts",
  };
  const added = [];
  const skipped = [];
  for (const [key, value] of Object.entries(wanted)) {
    if (!(key in pkg.scripts)) {
      pkg.scripts[key] = value;
      added.push(key);
    } else if (pkg.scripts[key] !== value) {
      skipped.push(key);
    }
  }

  if (added.length > 0) writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
  return { added, skipped };
}

function mergeSettingsHook() {
  const file = path.join(TARGET_ROOT, ".claude", "settings.json");
  const hookEntry = {
    type: "command",
    command: "node lib/time-tracking/session-start.mts",
    timeout: 30,
    statusMessage: "Updating time tracking...",
  };

  let settings = {};
  if (existsSync(file)) {
    try {
      settings = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      fail(".claude/settings.json exists but is not valid JSON - fix it and re-run.");
    }
  }

  settings.hooks ??= {};
  settings.hooks.SessionStart ??= [];

  const alreadyWired = settings.hooks.SessionStart.some((group) =>
    (group?.hooks ?? []).some((hook) => hook?.command?.includes("lib/time-tracking/session-start.mts")),
  );

  if (!alreadyWired) {
    settings.hooks.SessionStart.push({ hooks: [hookEntry] });
    writeFile(file, `${JSON.stringify(settings, null, 2)}\n`);
  }

  return !alreadyWired;
}

function runFirstCollect() {
  return spawnSync("node", ["lib/time-tracking/collect.mts"], { cwd: TARGET_ROOT, encoding: "utf8" });
}

// --- main ----------------------------------------------------------------

function main() {
  const pkg = readPackageJson();
  if (!pkg) {
    fail(
      "no package.json found in the current directory. This skill sets up a Node-based " +
        "time tracker, so run it from the root of a Node/npm project.",
    );
    return;
  }

  const packageManager = detectPackageManager();
  const projectName = detectProjectName(pkg);
  const timeZone = detectTimeZone();
  const startDate = todayInZone(timeZone);
  const values = {
    PROJECT_NAME: projectName,
    TIMEZONE: timeZone,
    START_DATE: startDate,
    START_DATE_MONTH: startDate.slice(0, 7),
    IDLE_GAP_MINUTES: 20,
    HOURS_MULTIPLIER: 1,
    AUTOMATION_SLUG: slugify(projectName),
    PROJECT_PATH: TARGET_ROOT,
  };

  console.log(`Setting up time tracking for ${projectName} (${TARGET_ROOT})`);
  console.log(`Detected package manager: ${packageManager.name}. Detected timezone: ${timeZone}.`);
  console.log("");

  const engineCount = copyEngineFiles();
  writeAgent();
  const pm = ensureProjectManagement(values);
  const ruleCreated = ensureRule();
  const gitignoreUpdated = ensureGitignore();
  const scripts = mergePackageScripts();
  const hookWired = mergeSettingsHook();
  const collectResult = runFirstCollect();

  console.log(`- lib/time-tracking/: ${engineCount} engine files synced`);
  console.log("- .claude/agents/time-tracker.md: synced");
  console.log(
    `- project-management/config.json: ${
      pm.configCreated ? `created (startDate ${startDate}, timeZone ${timeZone})` : "already existed, left untouched"
    }`,
  );
  console.log(
    `- project-management/readme.md: ${pm.readmeCreated ? "created" : "already existed, left untouched"}`,
  );
  console.log(`- rules/time-tracking.md: ${ruleCreated ? "created" : "already existed, left untouched"}`);
  console.log(`- .gitignore: ${gitignoreUpdated ? "added project-management/cache/" : "already ignored"}`);
  console.log(
    `- package.json scripts: ${scripts.added.length > 0 ? `added ${scripts.added.join(", ")}` : "already present"}` +
      (scripts.skipped.length > 0
        ? ` (left ${scripts.skipped.join(", ")} as-is - already defined to something else)`
        : ""),
  );
  console.log(`- .claude/settings.json SessionStart hook: ${hookWired ? "wired" : "already wired"}`);

  console.log("");
  if (collectResult.status === 0) {
    console.log("First collection ran:");
    console.log((collectResult.stdout || "").trim() || "(no transcripts found yet - nothing to report)");
  } else {
    console.log("First collection did not complete cleanly:");
    console.log((collectResult.stderr || collectResult.stdout || String(collectResult.error) || "").trim());
    if (/strip-types|Unknown file extension|SyntaxError/i.test(collectResult.stderr ?? "")) {
      console.log(
        "This usually means the local Node version does not support running .mts files " +
          "directly. Upgrade Node, or install `tsx` and run the scripts through it instead " +
          "(e.g. `npx tsx lib/time-tracking/collect.mts`).",
      );
    }
  }
  console.log(
    `Run it again anytime with \`node lib/time-tracking/collect.mts\` or \`${packageManager.run} time:collect\`.`,
  );

  console.log("");
  console.log("Scheduling is per machine, so this is not run automatically. Once per computer this");
  console.log("project is worked from, and only if the `orca` CLI is available:");
  console.log("");
  console.log(
    `orca automations create --name "${values.AUTOMATION_SLUG}-time-daily" \\\n` +
      `  --trigger weekdays --time 23:30 --timezone ${timeZone} \\\n` +
      `  --provider claude --workspace path:${TARGET_ROOT} \\\n` +
      `  --prompt "TIME-TRACKER-AUTOMATION - use the time-tracker agent to label this month's unlabelled days and commit"`,
  );
  console.log("");
  console.log(
    `orca automations create --name "${values.AUTOMATION_SLUG}-time-monthly" \\\n` +
      `  --trigger "0 9 1 * *" --timezone ${timeZone} \\\n` +
      `  --provider claude --workspace path:${TARGET_ROOT} \\\n` +
      `  --prompt "TIME-TRACKER-AUTOMATION - use the time-tracker agent to finish last month, then run node lib/time-tracking/report.mts --last-month"`,
  );
}

main();
