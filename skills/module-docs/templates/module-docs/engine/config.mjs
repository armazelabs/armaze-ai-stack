// Paths, settings and path classification shared by every module-docs engine file.
//
//   node <engine>/config.mjs list
//   node <engine>/config.mjs classify <path>...
//   node <engine>/config.mjs add-module --name "Profiles" --description "..." [--id profiles] [--source <file>] [--path <glob>]...
//   node <engine>/config.mjs add-paths --id profiles --path <glob>...
//   node <engine>/config.mjs exclude --area "Staging gate" --path <glob>...
//   node <engine>/config.mjs adopt
//
// Every path is derived from this file's own location, so the engine works on
// whichever computer and checkout it runs from. Layout, from here outwards:
//
//   <repo>/project-management/module-docs/engine/config.mjs     <- here
//   <repo>/project-management/module-docs/config.json           committed
//   <repo>/project-management/module-docs/modules/<id>/overview.md
//   <repo>/project-management/module-docs/modules/<id>/history/<YYYY-MM-DD>-<slug>.md
//   <repo>/project-management/module-docs/local/                gitignored, this computer only
//
// A path in the project is one of four things to module-docs:
//
//   - ignored     tooling: never offered for documentation (`ignore`)
//   - excluded    an area the person chose to leave out (`excluded`)
//   - a module    covered by a module's globs (`modules[].paths`)
//   - unassigned  none of those yet - asked about once, by area (`areaKey`)

import { mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** `.../project-management/module-docs` - the folder that owns everything. */
export const MODULE_DOCS_DIR = path.resolve(HERE, "..");
/** The project checkout. */
export const REPO_ROOT = path.resolve(MODULE_DOCS_DIR, "..", "..");
export const CONFIG_PATH = path.join(MODULE_DOCS_DIR, "config.json");
export const MODULES_DIR = path.join(MODULE_DOCS_DIR, "modules");
/** This computer's own records and caches. Gitignored. */
export const LOCAL_DIR = path.join(MODULE_DOCS_DIR, "local");

/** Tooling and generated files: never offered for documentation. */
export const DEFAULT_IGNORE = [
  ".claude/**",
  ".claude-local/**",
  "project-management/**",
  ".armaze-stack",
  "CLAUDE.md",
  "claude.md",
  "AGENTS.md",
  "agents.md",
  ".mcp.json",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lockb",
  "node_modules/**",
  "graft/**",
];

export const DEFAULT_CONFIG = {
  version: 1,
  // When module-docs was installed, as an ISO timestamp. Work before it is
  // history (the first run's backfill); work after it is asked about.
  installed: null,
  // The first day the first run's backfill reads commits from, `YYYY-MM-DD`.
  historyFrom: null,
  timeZone: "UTC",
  // "commit-and-push": Claude commits only the docs files and pushes them.
  // "leave": Claude writes the files and the person commits them.
  publish: { mode: "leave", remote: "origin", branch: "main" },
  // Present only when the project keeps requirements (requirements-intake).
  // `comingNext` lists the statuses a module page shows under "Coming next".
  requirements: null,
  // In display order. `paths` are globs relative to the project root.
  modules: [],
  // Areas the person chose to leave out: `{ area, paths, decided }`.
  excluded: [],
  ignore: DEFAULT_IGNORE,
};

export function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

/** The project's config merged over the defaults, or null when not set up. */
export function loadConfig(file = CONFIG_PATH) {
  const raw = readJson(file);
  if (!raw || typeof raw !== "object") return null;
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    publish: { ...DEFAULT_CONFIG.publish, ...(raw.publish ?? {}) },
    modules: Array.isArray(raw.modules) ? raw.modules : [],
    excluded: Array.isArray(raw.excluded) ? raw.excluded : [],
    ignore: Array.isArray(raw.ignore) ? raw.ignore : DEFAULT_IGNORE,
  };
}

/** Write a file only when its content changes, atomically. Returns whether it changed. */
export function writeIfChanged(file, content) {
  try {
    if (readFileSync(file, "utf8") === content) return false;
  } catch {
    // Absent - written below.
  }
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, content);
  renameSync(temp, file);
  return true;
}

export function saveConfig(config, file = CONFIG_PATH) {
  return writeIfChanged(file, `${JSON.stringify(config, null, 2)}\n`);
}

export function slugify(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** `YYYY-MM-DD` for an instant, in the project's time zone. */
export function localDay(ms, timeZone = "UTC") {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

// --- globs ---------------------------------------------------------------

/** `a/{b,c}/d` -> `a/b/d`, `a/c/d`. One level of braces, which is all config needs. */
export function expandBraces(glob) {
  const match = /\{([^{}]*)\}/.exec(glob);
  if (!match) return [glob];
  const before = glob.slice(0, match.index);
  const after = glob.slice(match.index + match[0].length);
  return match[1].split(",").flatMap((part) => expandBraces(`${before}${part}${after}`));
}

const compiled = new Map();

/** A glob as an anchored regular expression: `**` crosses folders, `*` and `?` do not. */
export function globToRegExp(glob) {
  let source = "";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === "*" && glob[index + 1] === "*") {
      if (glob[index + 2] === "/") {
        source += "(?:.*/)?";
        index += 2;
      } else {
        source += ".*";
        index += 1;
      }
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

export function matchesGlob(glob, rel) {
  let patterns = compiled.get(glob);
  if (!patterns) {
    patterns = expandBraces(glob).map(globToRegExp);
    compiled.set(glob, patterns);
  }
  return patterns.some((pattern) => pattern.test(rel));
}

/**
 * How specific a glob is: the literal text before its first wildcard, then
 * its whole length. `app/profile/edit/**` beats `app/profile/**` beats `app/**`.
 */
export function specificity(glob) {
  const wildcard = glob.search(/[*?{[]/);
  const literal = wildcard === -1 ? glob.length : wildcard;
  return literal * 1000 + glob.length;
}

function bestMatch(globs, rel) {
  let best = -1;
  for (const glob of globs ?? []) {
    if (typeof glob === "string" && matchesGlob(glob, rel)) best = Math.max(best, specificity(glob));
  }
  return best;
}

/** A path as the project sees it: repo-relative with forward slashes, or null when outside it. */
export function toRepoRelative(file, repoRoot = REPO_ROOT) {
  if (typeof file !== "string" || !file) return null;
  const roots = [repoRoot];
  try {
    roots.push(realpathSync(repoRoot));
  } catch {
    // A root that does not exist yet has no other spelling.
  }
  for (const root of roots) {
    const absolute = path.isAbsolute(file) ? file : path.join(root, file);
    const rel = path.relative(root, absolute);
    if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) return rel.split(path.sep).join("/");
  }
  return null;
}

/**
 * The area an unassigned path belongs to, as a key, a label and the globs that
 * would cover it. One question per area, never per file: everything in
 * `app/events/` is one area, every `components/event-*` file another.
 */
export function areaKey(rel) {
  const parts = rel.split("/");
  const CONTAINERS = new Set([
    "app",
    "apps",
    "lib",
    "src",
    "pages",
    "routes",
    "features",
    "modules",
    "packages",
    "components",
    "styles",
    "public",
    "server",
    "api",
    "hooks",
  ]);
  if (parts.length === 1) return { key: rel, label: rel, globs: [rel] };

  // Walk down through container folders (`src/app/...`) to the first folder
  // or file that names something.
  let depth = 0;
  while (depth < parts.length - 1 && CONTAINERS.has(parts[depth]) && depth < 2) depth += 1;
  if (depth === 0) {
    const top = parts[0];
    return { key: top, label: `${top}/`, globs: [`${top}/**`] };
  }
  const dir = parts.slice(0, depth).join("/");
  const name = parts[depth];
  if (depth < parts.length - 1) {
    // A folder inside the container: `app/events/...` -> `app/events`.
    const key = `${dir}/${name}`;
    return { key, label: `${key}/`, globs: [`${key}/**`] };
  }
  // A file directly in a container: group by the start of its name, so
  // `components/event-card.tsx` and `components/event-list.tsx` are one area.
  const stem = name.replace(/\.[^.]*$/, "");
  const prefix = stem.split(/[-_.]/)[0] || stem;
  const key = `${dir}/${prefix}`;
  return { key, label: `${dir}/${prefix}*`, globs: [`${dir}/${prefix}*`] };
}

/**
 * What a path is to module-docs. Ignored wins outright; between excluded areas
 * and modules, the most specific glob wins, and a module wins a tie.
 */
export function classify(rel, config) {
  if (bestMatch(config.ignore, rel) >= 0) return { kind: "ignored" };
  let module = null;
  let moduleScore = -1;
  for (const entry of config.modules ?? []) {
    const score = bestMatch(entry.paths, rel);
    if (score > moduleScore) {
      module = entry;
      moduleScore = score;
    }
  }
  let excluded = null;
  let excludedScore = -1;
  for (const entry of config.excluded ?? []) {
    const score = bestMatch(entry.paths, rel);
    if (score > excludedScore) {
      excluded = entry;
      excludedScore = score;
    }
  }
  if (excludedScore > moduleScore) return { kind: "excluded", area: excluded.area };
  if (moduleScore >= 0) return { kind: "module", id: module.id, name: module.name };
  return { kind: "unassigned", ...areaKey(rel) };
}

/** The group a path is filed under: a module id, `area:<key>`, or null when it is not documentable. */
export function groupOf(rel, config) {
  const found = classify(rel, config);
  if (found.kind === "module") return found.id;
  if (found.kind === "unassigned") return `area:${found.key}`;
  return null;
}

/** A group as it appears in an item id and a file name. */
export function groupToken(group) {
  return group.startsWith("area:") ? `area-${slugify(group.slice(5))}` : group;
}

// --- CLI -----------------------------------------------------------------

function flagValues(args, name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && args[index + 1] != null) values.push(args[index + 1]);
  }
  return values;
}

function flag(args, name) {
  return flagValues(args, name)[0] ?? null;
}

function requireConfig() {
  const config = loadConfig();
  if (!config) {
    console.error("module-docs is not set up in this project - run the skill's setup first.");
    process.exit(1);
  }
  return config;
}

function today(config) {
  return localDay(Date.now(), config.timeZone);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const config = requireConfig();

  if (command === "list" || !command) {
    console.log("Modules (in page order):");
    for (const entry of config.modules) {
      console.log(`- ${entry.id}: ${entry.name}${entry.paths?.length ? ` - ${entry.paths.join(", ")}` : " - no paths yet"}`);
    }
    if (config.modules.length === 0) console.log("- none yet");
    console.log("Excluded areas:");
    for (const entry of config.excluded) console.log(`- ${entry.area}: ${entry.paths.join(", ")}`);
    if (config.excluded.length === 0) console.log("- none");
    return;
  }

  if (command === "classify") {
    for (const file of args) {
      const rel = toRepoRelative(file) ?? file;
      const found = classify(rel, config);
      const what =
        found.kind === "module"
          ? `module ${found.id}`
          : found.kind === "excluded"
            ? `excluded (${found.area})`
            : found.kind === "unassigned"
              ? `unassigned - area ${found.label} (${found.globs.join(", ")})`
              : "ignored (tooling)";
      console.log(`${rel}: ${what}`);
    }
    return;
  }

  if (command === "add-module") {
    const name = flag(args, "--name");
    if (!name) throw new Error("add-module needs --name.");
    const id = slugify(flag(args, "--id") ?? name);
    if (!id) throw new Error(`"${name}" does not make a usable id - pass --id.`);
    if (config.modules.some((entry) => entry.id === id)) throw new Error(`A module with id "${id}" already exists.`);
    const entry = {
      id,
      name,
      description: flag(args, "--description") ?? "",
      source: flag(args, "--source") ?? null,
      paths: flagValues(args, "--path"),
    };
    config.modules.push(entry);
    saveConfig(config);
    console.log(`Added module ${id} (${name})${entry.paths.length ? ` covering ${entry.paths.join(", ")}` : ""}.`);
    return;
  }

  if (command === "add-paths") {
    const id = flag(args, "--id");
    const entry = config.modules.find((module) => module.id === id);
    if (!entry) throw new Error(`No module with id "${id}".`);
    const added = flagValues(args, "--path").filter((glob) => !(entry.paths ?? []).includes(glob));
    entry.paths = [...(entry.paths ?? []), ...added];
    saveConfig(config);
    console.log(added.length ? `${id} now also covers ${added.join(", ")}.` : `${id} already covers those paths.`);
    return;
  }

  if (command === "exclude") {
    const area = flag(args, "--area");
    const paths = flagValues(args, "--path");
    if (!area || paths.length === 0) throw new Error("exclude needs --area and at least one --path.");
    const existing = config.excluded.find((entry) => entry.area === area);
    if (existing) existing.paths = [...new Set([...existing.paths, ...paths])];
    else config.excluded.push({ area, paths, decided: today(config) });
    saveConfig(config);
    console.log(`Excluded ${area}: ${paths.join(", ")}.`);
    return;
  }

  if (command === "adopt") {
    const { adoptable } = await import("./requirements.mjs");
    const found = adoptable(config);
    if (found.adopt.length === 0 && found.similar.length === 0) {
      console.log("Nothing to adopt - every requirements module is already a module here.");
      return;
    }
    for (const { slug, name } of found.adopt) {
      config.modules.push({ id: slug, name, description: "", source: found.sources[slug] ?? null, paths: [] });
      console.log(`Adopted ${slug} (${name}) from the requirements. It has no paths yet.`);
    }
    for (const { slug, like } of found.similar) {
      console.log(`Not adopted: requirements module "${slug}" looks like the existing "${like}" - rename one so they match.`);
    }
    saveConfig(config);
    return;
  }

  throw new Error(`Unknown command "${command}". Try list, classify, add-module, add-paths, exclude or adopt.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
