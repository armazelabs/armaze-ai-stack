// The module pages: their on-disk format, a parser for it, and the lint that
// keeps a page fit for a client to read.
//
//   node <engine>/pages.mjs lint [file...]     # every page when no file is given
//   node <engine>/pages.mjs list
//
// The format is a strict subset of Markdown so that any renderer - a site
// page, a PDF, a plain viewer - can draw it without a Markdown library. The
// contract is written out for renderers in the skill's references/page-format.md.
//
//   modules/<id>/overview.md                      current state, rewritten
//   modules/<id>/history/<YYYY-MM-DD>-<slug>.md   one dated entry per file
//
// Lint errors block a publish. Warnings are for a person to look at: they
// catch words that are usually a slip (a tool's name, an hour count) but can
// be innocent.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MODULES_DIR, REPO_ROOT, loadConfig } from "./config.mjs";
import { authorIdentities, gitUser } from "./git.mjs";

export const OVERVIEW_SECTIONS = ["What it is", "What's built now", "Open follow-ups"];
export const WORK_SECTIONS = ["What changed", "Why and the plan", "Decisions made", "Open follow-ups"];
export const BACKFILL_SECTIONS = ["What changed", "Why and the plan"];
export const STATUSES = ["not-started", "in-progress"];
export const KINDS = ["work", "backfill"];

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const KEY = /^[a-z][a-z0-9-]*$/;

// --- front matter ----------------------------------------------------------

function parseValue(raw) {
  const value = raw.trim();
  if (value.startsWith('"')) return JSON.parse(value);
  if (value.startsWith("[")) {
    if (!value.endsWith("]")) throw new Error("an inline list must end with ]");
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    const items = [];
    let current = "";
    let quoted = false;
    for (let index = 0; index < inner.length; index += 1) {
      const char = inner[index];
      if (char === '"' && inner[index - 1] !== "\\") quoted = !quoted;
      if (char === "," && !quoted) {
        items.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    items.push(current);
    return items.map((item) => (item.trim().startsWith('"') ? JSON.parse(item.trim()) : item.trim())).filter((item) => item !== "");
  }
  return value;
}

/** `{ data, body, problems }` - front matter as an object, the rest as text. */
export function parseFrontMatter(text) {
  const problems = [];
  const normalized = text.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) return { data: {}, body: normalized, problems: ["no front matter (the file must start with ---)"] };
  const end = normalized.indexOf("\n---\n", 4);
  const endAtEof = normalized.endsWith("\n---") ? normalized.length - 4 : -1;
  const close = end === -1 ? endAtEof : end;
  if (close === -1) return { data: {}, body: normalized, problems: ["front matter is not closed with ---"] };
  const data = {};
  for (const line of normalized.slice(4, close).split("\n")) {
    if (!line.trim()) continue;
    const match = /^([^:]+):(.*)$/.exec(line);
    if (!match || !KEY.test(match[1].trim())) {
      problems.push(`front matter line is not "key: value": ${line}`);
      continue;
    }
    try {
      data[match[1].trim()] = parseValue(match[2]);
    } catch (error) {
      problems.push(`front matter "${match[1].trim()}" does not parse: ${error.message}`);
    }
  }
  return { data, body: normalized.slice(close + 5), problems };
}

function formatValue(value) {
  if (Array.isArray(value)) return `[${value.map((item) => (/^[A-Za-z0-9._/-]+$/.test(String(item)) ? String(item) : JSON.stringify(String(item)))).join(", ")}]`;
  if (typeof value === "string" && !/^[A-Za-z0-9._/-]+$/.test(value)) return JSON.stringify(value);
  return String(value);
}

/** Front matter text for `data`, keys in the given order, then any others. */
export function formatFrontMatter(data, order = []) {
  const keys = [...order.filter((key) => key in data), ...Object.keys(data).filter((key) => !order.includes(key))];
  return `---\n${keys.map((key) => `${key}: ${formatValue(data[key])}`).join("\n")}\n---\n`;
}

// --- body ------------------------------------------------------------------

/** Text with inline code spans blanked out, so their contents are not mistaken for markup. */
function withoutCode(text) {
  return text.replace(/`[^`]*`/g, (span) => " ".repeat(span.length));
}

/**
 * The body as sections: `[{ heading, blocks }]`, each block
 * `{ type: "paragraph", text }` or `{ type: "list", items: [text] }`.
 * Problems name every construct outside the subset.
 */
export function parseBody(body) {
  const sections = [];
  const problems = [];
  let section = null;
  let block = null;
  const lines = body.split("\n");

  const flush = () => {
    if (block && section) section.blocks.push(block);
    block = null;
  };

  lines.forEach((line, index) => {
    const where = `line ${index + 1}`;
    if (!line.trim()) {
      flush();
      return;
    }
    const heading = /^(#+)\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      if (heading[1].length !== 2) {
        problems.push(`${where}: only ## headings are allowed`);
        return;
      }
      section = { heading: heading[2].trim(), blocks: [] };
      sections.push(section);
      return;
    }
    if (!section) {
      problems.push(`${where}: text before the first ## heading`);
      return;
    }
    const plain = withoutCode(line);
    if (/^\s*\|/.test(line)) problems.push(`${where}: tables are not allowed`);
    if (/!\[/.test(plain)) problems.push(`${where}: images are not allowed`);
    if (/<\/?[A-Za-z][^>]*>/.test(plain)) problems.push(`${where}: HTML is not allowed (put code in backticks)`);
    if (/^\s*\d+[.)]\s/.test(line)) problems.push(`${where}: numbered lists are not allowed - use "- " bullets`);
    if (/^\s+[-*+]\s/.test(line)) problems.push(`${where}: nested lists are not allowed`);
    if (/^[*+]\s/.test(line)) problems.push(`${where}: bullets start with "- "`);
    if (/^>/.test(line)) problems.push(`${where}: quotes are not allowed`);
    if (/^```/.test(line)) problems.push(`${where}: code blocks are not allowed - use inline code`);

    if (line.startsWith("- ")) {
      if (block?.type !== "list") {
        flush();
        block = { type: "list", items: [] };
      }
      block.items.push(line.slice(2).trim());
    } else if (block?.type === "list" && line.startsWith("  ")) {
      block.items[block.items.length - 1] += ` ${line.trim()}`;
    } else {
      if (block?.type === "list") flush();
      if (!block) block = { type: "paragraph", text: line.trim() };
      else block.text += ` ${line.trim()}`;
    }
  });
  flush();
  return { sections, problems };
}

/** Inline markup a renderer must handle: `code`, **bold**, [text](link). */
export function inlineProblems(text) {
  const problems = [];
  const plain = withoutCode(text);
  if ((text.match(/`/g) ?? []).length % 2 !== 0) problems.push("an unclosed ` code span");
  for (const link of plain.matchAll(/\[([^\]]*)\]\(([^)]*)\)/g)) {
    const href = link[2].trim();
    if (!/^https:\/\//.test(href) && (/^[a-z]+:/i.test(href) || href.startsWith("//"))) {
      problems.push(`link "${href}" must be https or a project path`);
    }
  }
  return problems;
}

function sectionProblems(sections, expected, allowShorter = false) {
  const headings = sections.map((section) => section.heading);
  const exact = headings.length === expected.length && headings.every((heading, index) => heading === expected[index]);
  const prefix = allowShorter && headings.length >= 1 && headings.every((heading, index) => heading === expected[index]);
  if (exact || prefix) return [];
  return [`sections must be ${expected.map((heading) => `"## ${heading}"`).join(", ")}${allowShorter ? " (the later ones optional)" : ""}, in that order - found ${headings.map((heading) => `"${heading}"`).join(", ") || "none"}`];
}

function blockTexts(sections) {
  return sections.flatMap((section) => section.blocks.flatMap((block) => (block.type === "list" ? block.items : [block.text])));
}

/** A parsed overview: `{ meta, sections, problems }`. */
export function parseOverview(text) {
  const front = parseFrontMatter(text);
  const body = parseBody(front.body);
  const problems = [...front.problems, ...body.problems];
  const meta = front.data;
  if (!meta.module) problems.push('front matter needs "module"');
  if (!meta.name) problems.push('front matter needs "name"');
  if (!STATUSES.includes(meta.status)) problems.push(`"status" must be ${STATUSES.join(" or ")}`);
  if (!DAY.test(String(meta.updated ?? ""))) problems.push('"updated" must be YYYY-MM-DD');
  problems.push(...sectionProblems(body.sections, OVERVIEW_SECTIONS));
  for (const text of blockTexts(body.sections)) problems.push(...inlineProblems(text));
  return { meta, sections: body.sections, problems };
}

/** A parsed history entry: `{ meta, sections, problems }`. */
export function parseEntry(text, fileName = null) {
  const front = parseFrontMatter(text);
  const body = parseBody(front.body);
  const problems = [...front.problems, ...body.problems];
  const meta = front.data;
  if (!DAY.test(String(meta.date ?? ""))) problems.push('"date" must be YYYY-MM-DD');
  if (typeof meta.title !== "string" || !meta.title.trim()) problems.push('front matter needs a "title"');
  if (!KINDS.includes(meta.kind)) problems.push(`"kind" must be ${KINDS.join(" or ")}`);
  for (const key of ["sessions", "commits", "refs"]) {
    if (meta[key] !== undefined && !Array.isArray(meta[key])) problems.push(`"${key}" must be a [list]`);
  }
  if (fileName && meta.date && !fileName.startsWith(`${meta.date}-`)) problems.push(`the file name must start with its date (${meta.date}-)`);
  if (meta.kind === "backfill") problems.push(...sectionProblems(body.sections, BACKFILL_SECTIONS, true));
  else problems.push(...sectionProblems(body.sections, WORK_SECTIONS));
  for (const text of blockTexts(body.sections)) problems.push(...inlineProblems(text));
  return { meta, sections: body.sections, problems };
}

// --- the pages on disk -----------------------------------------------------

function list(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** Every page file: `{ module, kind: "overview" | "entry", file }`. */
export function pageFiles(modulesDir = MODULES_DIR) {
  const files = [];
  for (const entry of list(modulesDir)) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(modulesDir, entry.name);
    if (existsSync(path.join(dir, "overview.md"))) files.push({ module: entry.name, kind: "overview", file: path.join(dir, "overview.md") });
    for (const item of list(path.join(dir, "history"))) {
      if (item.isFile() && item.name.endsWith(".md")) files.push({ module: entry.name, kind: "entry", file: path.join(dir, "history", item.name) });
    }
  }
  return files;
}

/** Every committed entry's internal references: the sessions and commits it documents, by module. */
export function documentedRefs(modulesDir = MODULES_DIR) {
  const refs = [];
  for (const page of pageFiles(modulesDir)) {
    if (page.kind !== "entry") continue;
    try {
      const { data } = parseFrontMatter(readFileSync(page.file, "utf8"));
      refs.push({
        module: page.module,
        file: page.file,
        sessions: Array.isArray(data.sessions) ? data.sessions.map(String) : [],
        commits: Array.isArray(data.commits) ? data.commits.map(String) : [],
      });
    } catch {
      // An unreadable entry documents nothing; lint reports it.
    }
  }
  return refs;
}

// --- lint ------------------------------------------------------------------

const ID = /\b[RDSC]-\d{3,}\b/;
const TOOL_WORDS = /\b(claude|anthropic|chatgpt|gpt-?\d+|copilot|llm|skills?|subagents?|agents?|prompts?|plan mode|time tracker)\b/i;
const AI_WORD = /\bA\.?I\b/;
const HOURS = /\b\d+(?:\.\d+)?\s*(?:h|hrs?|hours?|mins?|minutes?)\b/i;
const MONEY = /(?:[$€£]\s?\d|\b(?:budget|billable|invoice|hourly|rate card)\b)/i;
const SHA = /\b(?=[0-9a-f]*[a-f])(?=[0-9a-f]*\d)[0-9a-f]{7,40}\b/;
/** Name parts that are also everyday words - matched only as part of a full name, never alone. */
const COMMON_WORDS = new Set(
  (
    "dev admin user users main bot cmd the and labs github noreply team info mail hello contact test person page pages " +
    "will mark grace rose bill frank art may june april august summer winter autumn hunter cook baker smith king rich " +
    "faith hope joy sky river stone wood woods field fields green white black brown gray grey young long short little " +
    "love dean chase drew rob sue pat max ray case lane park parks hall hill hills ford bell wells banks may cash gold " +
    "silver price page reed rice ward west north south east well wells new old big small fair good best day days"
  ).split(" "),
);

/**
 * What would say who did the work: every author name and email in the
 * history, the git user, and the time tracker's computer names.
 *
 * - `exact`: full names, emails, email local parts, usernames and computer
 *   names - matched whole, in any case
 * - `parts`: each part of a name, four letters or more and not an everyday
 *   word - matched as written in git (usually capitalised), so "Page" the
 *   person is caught without every "page" being flagged
 */
export function identityTokens({ identities = [], user = {}, computers = [] } = {}) {
  const exact = new Set();
  const parts = new Set();
  const addName = (name) => {
    if (!name?.trim()) return;
    exact.add(name.trim().toLowerCase());
    for (const part of name.trim().split(/[\s._-]+/)) {
      if (part.length >= 4 && !COMMON_WORDS.has(part.toLowerCase())) parts.add(part);
    }
  };
  const addEmail = (email) => {
    if (!email?.trim()) return;
    exact.add(email.trim().toLowerCase());
    const local = email.split("@")[0];
    if (local && local.length >= 4 && !COMMON_WORDS.has(local.toLowerCase()) && !/^\d+\+/.test(local)) exact.add(local.toLowerCase());
  };
  for (const identity of identities) (identity.kind === "email" ? addEmail : addName)(identity.value);
  addName(user.name);
  addEmail(user.email);
  for (const computer of computers) exact.add(computer.toLowerCase());
  return { exact: [...exact].filter((token) => !COMMON_WORDS.has(token)), parts: [...parts] };
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Lint one page's text. `{ errors, warnings }`. */
export function lintText(text, { kind, fileName = null, tokens = { exact: [], parts: [] } } = {}) {
  const parsed = kind === "overview" ? parseOverview(text) : parseEntry(text, fileName);
  const errors = [...parsed.problems];
  const warnings = [];
  const body = parseFrontMatter(text).body;
  const visible = [kind === "entry" ? String(parsed.meta.title ?? "") : String(parsed.meta.name ?? ""), body].join("\n");
  const lines = visible.split("\n");

  if (/\u2014/.test(text)) errors.push("contains an em dash - use a plain hyphen");
  if (/\{\{[^}]*\}\}/.test(text)) errors.push("still has a {{template placeholder}} - fill it in or remove it");
  lines.forEach((line, index) => {
    const where = index === 0 ? "title" : `body line ${index}`;
    if (ID.test(line)) errors.push(`${where}: an internal ID (${ID.exec(line)[0]}) - name the requirement or decision by its title`);
    if (/(?:^|[^\w])(?:project-management|\.claude)\//.test(line)) errors.push(`${where}: a project-management or .claude path`);
    const lower = line.toLowerCase();
    const named =
      (tokens.exact ?? []).find((token) => new RegExp(`(?<![a-z0-9])${escapeRegExp(token)}(?![a-z0-9])`).test(lower)) ??
      (tokens.parts ?? []).find((token) => new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(token)}(?![A-Za-z0-9])`).test(line));
    if (named) errors.push(`${where}: names a person or computer ("${named}") - pages never say who did the work`);
    const tool = TOOL_WORDS.exec(line) ?? AI_WORD.exec(line);
    if (tool) warnings.push(`${where}: mentions "${tool[0]}" - pages never mention the tools used`);
    if (HOURS.test(line)) warnings.push(`${where}: looks like a duration ("${HOURS.exec(line)[0]}") - hours stay off the pages`);
    if (MONEY.test(line)) warnings.push(`${where}: looks like money or budget ("${MONEY.exec(line)[0]}")`);
    if (SHA.test(withoutCode(line)) || SHA.test(line)) warnings.push(`${where}: looks like a commit SHA ("${SHA.exec(line)[0]}")`);
  });
  return { errors, warnings };
}

function computerNames(repoRoot) {
  const dir = path.join(repoRoot, "project-management", "tracking", "computers");
  return list(dir)
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

/** The tokens for this checkout. */
export function projectTokens(repoRoot = REPO_ROOT) {
  return identityTokens({ identities: authorIdentities(repoRoot), user: gitUser(repoRoot), computers: computerNames(repoRoot) });
}

/** Lint files (default every page). `{ results: [{ file, errors, warnings }], errorCount, warningCount }`. */
export function lintFiles(files = null, { repoRoot = REPO_ROOT, modulesDir = MODULES_DIR, tokens = projectTokens(repoRoot) } = {}) {
  const pages = files
    ? files.map((file) => ({ file: path.resolve(file), kind: path.basename(file) === "overview.md" ? "overview" : "entry" }))
    : pageFiles(modulesDir);
  const results = [];
  for (const page of pages) {
    let text;
    try {
      text = readFileSync(page.file, "utf8");
    } catch {
      results.push({ file: page.file, errors: ["cannot be read"], warnings: [] });
      continue;
    }
    const found = lintText(text, { kind: page.kind, fileName: path.basename(page.file), tokens });
    results.push({ file: page.file, ...found });
  }
  return {
    results,
    errorCount: results.reduce((sum, result) => sum + result.errors.length, 0),
    warningCount: results.reduce((sum, result) => sum + result.warnings.length, 0),
  };
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "lint") {
    const { results, errorCount, warningCount } = lintFiles(args.length ? args : null);
    for (const result of results) {
      if (result.errors.length === 0 && result.warnings.length === 0) continue;
      console.log(path.relative(REPO_ROOT, result.file));
      for (const error of result.errors) console.log(`  ✘ ${error}`);
      for (const warning of result.warnings) console.log(`  ! ${warning}`);
    }
    console.log(`${results.length} page(s): ${errorCount} error(s), ${warningCount} warning(s).`);
    process.exit(errorCount > 0 ? 1 : 0);
  }
  if (command === "list" || !command) {
    const config = loadConfig();
    const pages = pageFiles();
    for (const module of config?.modules ?? []) {
      const own = pages.filter((page) => page.module === module.id);
      const overview = own.find((page) => page.kind === "overview");
      let status = "no page yet";
      if (overview) status = parseOverview(readFileSync(overview.file, "utf8")).meta.status ?? "?";
      const count = own.filter((page) => page.kind === "entry").length;
      console.log(`${module.id}: ${status}, ${count} history ${count === 1 ? "entry" : "entries"}`);
    }
    return;
  }
  console.error(`Unknown command "${command}". Try lint or list.`);
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
