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
//   <repo>/<project-management>/<tracking>/<YYYY-MM>.<person>.md
//   <repo>/<project-management>/<tracking>/log.<person>.jsonl
//   <repo>/<project-management>/<tracking>/cache/

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
  hoursMultiplier: 1,
  workdays: [0, 1, 2, 3, 4, 5, 6],
  sentinel: "TIME-TRACKER-AUTOMATION",
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

/**
 * One timesheet per person. Every per-person file carries the person's id as a
 * suffix - `2026-09.munawar-khel.md` - so teammates who share a checkout never
 * write to the same file, and never conflict in git.
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
    if (emails.includes(wanted)) return { id, emails: new Set(emails) };
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
