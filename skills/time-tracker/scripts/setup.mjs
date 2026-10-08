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
//
// Each computer keeps its own timesheet. Setup names the computer it runs on
// once (kept in ~/.claude/time-tracker/machine.json, for every project), and
// that name suffixes its files (`2026-09.<computer>.md`), so no two computers
// ever share a file. No git identity is needed: a computer is a worker, and
// the commits that name its work are the ones made on it.
//
// Re-run on an install from before that - one timesheet per person per
// computer, `2026-09.<person>.<computer>.md` - it renames this computer's
// files, drops the overlap records nothing reads any more, and writes
// `fullCountFrom` so the weeks already reported keep their hours.

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { homedir, hostname } from "node:os";
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
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
 * an hour of measured activity down as two. 1.5 unless given. Only meaningful
 * on a first install - once config.json exists it owns the value.
 */
function parseMultiplier() {
  return parsePositive("--multiplier", 1.5);
}

/**
 * `--monthly-hours <n>` is the project's hour budget for a month, shared by
 * everyone on it - a quarter of it per week. Required on a first install; on
 * a re-run it sets the value, and without it the config keeps its own.
 */
function parseMonthlyHours() {
  return parsePositive("--monthly-hours", null);
}

function parsePositive(name, fallback) {
  const raw = flagValue(name);
  if (raw == null) return { value: fallback, given: false };
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`time-tracker setup: ${name} expects a positive number, got ${JSON.stringify(raw)}.`);
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

function gitConfig(key) {
  try {
    return (
      execFileSync("git", ["config", key], {
        cwd: TARGET_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() || null
    );
  } catch {
    return null;
  }
}

/**
 * This computer's name, from machine.json, or made now from `--machine`.
 *
 * Asked once per computer, not per project: the same laptop is the same
 * laptop in every project it tracks. The name the person chose is slugged and
 * given four random hex characters, so two computers both called "laptop"
 * still never share a file. Without a name and without the flag, setup stops
 * with the suggested name - the skill asks the person and runs it again.
 */
function resolveMachine() {
  const file = path.join(homedir(), ".claude", "time-tracker", "machine.json");
  try {
    const name = JSON.parse(readFileSync(file, "utf8")).name;
    if (typeof name === "string" && /^[a-z0-9][a-z0-9-]*$/.test(name)) {
      return { name, created: false, ignored: flagValue("--machine") != null };
    }
  } catch {
    // Not named yet.
  }

  const chosen = flagValue("--machine");
  if (!chosen) {
    const suggested = slugify(hostname().replace(/\.local$/i, "")) || "computer";
    console.error("time-tracker setup: this computer has no name yet. Each computer keeps its own");
    console.error("timesheet, so two computers never write the same file. Re-run with:");
    console.error("");
    console.error(`  --machine ${suggested}`);
    console.error("");
    console.error("or any short name of your own (studio, laptop...). It is asked once per computer.");
    process.exit(2);
  }
  const name = `${slugify(chosen)}-${randomBytes(2).toString("hex")}`;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(
    file,
    `${JSON.stringify({ name, chosen, hostname: hostname(), created: new Date().toISOString() }, null, 2)}\n`,
  );
  return { name, created: true, ignored: false };
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

function flagValue(name) {
  const args = process.argv.slice(2);
  const index = args.indexOf(name);
  return index === -1 ? null : (args[index + 1] ?? null);
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
export function findInstalledTrackingDir() {
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

/** Which hook runs which mode of `engine/hooks.mjs`. */
const HOOK_EVENTS = {
  SessionStart: "session-start",
  SessionEnd: "session-end",
  UserPromptSubmit: "prompt",
};

/** A hook this skill wrote: today's `engine/hooks.mjs`, or the old `session-start.mjs`. */
function isOurHook(hook) {
  return /engine\/hooks\.mjs|session-start\.m[jt]s/.test(hook?.command ?? "");
}

/**
 * The hooks in `settings`, with this skill's own replaced by the current ones
 * for `engineRel`. Everyone else's hooks are kept exactly as they are, and a
 * group emptied by the removal goes.
 */
export function withTrackerHooks(settings, engineRel) {
  const next = { ...settings, hooks: { ...(settings?.hooks ?? {}) } };
  for (const [event, mode] of Object.entries(HOOK_EVENTS)) {
    const kept = [];
    for (const group of Array.isArray(next.hooks[event]) ? next.hooks[event] : []) {
      const hooks = (group?.hooks ?? []).filter((hook) => !isOurHook(hook));
      if (hooks.length > 0) kept.push({ ...group, hooks });
    }
    // $CLAUDE_PROJECT_DIR keeps the command right wherever the checkout lives,
    // and on every teammate's computer.
    const script = `$CLAUDE_PROJECT_DIR/${engineRel.split(path.sep).join("/")}/hooks.mjs`;
    kept.push({ hooks: [{ type: "command", command: `node "${script}" ${mode}` }] });
    next.hooks[event] = kept;
  }
  return next;
}

/**
 * Wire the tracker into every session: SessionStart and SessionEnd re-measure
 * the hours, UserPromptSubmit stops prompts once the hour budget is used up.
 * Written to the project's own .claude/settings.json, which is committed, so
 * every teammate gets them. Also replaces the SessionStart hook an older
 * version of this skill installed.
 */
function installSettingsHooks(engineRel) {
  const file = path.join(TARGET_ROOT, ".claude", "settings.json");
  let settings = {};
  if (existsSync(file)) {
    try {
      settings = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      return { changed: false, error: ".claude/settings.json is not valid JSON - fix it and re-run." };
    }
  }
  const next = withTrackerHooks(settings, engineRel);
  const json = `${JSON.stringify(next, null, 2)}\n`;
  if (existsSync(file) && readFileSync(file, "utf8") === json) return { changed: false };
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, json);
  return { changed: true };
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
    if (!/^\d{4}-\d{2}(\.[^.]+){0,2}\.md$/.test(name.name)) continue;
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

/**
 * Add `categories` to a config.json written before tasks carried a work type.
 *
 * The engine falls back to the same default list, so nothing breaks without
 * it - but the list is meant to be edited per project, and a key the file does
 * not show is a key nobody knows to edit. The one other key added on a re-run.
 */
function backfillCategories(configPath, categories) {
  let config;
  try {
    config = JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    return { backfilled: false };
  }
  if (Array.isArray(config.categories)) return { backfilled: false };
  // Before `people`, where the template puts it, so the file still reads in
  // the template's order.
  const { people, ...rest } = config;
  writeConfig(configPath, people === undefined ? { ...rest, categories } : { ...rest, categories, people });
  return { backfilled: true };
}

/**
 * Bring an existing config.json up to the hour budget: add
 * `subagentMultiplier` if it is missing, and set `monthlyHours` when
 * `--monthly-hours` was given. Reports whether `monthlyHours` is still unset,
 * so the skill knows to ask.
 */
function backfillBudget(configPath, monthlyHours) {
  let config;
  try {
    config = JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    return { added: [], missing: false };
  }
  const added = [];
  const next = {};
  // Insert after hoursMultiplier, where the template puts them.
  for (const [key, value] of Object.entries(config)) {
    next[key] = value;
    if (key !== "hoursMultiplier") continue;
    if (!("subagentMultiplier" in config)) {
      next.subagentMultiplier = 1.2;
      added.push("subagentMultiplier 1.2");
    }
    if (!("monthlyHours" in config)) next.monthlyHours = null;
  }
  if (!("subagentMultiplier" in next)) {
    next.subagentMultiplier = 1.2;
    added.push("subagentMultiplier 1.2");
  }
  if (!("monthlyHours" in next)) next.monthlyHours = null;
  if (monthlyHours.given && next.monthlyHours !== monthlyHours.value) {
    next.monthlyHours = monthlyHours.value;
    added.push(`monthlyHours ${monthlyHours.value}`);
  }
  const changed = JSON.stringify(next) !== JSON.stringify(config);
  if (changed) writeConfig(configPath, next);
  return { added, missing: next.monthlyHours == null };
}

/** Keep short number arrays like `workdays` on one line, as the template writes them. */
function writeConfig(configPath, config) {
  const json = JSON.stringify(config, null, 2).replace(/\[\s*(\d+(?:,\s*\d+)*)\s*\]/g, (_, inner) =>
    `[${inner.split(/,\s*/).join(", ")}]`,
  );
  writeFileSync(configPath, `${json}\n`);
}

/**
 * How an install from before per-computer timesheets becomes one, as file
 * renames. `names` is the tracking folder's file names; `legacyPerson` is who
 * this computer's files belonged to, where that can be told.
 *
 * - `<month>.<person>.<machine>.md` and `log.<person>.<machine>.jsonl` - this
 *   computer's timesheet - become `<month>.<machine>.md` and
 *   `log.<machine>.jsonl`.
 * - `<month>.<person>.md` and `log.<person>.jsonl`, from before computers had
 *   names, are taken for `legacyPerson` - unless another computer of theirs
 *   already has files, which means it took that history first.
 * - `<month>.md` and `log.jsonl`, from before per-person files, are taken
 *   only when no other timesheet exists at all.
 *
 * A rename whose target exists, or that two files want - two people who
 * shared this computer - is a conflict: both stay where they are, to merge by
 * hand. The personal PDFs keep their old names; new ones are written beside
 * them.
 */
export function legacyMoves(names, machine, legacyPerson = null) {
  const MONTH = /^(\d{4}-\d{2})\.([a-z0-9-]+)(?:\.([a-z0-9-]+))?\.md$/;
  const LOG = /^log\.([a-z0-9-]+)(?:\.([a-z0-9-]+))?\.jsonl$/;
  const present = new Set(names);
  const wanted = new Map();
  const moves = [];
  const conflicts = [];
  const want = (from, to) => {
    if (present.has(to) || wanted.has(to)) {
      conflicts.push([from, to]);
      const earlier = moves.findIndex(([, target]) => target === to);
      if (earlier !== -1) conflicts.push(moves.splice(earlier, 1)[0]);
      return;
    }
    wanted.set(to, from);
    moves.push([from, to]);
  };
  const parse = (name) => {
    const month = MONTH.exec(name);
    if (month) return { kind: "month", month: month[1], person: month[3] ? month[2] : null, id: month[3] ?? month[2] };
    const log = LOG.exec(name);
    if (log) return { kind: "log", person: log[2] ? log[1] : null, id: log[2] ?? log[1] };
    return null;
  };
  const target = (file) => (file.kind === "month" ? `${file.month}.${machine}.md` : `log.${machine}.jsonl`);

  // This computer's own files.
  for (const name of names) {
    const file = parse(name);
    if (file?.person && file.id === machine) want(name, target(file));
  }

  // A person's files from before computers had names.
  let blocked = false;
  if (legacyPerson && legacyPerson !== machine) {
    const theirs = names.map((name) => [name, parse(name)]).filter(([, file]) => file && !file.person && file.id === legacyPerson);
    const elsewhere = names.some((name) => {
      const file = parse(name);
      return file?.person === legacyPerson && file.id !== machine;
    });
    if (elsewhere) blocked = theirs.length > 0;
    else for (const [name, file] of theirs) want(name, target(file));
  }

  // The one shared timesheet from before per-person files.
  const taken = new Set(moves.map(([from]) => from));
  const others = names.some((name) => {
    const file = parse(name);
    return file?.kind === "month" && !taken.has(name) && file.id !== machine;
  });
  if (!others) {
    for (const name of names) {
      const month = /^(\d{4}-\d{2})\.md$/.exec(name);
      if (month) want(name, `${month[1]}.${machine}.md`);
      else if (name === "log.jsonl") want(name, `log.${machine}.jsonl`);
    }
  }
  return { moves, conflicts, blocked };
}

/**
 * Who this computer's older files belonged to: the person part of its own
 * `<month>.<person>.<machine>.md`, else the `people` entry holding this
 * checkout's git email. Null when neither says - there is then no older
 * personal history to claim.
 */
export function legacyPersonFor(names, machine, people = {}, email = null) {
  for (const name of names) {
    const found = /^(?:\d{4}-\d{2}|log)\.([a-z0-9-]+)\.([a-z0-9-]+)\.(?:md|jsonl)$/.exec(name);
    if (found && found[2] === machine) return found[1];
  }
  const wanted = String(email ?? "").toLowerCase();
  if (!wanted) return null;
  for (const [id, entry] of Object.entries(people ?? {})) {
    if ((entry?.emails ?? []).some((value) => String(value).toLowerCase() === wanted)) return id;
  }
  return null;
}

/** The Monday of the week holding the 1st of `day`'s month - where full counting starts on an upgrade. */
export function firstWeekStart(day) {
  const first = `${day.slice(0, 7)}-01`;
  const offset = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  return new Date(Date.parse(`${first}T00:00:00Z`) - offset * 86400000).toISOString().slice(0, 10);
}

/** Whether a tracking folder holds an install from before per-computer timesheets. */
function isPerPersonInstall(trackingDir, config) {
  if (config && typeof config.people === "object" && config.people !== null) return true;
  if (existsSync(path.join(trackingDir, "activity"))) return true;
  return entries(trackingDir).some(
    (entry) => /^(?:\d{4}-\d{2}\.[a-z0-9-]+\.[a-z0-9-]+\.md|\d{4}-\d{2}\.md|log\.jsonl)$/.test(entry.name),
  );
}

/**
 * Move this computer onto per-computer timesheets: rename its files, drop its
 * overlap records and the evidence written under the old names (scratch, the
 * next collect rebuilds it), and list the weekly PDF folders from when weeks
 * were split at a month's edge - safe to delete, never deleted here.
 */
function migrateToComputer(trackingDir, cacheDir, machine, legacyPerson) {
  const names = entries(trackingDir).filter((entry) => entry.isFile()).map((entry) => entry.name);
  const result = legacyMoves(names, machine, legacyPerson);
  for (const [from, to] of result.moves) renameSync(path.join(trackingDir, from), path.join(trackingDir, to));

  const activityDir = path.join(trackingDir, "activity");
  let activityRemoved = 0;
  for (const entry of entries(activityDir)) {
    if (entry.isFile() && entry.name.endsWith(`.${machine}.json`)) {
      rmSync(path.join(activityDir, entry.name));
      activityRemoved += 1;
    }
  }
  if (existsSync(activityDir) && entries(activityDir).length === 0) rmSync(activityDir, { recursive: true });

  const stale = new RegExp(`^[\\d-]+\\.[a-z0-9-]+\\.${machine.replace(/-/g, "\\-")}\\.`);
  for (const entry of entries(cacheDir)) {
    if (entry.isFile() && (stale.test(entry.name) || /^\d{4}-\d{2}\.(?:raw\.json|pending\.json|html)$/.test(entry.name))) {
      rmSync(path.join(cacheDir, entry.name));
    }
  }

  const oldWeekly = [path.join(trackingDir, "weekly"), path.join(trackingDir, "client", "weekly")].flatMap((dir) =>
    entries(dir)
      .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}$/.test(entry.name))
      .map((entry) => path.join(dir, entry.name)),
  );
  return { ...result, activityRemoved, oldWeekly };
}

/**
 * Write `fullCountFrom` into an upgraded config.json: the Monday of this
 * month's first week. Days before it keep the hours already recorded - time
 * shared with another computer was taken off them, and those weeks were
 * reported. Never moved once set.
 */
function backfillFullCountFrom(configPath, day) {
  let config;
  try {
    config = JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    return { written: false };
  }
  if (config.fullCountFrom) return { written: false };
  const next = {};
  for (const [key, value] of Object.entries(config)) {
    next[key] = value;
    if (key === "trackFrom") next.fullCountFrom = day;
  }
  if (!("fullCountFrom" in next)) next.fullCountFrom = day;
  writeConfig(configPath, next);
  return { written: true };
}

// --- main ----------------------------------------------------------------

function main() {
  const project = detectProjectName();
  const machine = resolveMachine();
  const timeZone = detectTimeZone();
  const multiplier = parseMultiplier();
  const monthlyHours = parseMonthlyHours();
  const todayDay = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const installed = findInstalledTrackingDir();
  // Read before anything is written: an install from before per-computer
  // timesheets is what gets migrated, and what gets `fullCountFrom`.
  const priorConfig = installed ? readJson(path.join(installed.dir, "config.json")) : undefined;
  const perPerson = installed ? isPerPersonInstall(installed.dir, priorConfig) : false;
  // The hour budget is the one thing a first install cannot default, so it
  // stops before creating anything, like an unnamed computer does.
  if (!monthlyHours.given && !(installed && existsSync(path.join(installed.dir, "config.json")))) {
    console.error("time-tracker setup: how many hours a month does this project have? The whole team");
    console.error("shares them, a quarter per week (160 -> 40 a week). Re-run with:");
    console.error("");
    console.error("  --monthly-hours <hours>");
    process.exit(2);
  }
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
    MONTHLY_HOURS: monthlyHours.value ?? "null",
    WEEKLY_HOURS: monthlyHours.value == null ? "a quarter of `monthlyHours`" : `${monthlyHours.value / 4}`,
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
      // Also stale: a readme from before per-computer files, which documents
      // per-person ones (or one shared `<YYYY-MM>.md`) that no longer exist,
      // or from before unnamed time went on the PDFs as research - or from
      // before subagent time and tracker updates were measured as they are now
      // (including the turns an agent's report wakes the main session for),
      // or from before tasks carried a work type and manual hours existed.
      const text = readFileSync(readmePath, "utf8");
      return (
        /track\.mjs|state\.json/.test(text) ||
        !text.includes("<YYYY-MM>.<computer>.md") ||
        !text.includes("Research & exploration") ||
        !text.includes("Subagents count at their own multiplier") ||
        !text.includes("picks the result up on its own") ||
        !text.includes("check time tracker") ||
        !text.includes("manual.mjs")
      );
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
  const categories = configCreated
    ? { backfilled: false }
    : backfillCategories(
        path.join(tracking.dir, "config.json"),
        JSON.parse(fill(readTemplate("config.json"), values)).categories,
      );
  const budget = configCreated
    ? { added: [], missing: false }
    : backfillBudget(path.join(tracking.dir, "config.json"), monthlyHours);
  const hook = installSettingsHooks(engineRel);
  const migration = migrateToComputer(
    tracking.dir,
    path.join(tracking.dir, "cache"),
    machine.name,
    legacyPersonFor(
      entries(tracking.dir).map((entry) => entry.name),
      machine.name,
      priorConfig?.people,
      priorConfig?.people ? gitConfig("user.email") : null,
    ),
  );
  const fullCount =
    perPerson && !configCreated
      ? { ...backfillFullCountFrom(path.join(tracking.dir, "config.json"), firstWeekStart(todayDay)), day: firstWeekStart(todayDay) }
      : { written: false };
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
        ? `created (timeZone ${timeZone}, trackFrom ${trackFrom.day}, hoursMultiplier ${multiplier.value}, ` +
          `subagentMultiplier 1.2, monthlyHours ${monthlyHours.value} - ${monthlyHours.value / 4} a week)`
        : (backfilled.error
            ? `left untouched - ${backfilled.error}`
            : backfilled.backfilled || categories.backfilled || budget.added.length > 0
              ? `already existed - added ${[
                  backfilled.backfilled && `trackFrom ${trackFrom.day}`,
                  categories.backfilled && "the work-type categories",
                  ...budget.added,
                ]
                  .filter(Boolean)
                  .join(" and ")}`
              : "already existed, left untouched") +
          (multiplier.given ? ` - --multiplier ignored, edit ${trackingRel}/config.json to change it` : "")
    }`,
  );
  console.log(
    `- ${trackingRel}/readme.md: ${
      readmeCreated
        ? "created"
        : readmeRewritten
          ? "rewritten - the old one documented files that no longer exist"
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
    console.log(`- .claude/settings.json: hooks not installed - ${hook.error}`);
  } else {
    console.log(
      `- .claude/settings.json hooks (SessionStart, SessionEnd, UserPromptSubmit): ${
        hook.changed ? "installed" : "already installed"
      }`,
    );
  }
  if (budget.missing) {
    console.log(
      `- monthlyHours: not set - this project has no hour budget yet. Ask how many hours a month it has, ` +
        `then re-run setup with --monthly-hours <hours>.`,
    );
  }
  console.log(
    `- computer: ${
      machine.created
        ? `named ${machine.name} - saved in ~/.claude/time-tracker/machine.json for every project`
        : `${machine.name}${machine.ignored ? " (already named, --machine ignored)" : ""}`
    } (its files here end in .${machine.name}.md)`,
  );
  for (const [from, to] of migration.moves) {
    console.log(`- ${trackingRel}/${from} -> ${to}: now this computer's timesheet`);
  }
  for (const [from, to] of migration.conflicts) {
    console.log(
      `- ${trackingRel}/${from}: left as it is - ${to} is wanted by another file too. ` +
        "Two timesheets belong to this computer; merge their days into one by hand.",
    );
  }
  if (migration.blocked) {
    console.log(
      `- ${trackingRel}/: older personal timesheet files were left alone - another computer ` +
        "already took that history. Pull to see it.",
    );
  }
  if (migration.activityRemoved > 0) {
    console.log(
      `- ${trackingRel}/activity/: removed this computer's overlap records - every computer now counts in full`,
    );
  }
  if (fullCount.written) {
    console.log(
      `- ${trackingRel}/config.json: added fullCountFrom ${fullCount.day} - days before it keep the hours ` +
        "already recorded; from it on, every computer counts in full",
    );
  }
  for (const dir of migration.oldWeekly) {
    console.log(
      `- ${path.relative(TARGET_ROOT, dir)}/: weekly PDFs from when weeks were cut at the month's edge - ` +
        "safe to delete, weeks are now whole (weekly/<first day>.<computer>.pdf)",
    );
  }
  if (priorConfig?.people) {
    console.log(
      `- ${trackingRel}/config.json: "people" is no longer used - remove it once every computer on the ` +
        "project has upgraded (a computer on the older version still reads it)",
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

// Guarded so `legacyMoves` and friends can be imported by the tests without installing anything.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
