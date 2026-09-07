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
// clobbered. There is no on/off switch: setup writes today's date into
// config.json as `trackFrom`, and every day from then on counts.

import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
/**
 * An existing install always wins over the naming convention.
 *
 * A project may keep its tracking folder under a name this script would never
 * have chosen - `project-management-log`, say. Matching on the name alone would
 * miss it and build a second, empty tracker beside the real one, so look for
 * the install itself first and only fall back to the name.
 */
function findInstalledTrackingDir() {
  for (const entry of entries(TARGET_ROOT)) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const parent = path.join(TARGET_ROOT, entry.name);
    for (const child of entries(parent)) {
      if (!child.isDirectory() || !TRACKING_NAME.test(child.name)) continue;
      const dir = path.join(parent, child.name);
      if (existsSync(path.join(dir, "config.json")) || existsSync(path.join(dir, "engine"))) {
        return { pmDir: parent, dir };
      }
    }
  }
  return null;
}

function resolveProjectManagementDir(installed) {
  if (installed) return { dir: installed.pmDir, created: false };

  const found = entries(TARGET_ROOT).find((entry) => entry.isDirectory() && PM_NAME.test(entry.name));
  if (found) return { dir: path.join(TARGET_ROOT, found.name), created: false };

  const dir = path.join(TARGET_ROOT, "project-management");
  mkdirSync(dir, { recursive: true });
  return { dir, created: true };
}

function resolveTrackingDir(pmDir, installed) {
  if (installed) return { dir: installed.dir, created: false };

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
  const source = path.join(TEMPLATES_DIR, "tracking", "engine");
  cpSync(source, dest, { recursive: true });

  // Prune what the templates no longer ship. An engine file left behind from an
  // older install is not inert - `track.mjs start` would still appear to work
  // while writing to a switch nothing reads any more.
  const shipped = new Set(readdirSync(source));
  for (const name of readdirSync(dest)) {
    if (!shipped.has(name)) rmSync(path.join(dest, name), { recursive: true, force: true });
  }
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

/**
 * Remove the SessionStart hook a previous version of this skill installed.
 *
 * The tracker no longer runs in the background: it measures and labels only
 * when the user asks for it. A leftover hook would keep collecting on every
 * session start, so an upgrade has to take it out rather than merely stop
 * shipping it.
 */
function removeSettingsHook() {
  const file = path.join(TARGET_ROOT, ".claude", "settings.json");
  if (!existsSync(file)) return { removed: false };

  let settings;
  try {
    settings = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return { removed: false, error: ".claude/settings.json is not valid JSON - fix it and re-run." };
  }

  const groups = settings?.hooks?.SessionStart;
  if (!Array.isArray(groups)) return { removed: false };

  let removed = false;
  const kept = [];
  for (const group of groups) {
    const hooks = (group?.hooks ?? []).filter((hook) => {
      const ours = /session-start\.m[jt]s/.test(hook?.command ?? "");
      if (ours) removed = true;
      return !ours;
    });
    // A group emptied by the removal goes too; a group that held other hooks
    // as well keeps them.
    if (hooks.length > 0) kept.push({ ...group, hooks });
  }
  if (!removed) return { removed: false };

  if (kept.length > 0) settings.hooks.SessionStart = kept;
  else delete settings.hooks.SessionStart;
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;

  writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);
  return { removed: true };
}

/**
 * The first day that counts.
 *
 * Three answers, in order of authority:
 *
 * 1. The earliest day the old start/stop switch tracked, if there is a
 *    state.json to read it from.
 * 2. Otherwise the earliest day already written to a month file. An install
 *    predating the switch entirely has no state.json but may hold months of
 *    recorded work, and the collector drops every day before the boundary - so
 *    defaulting to today here would silently delete that history on the very
 *    next run.
 * 3. Otherwise today: a fresh install, where the user asked for tracking now.
 */
function resolveTrackFrom(trackingDir, todayDay) {
  try {
    const ranges = JSON.parse(readFileSync(path.join(trackingDir, "state.json"), "utf8"))?.ranges ?? [];
    const days = ranges.map((range) => range?.from).filter((from) => typeof from === "string");
    if (days.length > 0) return { day: days.sort()[0], migrated: true, source: "the old start/stop switch" };
  } catch {
    // No state.json, or unreadable - the month files are the next authority.
  }

  const recorded = [];
  for (const name of entries(trackingDir)) {
    if (!/^\d{4}-\d{2}\.md$/.test(name.name)) continue;
    try {
      const text = readFileSync(path.join(trackingDir, name.name), "utf8");
      for (const [, day] of text.matchAll(/^##\s+(\d{4}-\d{2}-\d{2})/gm)) recorded.push(day);
    } catch {
      // An unreadable month file simply does not vote.
    }
  }
  if (recorded.length > 0) {
    return { day: recorded.sort()[0], migrated: true, source: "the earliest day already on the timesheet" };
  }

  return { day: todayDay, migrated: false };
}

/**
 * Add `trackFrom` to a config.json written by the start/stop version.
 *
 * config.json is project-owned and otherwise never rewritten, but a config with
 * no boundary makes the collector refuse to run - so this one key is backfilled
 * rather than left for the user to discover.
 */
function backfillTrackFrom(configPath, day) {
  if (!existsSync(configPath)) return { backfilled: false };
  let config;
  try {
    config = JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    return { backfilled: false, error: "config.json will not parse - add trackFrom by hand." };
  }
  if (typeof config.trackFrom === "string" && config.trackFrom) return { backfilled: false };
  config.trackFrom = day;
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return { backfilled: true };
}

// --- main ----------------------------------------------------------------

function main() {
  const project = detectProjectName();
  const timeZone = detectTimeZone();
  const multiplier = parseMultiplier();
  const todayDay = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const installed = findInstalledTrackingDir();
  const pm = resolveProjectManagementDir(installed);
  const tracking = resolveTrackingDir(pm.dir, installed);
  const trackingRel = path.relative(TARGET_ROOT, tracking.dir);
  const engineRel = path.join(trackingRel, "engine");
  const cacheRel = path.join(trackingRel, "cache");
  const trackFrom = resolveTrackFrom(tracking.dir, todayDay);

  const values = {
    PROJECT_NAME: project.name,
    TIMEZONE: timeZone,
    HOURS_MULTIPLIER: multiplier.value,
    TRACK_FROM: trackFrom.day,
    ENGINE_REL: engineRel,
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
  // The readme is project-owned and normally written only if absent - but a
  // readme from the start/stop version documents commands that no longer
  // exist, which is worse than no readme at all. Staleness is decided by what
  // the file actually says, not by whether there was history to migrate: a
  // project that installed the old version and never tracked a day still has
  // the old readme.
  const readmePath = path.join(tracking.dir, "readme.md");
  const readmeContent = fill(readTemplate("tracking-readme.md"), values);
  const readmeStale = (() => {
    try {
      return /track\.mjs|state\.json/.test(readFileSync(readmePath, "utf8"));
    } catch {
      return false;
    }
  })();
  const readmeRewritten = readmeStale;
  if (readmeRewritten) writeFileSync(readmePath, readmeContent);
  const readmeCreated = ensureFile(readmePath, readmeContent);
  const gitignoreUpdated = ensureGitignore(cacheRel);
  const scripts = mergePackageScripts(engineRel);
  const backfilled = configCreated
    ? { backfilled: false }
    : backfillTrackFrom(path.join(tracking.dir, "config.json"), trackFrom.day);
  const hook = removeSettingsHook();
  // The start/stop switch is gone, and a stale state.json is only there to be
  // misread as one.
  const legacyState = path.join(tracking.dir, "state.json");
  const stateRemoved = existsSync(legacyState);
  if (stateRemoved) rmSync(legacyState);

  console.log(
    `- ${path.relative(TARGET_ROOT, pm.dir)}/: ${pm.created ? "created" : "found, reused"}`,
  );
  console.log(`- ${trackingRel}/: ${tracking.created ? "created" : "found, reused"}`);
  console.log(`- ${engineRel}/: ${engineCount} engine files synced`);
  console.log(
    `- ${trackingRel}/config.json: ${
      configCreated
        ? `created (timeZone ${timeZone}, trackFrom ${trackFrom.day}, hoursMultiplier ${multiplier.value})`
        : (backfilled.error
            ? `left untouched - ${backfilled.error}`
            : backfilled.backfilled
              ? `already existed - added trackFrom ${trackFrom.day}`
              : "already existed, left untouched") +
          (multiplier.given ? ` - --multiplier ignored, edit ${trackingRel}/config.json to change it` : "")
    }`,
  );
  console.log(
    `- ${trackingRel}/readme.md: ${
      readmeCreated
        ? "created"
        : readmeRewritten
          ? "rewritten - the old one documented start/stop"
          : "already existed, left untouched"
    }`,
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
    console.log(`- .claude/settings.json: left alone - ${hook.error}`);
  } else {
    console.log(
      `- .claude/settings.json SessionStart hook: ${
        hook.removed ? "removed - the tracker no longer runs in the background" : "none to remove"
      }`,
    );
  }
  if (stateRemoved) {
    console.log(`- ${trackingRel}/state.json: removed - start/stop is gone, trackFrom replaces it`);
  }

  console.log("");
  if (trackFrom.migrated) {
    console.log(`Migrated an existing install. trackFrom is ${trackFrom.day}, from`);
    console.log(`${trackFrom.source}, so nothing already recorded is dropped.`);
  } else {
    console.log(`Tracking counts every day from ${trackFrom.day} onward. There is no switch to`);
    console.log(`forget - to count earlier work, back-date trackFrom in ${trackingRel}/config.json.`);
  }
  console.log("");
  console.log('Say "update tracker" to Claude to bring the timesheet fully up to date:');
  console.log("remeasure the hours, name every unnamed day, re-render the PDF.");

  console.log("");
  console.log("Optional, per machine, and only if the `orca` CLI is installed - a nightly");
  console.log("labelling run and a monthly report:");
  console.log("");
  console.log(
    `orca automations create --name "${values.AUTOMATION_SLUG}-time-daily" \\\n` +
      `  --trigger daily --time 23:30 --timezone ${timeZone} \\\n` +
      `  --provider claude --workspace path:${TARGET_ROOT} \\\n` +
      `  --prompt "TIME-TRACKER-AUTOMATION - use the time-tracker skill to update the tracker"`,
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
