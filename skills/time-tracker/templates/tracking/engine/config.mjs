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
//   <repo>/<project-management>/<tracking>/<YYYY-MM>.<person>.<computer>.md
//   <repo>/<project-management>/<tracking>/log.<person>.<computer>.jsonl
//   <repo>/<project-management>/<tracking>/activity/<YYYY-MM>.<person>.<computer>.json
//   <repo>/<project-management>/<tracking>/cache/
//   ~/.claude/time-tracker/machine.json                        <- which computer this is

import { execFileSync } from "node:child_process";
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
  // `{ "<id>": { "emails": [...] } }` - one entry per person, written by setup.
  people: {},
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

export const ACTIVITY_DIR = path.join(TRACKING_DIR, "activity");

/**
 * One timesheet per person per computer. Every such file carries a file id -
 * `<person>.<computer>`, as in `2026-09.munawar-khel.studio-3f9a.md` - so
 * neither teammates sharing a checkout nor one person's two computers ever
 * write to the same file, and nothing they commit conflicts in git.
 *
 * A file id with no computer part is a timesheet from before computers had
 * names. It is still read wherever timesheets are merged; setup hands it to
 * the first computer that is upgraded.
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
 * The stretches of time a computer counted, per day - committed so each of a
 * person's other computers can leave them out instead of counting them twice.
 */
export function activityPath(month, id) {
  return path.join(ACTIVITY_DIR, `${month}.${id}.json`);
}

/** `munawar-khel.studio-3f9a` -> its person and computer; a legacy id has no computer. */
export function splitFileId(id) {
  const dot = id.indexOf(".");
  return dot === -1 ? { person: id, machine: null } : { person: id.slice(0, dot), machine: id.slice(dot + 1) };
}

/**
 * Every file id with a timesheet for `month` - everyone's, every computer's,
 * legacy ones included. Found from the file names, so a new computer never has
 * to be registered anywhere a teammate could also be writing.
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

/** One person's file ids for `month`: each of their computers, plus a legacy file if one is left. */
export function personFileIds(month, personId, dir = TRACKING_DIR) {
  return monthFileIds(month, dir).filter((id) => splitFileId(id).person === personId);
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

/** The git identity of whoever is running this, or null where there is none. */
export function gitEmail() {
  try {
    return (
      execFileSync("git", ["config", "user.email"], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() || null
    );
  } catch {
    return null;
  }
}

/**
 * Who this timesheet belongs to: the `people` entry whose emails include the
 * current `git config user.email`.
 *
 * The emails are only ever used to pick the person and to filter commits. They
 * never reach the month file or the PDF - the id is what names the files.
 */
export function currentPerson(config) {
  const email = gitEmail();
  if (!email) {
    throw new Error(
      "No git user.email here, so there is no way to tell whose timesheet this is. " +
        'Run `git config user.email "you@example.com"`, then re-run the time-tracker setup.',
    );
  }
  const wanted = email.toLowerCase();
  for (const [id, person] of Object.entries(config.people ?? {})) {
    const emails = (person?.emails ?? []).map((value) => String(value).toLowerCase());
    if (emails.includes(wanted)) {
      const machine = machineName();
      if (!machine) {
        throw new Error(
          `This computer has no name yet (${machinePath()}), so there is no way to keep its ` +
            "timesheet apart from your other computers'. Re-run the time-tracker setup here.",
        );
      }
      return { id, machine, fileId: `${id}.${machine}`, emails: new Set(emails) };
    }
  }
  throw new Error(
    `${email} is not registered in ${CONFIG_PATH}. Re-run the time-tracker setup to add ` +
      "yourself - each person on a project gets their own timesheet.",
  );
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
