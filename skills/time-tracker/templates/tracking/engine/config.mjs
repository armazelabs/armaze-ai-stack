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
//   <repo>/<project-management>/<tracking>/computers/<computer>/<YYYY-MM>.md
//   <repo>/<project-management>/<tracking>/computers/<computer>/log.jsonl
//   <repo>/<project-management>/<tracking>/reports/              <- the PDFs
//   <repo>/<project-management>/<tracking>/cache/
//   ~/.claude/time-tracker/machine.json                        <- which computer this is

import { homedir } from "node:os";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
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
/** The PDFs - every computer merged into one, the ones to read and send. */
export const REPORTS_DIR = path.join(TRACKING_DIR, "reports");

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
 * One folder per computer, `computers/<id>/`, holding that computer's
 * timesheets and log. The id is the computer's name, as in `studio-3f9a`, so
 * no two computers ever write to the same file and nothing they commit
 * conflicts in git. Each computer is one worker: its hours count in full,
 * whoever sits at it.
 *
 * Before the folders, a timesheet sat at the top as `<YYYY-MM>.<id>.md` and
 * the log as `log.<id>.jsonl`. A computer still on that version keeps writing
 * there until it pulls this one, so those names are still read wherever
 * timesheets are merged - their hours are real. Only the computer that owns
 * them moves them (`tidyOwnStrays`): moving another computer's file while it
 * is still writing it is exactly the conflict the per-computer split avoids.
 *
 * An id of two parts, `<person>.<computer>`, is older still: a timesheet from
 * the per-person version, flat by definition.
 */
export function computerDir(id, dir = TRACKING_DIR) {
  return path.join(dir, "computers", id);
}

export function legacyMonthPath(month, id, dir = TRACKING_DIR) {
  return path.join(dir, `${month}.${id}.md`);
}

export function legacyLogPath(id, dir = TRACKING_DIR) {
  return path.join(dir, `log.${id}.jsonl`);
}

/**
 * Where a computer's timesheet for `month` is: its folder, or the old flat
 * name when only that exists - so a computer not yet upgraded is still read,
 * and still written where it writes. A new file goes in the folder.
 */
export function monthFilePath(month, id, dir = TRACKING_DIR) {
  const current = path.join(computerDir(id, dir), `${month}.md`);
  const legacy = legacyMonthPath(month, id, dir);
  return !existsSync(current) && existsSync(legacy) ? legacy : current;
}

/** A computer's log, found the same way as its timesheets. */
export function logPath(id, dir = TRACKING_DIR) {
  const current = path.join(computerDir(id, dir), "log.jsonl");
  const legacy = legacyLogPath(id, dir);
  return !existsSync(current) && existsSync(legacy) ? legacy : current;
}

function list(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

const MONTH_NAME = /^(\d{4}-\d{2})\.md$/;
const ID_NAME = /^[a-z0-9][a-z0-9-]*$/;

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Every month one computer has a timesheet for, in its folder or flat. */
export function computerMonths(id, dir = TRACKING_DIR) {
  const legacy = new RegExp(`^(\\d{4}-\\d{2})\\.${escapeRegExp(id)}\\.md$`);
  const months = [
    ...list(computerDir(id, dir)).map((name) => MONTH_NAME.exec(name)?.[1]),
    ...list(dir).map((name) => legacy.exec(name)?.[1]),
  ];
  return [...new Set(months.filter(Boolean))].sort();
}

/**
 * Every file id with a timesheet for `month` - every computer's, not-yet-
 * upgraded ones included. Found from the folder and file names, so a new
 * computer never has to be registered anywhere a teammate could also be
 * writing.
 */
export function monthFileIds(month, dir = TRACKING_DIR) {
  const legacy = new RegExp(`^${month}\\.([a-z0-9-]+(?:\\.[a-z0-9-]+)?)\\.md$`);
  const ids = [
    ...list(path.join(dir, "computers")).filter(
      (id) => ID_NAME.test(id) && existsSync(path.join(computerDir(id, dir), `${month}.md`)),
    ),
    ...list(dir).map((name) => legacy.exec(name)?.[1]),
  ];
  return [...new Set(ids.filter(Boolean))].sort();
}

/**
 * Move this computer's own flat files into its folder: each `<YYYY-MM>.<id>.md`
 * and `log.<id>.jsonl`. Its flat PDFs (`<YYYY-MM>.<id>.pdf`, `weekly/<day>.<id>.pdf`)
 * are deleted - the PDFs in `reports/` cover every computer, and git keeps the
 * old ones. Only ever this computer's: see `computerDir`.
 *
 * A timesheet already in the folder wins. A flat one that matches it is
 * dropped; one that differs is left where it is and named in `kept`, for a
 * person to look at. The flat log is older than anything in the folder, so it
 * goes first when both exist.
 *
 * Returns `{ moved, deleted, kept }`, as names relative to `dir`.
 */
export function tidyOwnStrays(id, dir = TRACKING_DIR) {
  const done = { moved: [], deleted: [], kept: [] };
  const own = computerDir(id, dir);
  const escaped = escapeRegExp(id);
  const month = new RegExp(`^(\\d{4}-\\d{2})\\.${escaped}\\.md$`);
  const pdf = new RegExp(`^\\d{4}-\\d{2}(?:-\\d{2})?\\.${escaped}\\.pdf$`);
  const rel = (file) => path.relative(dir, file);
  const into = (from, to) => {
    mkdirSync(path.dirname(to), { recursive: true });
    renameSync(from, to);
    done.moved.push(`${rel(from)} -> ${rel(to)}`);
  };

  for (const name of list(dir)) {
    const found = month.exec(name);
    if (!found) continue;
    const from = path.join(dir, name);
    const to = path.join(own, `${found[1]}.md`);
    if (!existsSync(to)) into(from, to);
    else if (readFileSync(from, "utf8") === readFileSync(to, "utf8")) {
      unlinkSync(from);
      done.deleted.push(rel(from));
    } else done.kept.push(rel(from));
  }

  const flatLog = legacyLogPath(id, dir);
  if (existsSync(flatLog)) {
    const to = path.join(own, "log.jsonl");
    if (!existsSync(to)) into(flatLog, to);
    else {
      const older = readFileSync(flatLog, "utf8");
      const newer = readFileSync(to, "utf8");
      const temporary = `${to}.${process.pid}.tmp`;
      writeFileSync(temporary, `${older}${older && !older.endsWith("\n") ? "\n" : ""}${newer}`);
      renameSync(temporary, to);
      unlinkSync(flatLog);
      done.moved.push(`${rel(flatLog)} -> ${rel(to)}`);
    }
  }

  for (const folder of [dir, path.join(dir, "weekly")]) {
    for (const name of list(folder)) {
      if (!pdf.test(name)) continue;
      rmSync(path.join(folder, name), { force: true });
      done.deleted.push(rel(path.join(folder, name)));
    }
  }
  try {
    rmdirSync(path.join(dir, "weekly"));
  } catch {
    // Absent, or still holding another computer's PDFs - left alone.
  }
  return done;
}

/** One line on what `tidyOwnStrays` did, or null when it did nothing. */
export function describeTidy({ moved, deleted, kept }) {
  if (moved.length + deleted.length + kept.length === 0) return null;
  const parts = [];
  if (moved.length > 0) parts.push(`moved ${moved.length} file${moved.length === 1 ? "" : "s"} into computers/`);
  if (deleted.length > 0) parts.push(`removed ${deleted.length} old per-computer file${deleted.length === 1 ? "" : "s"}`);
  if (kept.length > 0) parts.push(`left ${kept.join(", ")} (differs from the copy in computers/ - check it)`);
  return `Tidied this computer's tracking files: ${parts.join("; ")}.`;
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
