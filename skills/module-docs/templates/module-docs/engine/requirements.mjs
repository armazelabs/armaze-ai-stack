// The project's requirements, read - never written. Active only when config.json
// has a `requirements` block (setup adds one when project-management/requirements/
// exists, the folder the requirements-intake skill keeps).
//
// module-docs uses them three ways:
//
//   - the same module list: a module the requirements know and module-docs
//     does not is adopted (`config.mjs adopt`), so the two never drift
//   - evidence: a history entry names the requirement and decisions its work
//     delivered, by title
//   - "Coming next": a page lists the module's requirements whose status is in
//     `requirements.comingNext` - drawn by the site at build time, using the
//     rules written out in references/page-format.md
//
// The formats belong to another skill and may change, so every reader here is
// best-effort: a file that does not parse is skipped, never fatal. IDs (R-,
// D-, S-, C-NNN) are kept for the internal `refs` of an entry and stripped from
// anything a page shows.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { REPO_ROOT, slugify } from "./config.mjs";

export const ID_PATTERN = /\b[RDSC]-\d{3,}\b/g;

/** Text with requirement IDs, bracketed ID lists and Markdown links taken out. */
export function stripIds(text) {
  return String(text ?? "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\(\s*(?:[RDSC]-\d{3,}[\s,;]*)+\)/g, "")
    .replace(/^\s*[RDSC]-\d{3,}\s*[-:]\s*/, "")
    .replace(ID_PATTERN, "")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function requirementsDir(config, repoRoot = REPO_ROOT) {
  const dir = config?.requirements?.dir;
  if (!dir) return null;
  const full = path.resolve(repoRoot, dir);
  return existsSync(full) ? full : null;
}

function read(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function list(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** The value of a `- **Label:** value` bullet, ignoring template lines that list choices with `|`. */
export function bullet(text, label) {
  const pattern = new RegExp(`^- \\*\\*${label}:\\*\\*\\s*(.+)$`, "im");
  const value = pattern.exec(text ?? "")?.[1]?.trim();
  if (!value || value.includes(" | ") || /^<.*>$/.test(value) || /^_.*_$/.test(value)) return null;
  return value;
}

function heading(text) {
  return /^# (.+)$/m.exec(text ?? "")?.[1]?.trim() ?? null;
}

/** The first sentence of a `## Section`, skipping italic guidance and placeholders. */
export function firstSentence(text, section) {
  const lines = (text ?? "").split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${section}`);
  if (start === -1) return null;
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("## ")) break;
    if (!trimmed || /^_.*_$/.test(trimmed) || trimmed.startsWith("|") || trimmed.includes("[TBD")) continue;
    const plain = trimmed.replace(/^[-*]\s+/, "");
    const sentence = /^(.+?[.!?])(\s|$)/.exec(plain)?.[1] ?? plain;
    return stripIds(sentence);
  }
  return null;
}

/** A PRD: title, status, module (from its folder), a one-line summary and the IDs it cites. */
export function parseFeature(text, module, file = null) {
  const title = heading(text);
  if (!title) return null;
  return {
    kind: "feature",
    module,
    title: stripIds(title),
    status: (bullet(text, "Status") ?? "").toLowerCase().replace(/\s+/g, "-") || null,
    summary: stripIds(bullet(text, "Summary") ?? "") || firstSentence(text, "Problem"),
    ids: [...new Set(text.match(ID_PATTERN) ?? [])],
    file,
  };
}

/** A decision file: its title without the ID, status and module. */
export function parseDecision(text, file = null) {
  const title = heading(text);
  if (!title) return null;
  const id = /^[RDSC]-\d{3,}/.exec(title)?.[0] ?? null;
  const module = bullet(text, "Module");
  return {
    kind: "decision",
    id,
    title: stripIds(title),
    status: (bullet(text, "Status") ?? "").toLowerCase() || null,
    module: module && !/^global$/i.test(module) ? slugify(stripIds(module)) : null,
    file,
  };
}

function cells(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/**
 * The register's rows as objects keyed by lower-cased header names, from the
 * first table whose header has a Status column. Columns are found by name, so
 * reordering them breaks nothing.
 */
export function parseRegister(text) {
  const lines = (text ?? "").split("\n");
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!lines[index].trim().startsWith("|") || !/^\s*\|?\s*:?-{2,}/.test(lines[index + 1])) continue;
    const headers = cells(lines[index]).map((header) => header.toLowerCase());
    if (!headers.includes("status")) continue;
    const rows = [];
    for (const line of lines.slice(index + 2)) {
      if (!line.trim().startsWith("|")) break;
      const values = cells(line);
      rows.push(Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ""])));
    }
    return rows;
  }
  return [];
}

/**
 * Everything module-docs reads from the requirements: modules (with names),
 * features (PRDs), small asks from the register, and decisions.
 */
export function readRequirements(config, repoRoot = REPO_ROOT) {
  const dir = requirementsDir(config, repoRoot);
  const result = { dir, modules: [], features: [], asks: [], decisions: [] };
  if (!dir) return result;

  for (const entry of list(path.join(dir, "modules"))) {
    if (!entry.isDirectory()) continue;
    const slug = entry.name;
    const moduleDir = path.join(dir, "modules", slug);
    const overview = read(path.join(moduleDir, "overview.md"));
    const name = heading(overview)?.replace(/\s+-\s+overview$/i, "").trim() || null;
    result.modules.push({ slug, name, source: path.relative(repoRoot, path.join(moduleDir, "overview.md")).split(path.sep).join("/") });
    for (const item of list(path.join(moduleDir, "features"))) {
      if (!item.isFile() || !item.name.endsWith(".md")) continue;
      const file = path.join(moduleDir, "features", item.name);
      const feature = parseFeature(read(file) ?? "", slug, path.relative(repoRoot, file).split(path.sep).join("/"));
      if (feature) result.features.push(feature);
    }
  }

  for (const row of parseRegister(read(path.join(dir, "register.md")))) {
    if (!/small/i.test(row.type ?? "")) continue;
    const title = stripIds(row.ask ?? row.title ?? "");
    if (!title) continue;
    result.asks.push({
      kind: "ask",
      module: slugify(stripIds(row.module ?? "")) || null,
      title,
      status: (row.status ?? "").toLowerCase().replace(/[`*]/g, "").trim() || null,
      ids: [...new Set(`${row.id ?? ""} ${row.document ?? ""}`.match(ID_PATTERN) ?? [])],
    });
  }

  for (const item of list(path.join(dir, "decisions"))) {
    if (!item.isFile() || !item.name.endsWith(".md") || /^readme\.md$/i.test(item.name)) continue;
    const file = path.join(dir, "decisions", item.name);
    const decision = parseDecision(read(file) ?? "", path.relative(repoRoot, file).split(path.sep).join("/"));
    if (decision) result.decisions.push(decision);
  }
  return result;
}

/** A module's requirements whose status is one of `statuses` - the "Coming next" list. */
export function comingNext(requirements, moduleId, statuses = []) {
  const wanted = new Set(statuses.map((status) => status.toLowerCase()));
  return [...requirements.features, ...requirements.asks]
    .filter((item) => item.module === moduleId && wanted.has(item.status))
    .map(({ title, summary, status }) => ({ title, summary: summary ?? null, status }));
}

/** A module's features, asks and decisions, for an entry's evidence. */
export function forModule(requirements, moduleId) {
  return {
    features: requirements.features.filter((item) => item.module === moduleId),
    asks: requirements.asks.filter((item) => item.module === moduleId),
    decisions: requirements.decisions.filter((item) => item.module === moduleId),
  };
}

/**
 * Requirements modules module-docs does not have yet. A slug close to an
 * existing module (one is the other plus or minus an "s", or they share a
 * name) is reported, not adopted: two ids for one module is the drift this
 * exists to prevent.
 */
export function adoptable(config, repoRoot = REPO_ROOT) {
  const requirements = readRequirements(config, repoRoot);
  const ids = new Set((config.modules ?? []).map((module) => module.id));
  const names = new Map((config.modules ?? []).map((module) => [slugify(module.name), module.id]));
  const adopt = [];
  const similar = [];
  const sources = {};
  for (const { slug, name, source } of requirements.modules) {
    if (ids.has(slug)) continue;
    const near = [...ids].find((id) => id === `${slug}s` || `${id}s` === slug) ?? names.get(slugify(name ?? slug));
    if (near) similar.push({ slug, like: near });
    else {
      adopt.push({ slug, name: name ?? slug });
      sources[slug] = source;
    }
  }
  return { adopt, similar, sources };
}
