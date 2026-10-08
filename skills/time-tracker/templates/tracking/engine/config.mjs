// Paths and settings shared by every other engine file.
//
// Every path is derived at runtime from this file's own location rather than
// being hard-coded, because the timesheet has to work on whichever machine you
// happen to be using - a second computer will not have the same home directory
// or checkout path. It also means the project-management folder can be renamed
// or re-cased without touching a line of this code.
//
// Layout, from this file outwards:
//   <repo>/<project-management>/<tracking>/engine/config.mjs   <- here
//   <repo>/<project-management>/<tracking>/config.json
//   <repo>/<project-management>/<tracking>/<YYYY-MM>.<computer>.md
//   <repo>/<project-management>/<tracking>/log.<computer>.jsonl
//   <repo>/<project-management>/<tracking>/cache/
//   ~/.claude/time-tracker/machine.json                        <- which computer this is

import { homedir } from "node:os";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** `.../project-management/tracking` - the folder that owns everything. */
export const TRACKING_DIR = path.resolve(HERE, "..");
/** `.../project-management` - whatever it happens to be called. */
export const PM_DIR = path.resolve(TRACKING_DIR, "..");
/** The project checkout. */
export const REPO_ROOT = path.resolve(PM_DIR, "..");

export const CACHE_DIR = path.join(TRACKING_DIR, "cache");
export const CONFIG_PATH = path.join(TRACKING_DIR, "config.json");

const DEFAULT_CONFIG = {
  timeZone: "UTC",
  // The first day that counts, `YYYY-MM-DD`. Written at setup, and the only
  // boundary there is - there is no on/off switch. Null means not set up here,
  // and the collector refuses to run rather than sweeping in every transcript
  // the project has ever produced.
  trackFrom: null,
  // Days before this are left exactly as recorded. Written when an install
  // from before every computer counted in full is upgraded: those days had
  // time shared with another computer taken off, and re-measuring them now
  // would quietly grow weeks that were already reported. Null counts all.
  fullCountFrom: null,
  idleGapMinutes: 20,
  hoursMultiplier: 1.5,
  // Agent work no main session covered - a background subagent running while
  // its session sat idle. Scaled on its own, lighter than the main multiplier.
  subagentMultiplier: 1.2,
  // The project's hours per month, shared by everyone on it. A week may use a
  // quarter of it and the month never more than all of it - see budget.mjs.
  // Null means no budget: nothing is checked or blocked.
  monthlyHours: null,
  workdays: [0, 1, 2, 3, 4, 5, 6],
  sentinel: "TIME-TRACKER-AUTOMATION",
  // The work types a task can carry - the Type column, and the "By type" table
  // on the PDF. A project trims or extends it in its own config.json; a fixed
  // list keeps the per-type totals meaning the same thing month after month.
  categories: [
    "Design",
    "Development",
    "Research",
    "Content",
    "QA/Testing",
    "Meetings",
    "Project management",
    "Other",
  ],
};

/**
 * Where Claude Code keeps this project's transcripts. It encodes the checkout
 * path into the directory name, so this is computed rather than configured.
 */
export function transcriptDir(repoRoot = REPO_ROOT) {
  const encoded = repoRoot.replaceAll("/", "-").replaceAll(".", "-");
  return path.join(homedir(), ".claude", "projects", encoded);
}

/** The cross-project prompt log, used to label blocks with what was asked. */
export function historyPath() {
  return path.join(homedir(), ".claude", "history.jsonl");
}

/**
 * Every config folder Claude Code may run from for this checkout: the default
 * `~/.claude`, the repo's own `.claude-local` (a project may start Claude
 * with CLAUDE_CONFIG_DIR pointing there) and any CLAUDE_CONFIG_DIR set now.
 */
function configRoots(repoRoot = REPO_ROOT) {
  const roots = [path.join(homedir(), ".claude"), path.join(repoRoot, ".claude-local")];
  if (process.env.CLAUDE_CONFIG_DIR) roots.push(process.env.CLAUDE_CONFIG_DIR);
  return [...new Set(roots.map((root) => path.resolve(root)))];
}

/** Every place this project's transcripts may live; each is read and merged. */
export function transcriptDirs(repoRoot = REPO_ROOT) {
  const encoded = repoRoot.replaceAll("/", "-").replaceAll(".", "-");
  return configRoots(repoRoot).map((root) => path.join(root, "projects", encoded));
}

/** Every prompt log that may hold this project's prompts. */
export function historyPaths(repoRoot = REPO_ROOT) {
  return configRoots(repoRoot).map((root) => path.join(root, "history.jsonl"));
}

/**
 * One timesheet per computer. Every such file carries the computer's name as
 * its id, as in `2026-09.studio-3f9a.md`, so no two computers ever write to
 * the same file and nothing they commit conflicts in git. Each computer is
 * one worker: its hours count in full, whoever sits at it.
 *
 * An id of two parts, `<person>.<computer>`, is a timesheet from a computer
 * still on the version before this one. It is read wherever timesheets are
 * merged - its hours are real - until that computer upgrades and renames it.
 */
export function monthFilePath(month, id) {
  return path.join(TRACKING_DIR, `${month}.${id}.md`);
}

export function monthFilePattern(id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^(\\d{4}-\\d{2})\\.${escaped}\\.md$`);
}

export function logPath(id) {
  return path.join(TRACKING_DIR, `log.${id}.jsonl`);
}

/**
 * Every file id with a timesheet for `month` - every computer's, not-yet-
 * upgraded ones included. Found from the file names, so a new computer never
 * has to be registered anywhere a teammate could also be writing.
 */
export function monthFileIds(month, dir = TRACKING_DIR) {
  const pattern = new RegExp(`^${month}\\.([a-z0-9-]+(?:\\.[a-z0-9-]+)?)\\.md$`);
  let names = [];
  try {
    names = readdirSync(dir);
  } catch {
    // No tracking folder yet - nothing recorded.
  }
  return names
    .map((name) => pattern.exec(name)?.[1])
    .filter(Boolean)
    .sort();
}

/**
 * A computer's name as people read it: `studio-3f9a` -> `studio`. The four
 * random characters only keep two computers both called "studio" apart in
 * file names; on a PDF they are noise.
 */
export function computerLabel(id) {
  return String(id).replace(/-[0-9a-f]{4}$/, "");
}

/** Where this computer's name is kept - once per computer, for every project it tracks. */
export function machinePath() {
  return path.join(homedir(), ".claude", "time-tracker", "machine.json");
}

/** This computer's name, as setup wrote it, or null when setup has not named it yet. */
export function machineName() {
  try {
    const name = JSON.parse(readFileSync(machinePath(), "utf8")).name;
    return typeof name === "string" && /^[a-z0-9][a-z0-9-]*$/.test(name) ? name : null;
  } catch {
    return null;
  }
}

/**
 * Whose timesheet this is: this computer's. Its name is the file id - no git
 * identity, no list of people. The commits that name its work are the ones
 * made on it (see `localCommits` in log.mjs).
 */
export function currentComputer() {
  const machine = machineName();
  if (!machine) {
    throw new Error(
      `This computer has no name yet (${machinePath()}), so there is no way to keep its ` +
        "timesheet apart from other computers'. Re-run the time-tracker setup here.",
    );
  }
  return { machine, fileId: machine };
}

/**
 * Settings, with every key defaulted. A config file that is missing, empty or
 * missing a key is not an error - the tracker has to keep working on a project
 * nobody has configured.
 */
export function loadConfig() {
  let stored = {};
  try {
    stored = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    // No config file yet, or unreadable - the defaults stand.
  }
  const config = { ...DEFAULT_CONFIG, ...stored };
  if (!config.timeZone) {
    config.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  }
  return config;
}

/** `YYYY-MM` for a `YYYY-MM-DD` day. */
export function monthOf(day) {
  return day.slice(0, 7);
}

/**
 * Display name for the report title.
 *
 * Read from whichever manifest the project happens to have, at run time, so
 * the PDF stays correct if the project is renamed - and so a project with no
 * manifest at all (a docs repo, a design repo, a shell-script repo) still gets
 * a sensible name instead of an error. The folder name is always a valid
 * answer; nothing here may throw.
 */
export function projectName() {
  const read = (file) => {
    try {
      return readFileSync(path.join(REPO_ROOT, file), "utf8");
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
      const parsed = JSON.parse(pkg);
      if (parsed?.name) return parsed.name;
    }
  } catch {
    // Malformed package.json - fall through to the other manifests.
  }

  const candidates = [
    () => match(read("pyproject.toml"), /^\s*name\s*=\s*["']([^"']+)["']/m),
    () => match(read("Cargo.toml"), /^\s*name\s*=\s*["']([^"']+)["']/m),
    () => match(read("go.mod"), /^\s*module\s+(\S+)/m),
    () => match(read("composer.json"), /"name"\s*:\s*"([^"]+)"/),
    () => match(read("pubspec.yaml"), /^\s*name\s*:\s*(\S+)/m),
    () => match(read("build.gradle.kts"), /^\s*rootProject\.name\s*=\s*["']([^"']+)["']/m),
    () => match(read("settings.gradle"), /^\s*rootProject\.name\s*=\s*["']([^"']+)["']/m),
    () => match(read("Gemfile"), /^\s*#\s*name:\s*(\S+)/m),
  ];
  for (const candidate of candidates) {
    try {
      const name = candidate();
      if (name) return path.basename(name);
    } catch {
      // A manifest that will not parse is no worse than one that is absent.
    }
  }

  try {
    const solution = readdirSync(REPO_ROOT).find((entry) => /\.(csproj|sln)$/.test(entry));
    if (solution) return solution.replace(/\.(csproj|sln)$/, "");
  } catch {
    // Unreadable checkout root - the basename below still works.
  }

  return path.basename(REPO_ROOT);
}

/** Whether a path exists, for callers that would rather not import fs. */
export function fileExists(file) {
  return existsSync(file);
}
