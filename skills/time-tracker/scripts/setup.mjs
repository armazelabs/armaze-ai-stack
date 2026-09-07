#!/usr/bin/env node
// Install the time tracker into whichever project this is run from.
//
// Works on any project, in any language, with or without a package manifest -
// the only dependency is Node itself, which Claude Code already ships with.
//
// Everything lives in one folder: <project-management>/tracking/. The engine
// goes in tracking/engine/ and is always re-synced, since it is generated code
// nobody is meant to hand-edit. Project-owned files - config.json and the
// readme - are written only if absent, so a project's own choices are never
// clobbered. Tracking is installed OFF; nothing is measured until the user
// starts it.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATES_DIR = path.join(SKILL_DIR, "templates");
const TARGET_ROOT = process.cwd();

const PM_NAME = /^project[-_ ]?management$/i;
const TRACKING_NAME = /^tracking$/i;

function readTemplate(relativePath) {
  return readFileSync(path.join(TEMPLATES_DIR, relativePath), "utf8");
}

function fill(text, values) {
  return text.replace(/{{(\w+)}}/g, (match, key) =>
    Object.hasOwn(values, key) ? String(values[key]) : match,
  );
}

function entries(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

// --- detection -----------------------------------------------------------

/**
 * The project's name, from whichever manifest it happens to have.
 *
 * No manifest is a perfectly normal answer - a docs repo, a design repo, a
 * shell-script repo - so this never fails. The folder name is the floor.
 */
function detectProjectName() {
  const read = (file) => {
    try {
      return readFileSync(path.join(TARGET_ROOT, file), "utf8");
    } catch {
      return null;
    }
  };
  const match = (text, pattern) => {
    if (!text) return null;
    const found = pattern.exec(text);
    return found ? found[1].trim() : null;
  };

  try {
    const pkg = read("package.json");
    if (pkg) {
      const name = JSON.parse(pkg)?.name;
      if (name) return { name, source: "package.json" };
    }
  } catch {
    // Malformed package.json - try the others.
  }

  const manifests = [
    ["pyproject.toml", /^\s*name\s*=\s*["']([^"']+)["']/m],
    ["Cargo.toml", /^\s*name\s*=\s*["']([^"']+)["']/m],
    ["go.mod", /^\s*module\s+(\S+)/m],
    ["composer.json", /"name"\s*:\s*"([^"]+)"/],
    ["pubspec.yaml", /^\s*name\s*:\s*(\S+)/m],
    ["build.gradle.kts", /^\s*rootProject\.name\s*=\s*["']([^"']+)["']/m],
    ["settings.gradle", /^\s*rootProject\.name\s*=\s*["']([^"']+)["']/m],
  ];
  for (const [file, pattern] of manifests) {
    const name = match(read(file), pattern);
    if (name) return { name: path.basename(name), source: file };
  }

  const solution = entries(TARGET_ROOT)
    .map((entry) => entry.name)
    .find((name) => /\.(csproj|sln)$/.test(name));
  if (solution) return { name: solution.replace(/\.(csproj|sln)$/, ""), source: solution };

  return { name: path.basename(TARGET_ROOT), source: "the folder name" };
}

/**
 * `--multiplier <n>` scales measured hours before they are recorded: 2 writes
 * an hour of measured activity down as two. Only meaningful on a first
 * install - once config.json exists it owns the value.
 */
function parseMultiplier() {
  const args = process.argv.slice(2);
  const flag = args.indexOf("--multiplier");
  if (flag === -1) return { value: 1, given: false };

  const raw = args[flag + 1];
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`time-tracker setup: --multiplier expects a positive number, got ${JSON.stringify(raw)}.`);
    process.exit(1);
  }
  return { value, given: true };
}

function detectTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Quote a path for a shell command only when it needs it. */
function shellPath(value) {
  return /\s/.test(value) ? `"${value}"` : value;
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "project";
}

// --- folders -------------------------------------------------------------

/**
 * Find the project-management folder, whatever it is called here, or create a
 * lowercase one. An existing `Project Management` or `project_management` is
 * reused as-is - renaming a folder a project already uses is not this script's
 * business.
 */
function resolveProjectManagementDir() {
  const found = entries(TARGET_ROOT).find((entry) => entry.isDirectory() && PM_NAME.test(entry.name));
  if (found) return { dir: path.join(TARGET_ROOT, found.name), created: false };

  const dir = path.join(TARGET_ROOT, "project-management");
  mkdirSync(dir, { recursive: true });
  return { dir, created: true };
}

function resolveTrackingDir(pmDir) {
  const found = entries(pmDir).find((entry) => entry.isDirectory() && TRACKING_NAME.test(entry.name));
  if (found) return { dir: path.join(pmDir, found.name), created: false };

  const dir = path.join(pmDir, "tracking");
  mkdirSync(dir, { recursive: true });
  return { dir, created: true };
}

// --- steps ---------------------------------------------------------------

function syncEngine(trackingDir) {
  const dest = path.join(trackingDir, "engine");
  mkdirSync(dest, { recursive: true });
  cpSync(path.join(TEMPLATES_DIR, "tracking", "engine"), dest, { recursive: true });
  return readdirSync(dest).filter((name) => name.endsWith(".mjs")).length;
}

function ensureFile(file, content) {
  if (existsSync(file)) return false;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
  return true;
}

function ensureGitignore(cacheRel) {
  const file = path.join(TARGET_ROOT, ".gitignore");
  const entry = `${cacheRel}/`;

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

/**
 * npm scripts are a convenience, not a requirement. A project without a
 * package.json simply does not get them, and the direct `node` commands are
 * what the readme documents in every project.
 */
function mergePackageScripts(engineRel) {
  const file = path.join(TARGET_ROOT, "package.json");
  if (!existsSync(file)) return { applicable: false, added: [], skipped: [] };

  let pkg;
  try {
    pkg = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return { applicable: false, added: [], skipped: [], malformed: true };
  }
  pkg.scripts ??= {};

  const wanted = {
    "time": `node ${shellPath(`${engineRel}/track.mjs`)}`,
    "time:collect": `node ${shellPath(`${engineRel}/collect.mjs`)}`,
    "time:report": `node ${shellPath(`${engineRel}/report.mjs`)}`,
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
  return { applicable: true, added, skipped };
}

function mergeSettingsHook(engineRel) {
  const file = path.join(TARGET_ROOT, ".claude", "settings.json");
  // $CLAUDE_PROJECT_DIR keeps the hook working from a subdirectory, and the
  // quotes keep it working when the folder name has a space in it.
  const command = `node "$CLAUDE_PROJECT_DIR/${engineRel}/session-start.mjs"`;
  const hookEntry = {
    type: "command",
    command,
    timeout: 30,
    statusMessage: "Updating time tracking...",
  };

  let settings = {};
  if (existsSync(file)) {
    try {
      settings = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      return { wired: false, error: ".claude/settings.json is not valid JSON - fix it and re-run." };
    }
  }

  settings.hooks ??= {};
  settings.hooks.SessionStart ??= [];

  const existing = settings.hooks.SessionStart.flatMap((group) => group?.hooks ?? []);
  const previous = existing.find((hook) => /session-start\.m[jt]s/.test(hook?.command ?? ""));

  if (previous) {
    // A re-run after the folder moved or was renamed: point the old hook at
    // where the engine actually lives now rather than leaving a dead command.
    if (previous.command === command) return { wired: false, updated: false };
    previous.command = command;
    writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);
    return { wired: false, updated: true };
  }

  settings.hooks.SessionStart.push({ hooks: [hookEntry] });
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);
  return { wired: true, updated: false };
}

// --- main ----------------------------------------------------------------

function main() {
  const project = detectProjectName();
  const timeZone = detectTimeZone();
  const multiplier = parseMultiplier();

  const pm = resolveProjectManagementDir();
  const tracking = resolveTrackingDir(pm.dir);
  const trackingRel = path.relative(TARGET_ROOT, tracking.dir);
  const engineRel = path.join(trackingRel, "engine");
  const cacheRel = path.join(trackingRel, "cache");

  const values = {
    PROJECT_NAME: project.name,
    TIMEZONE: timeZone,
    HOURS_MULTIPLIER: multiplier.value,
    ENGINE_REL: engineRel,
    CMD_START: `node ${shellPath(`${engineRel}/track.mjs`)} start`,
    CMD_STOP: `node ${shellPath(`${engineRel}/track.mjs`)} stop`,
    CMD_STATUS: `node ${shellPath(`${engineRel}/track.mjs`)} status`,
    CMD_COLLECT: `node ${shellPath(`${engineRel}/collect.mjs`)}`,
    CMD_REPORT: `node ${shellPath(`${engineRel}/report.mjs`)}`,
    CMD_REPORT_LAST: `node ${shellPath(`${engineRel}/report.mjs`)} --last-month`,
    TRACKING_REL: trackingRel,
    AUTOMATION_SLUG: slugify(project.name),
    PROJECT_PATH: TARGET_ROOT,
  };

  console.log(`Setting up time tracking for ${project.name} (${TARGET_ROOT})`);
  console.log(`Name read from ${project.source}. Timezone ${timeZone}. Node ${process.version}.`);
  console.log("");

  const engineCount = syncEngine(tracking.dir);
  const configCreated = ensureFile(
    path.join(tracking.dir, "config.json"),
    fill(readTemplate("config.json"), values),
  );
  const readmeCreated = ensureFile(
    path.join(tracking.dir, "readme.md"),
    fill(readTemplate("tracking-readme.md"), values),
  );
  const gitignoreUpdated = ensureGitignore(cacheRel);
  const scripts = mergePackageScripts(engineRel);
  const hook = mergeSettingsHook(engineRel);

  console.log(
    `- ${path.relative(TARGET_ROOT, pm.dir)}/: ${pm.created ? "created" : "found, reused"}`,
  );
  console.log(`- ${trackingRel}/: ${tracking.created ? "created" : "found, reused"}`);
  console.log(`- ${engineRel}/: ${engineCount} engine files synced`);
  console.log(
    `- ${trackingRel}/config.json: ${
      configCreated
        ? `created (timeZone ${timeZone}, hoursMultiplier ${multiplier.value})`
        : "already existed, left untouched" +
          (multiplier.given ? ` - --multiplier ignored, edit ${trackingRel}/config.json to change it` : "")
    }`,
  );
  console.log(
    `- ${trackingRel}/readme.md: ${readmeCreated ? "created" : "already existed, left untouched"}`,
  );
  console.log(`- .gitignore: ${gitignoreUpdated ? `added ${cacheRel}/` : "already ignored"}`);
  if (!scripts.applicable) {
    console.log(
      `- package.json scripts: ${scripts.malformed ? "package.json will not parse, left alone" : "no package.json here, skipped (not needed)"}`,
    );
  } else {
    console.log(
      `- package.json scripts: ${scripts.added.length > 0 ? `added ${scripts.added.join(", ")}` : "already present"}` +
        (scripts.skipped.length > 0
          ? ` (left ${scripts.skipped.join(", ")} as-is - already defined to something else)`
          : ""),
    );
  }
  if (hook.error) {
    console.log(`- .claude/settings.json SessionStart hook: NOT wired - ${hook.error}`);
  } else {
    console.log(
      `- .claude/settings.json SessionStart hook: ${
        hook.wired ? "wired" : hook.updated ? "repointed at the current engine path" : "already wired"
      }`,
    );
  }

  console.log("");
  console.log("Tracking is OFF. Nothing is measured until it is started:");
  console.log("");
  console.log(`  node ${shellPath(`${engineRel}/track.mjs`)} start`);
  console.log(`  node ${shellPath(`${engineRel}/track.mjs`)} stop`);
  console.log(`  node ${shellPath(`${engineRel}/track.mjs`)} status`);
  console.log("");
  console.log("Start and stop deal in whole dates - starting today counts today in full.");

  console.log("");
  console.log("Optional, per machine, and only if the `orca` CLI is installed - a nightly");
  console.log("labelling run and a monthly report:");
  console.log("");
  console.log(
    `orca automations create --name "${values.AUTOMATION_SLUG}-time-daily" \\\n` +
      `  --trigger daily --time 23:30 --timezone ${timeZone} \\\n` +
      `  --provider claude --workspace path:${TARGET_ROOT} \\\n` +
      `  --prompt "TIME-TRACKER-AUTOMATION - use the time-tracker skill to label this month's unlabelled days"`,
  );
  console.log("");
  console.log(
    `orca automations create --name "${values.AUTOMATION_SLUG}-time-monthly" \\\n` +
      `  --trigger "0 9 1 * *" --timezone ${timeZone} \\\n` +
      `  --provider claude --workspace path:${TARGET_ROOT} \\\n` +
      `  --prompt "TIME-TRACKER-AUTOMATION - use the time-tracker skill to label last month, then run node ${shellPath(`${engineRel}/report.mjs`)} --last-month"`,
  );
}

main();
