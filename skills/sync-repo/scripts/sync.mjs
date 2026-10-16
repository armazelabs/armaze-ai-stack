#!/usr/bin/env node
// Mirrors committed changes from this repo into the client repo (see ../SKILL.md).
// Reads only committed git objects, never the working tree.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const die = (msg) => {
  console.error(msg);
  process.exit(1);
};
const SRC = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
// A project that started with .sync-repo/ keeps it; SYNC_REPO_DATA overrides both for a test run.
const OLD_DATA = path.join(SRC, ".sync-repo");
const DATA = process.env.SYNC_REPO_DATA ?? (fs.existsSync(OLD_DATA) ? OLD_DATA : path.join(SRC, "project-management/sync-repo"));
const REL = path.relative(SRC, DATA);
const LOG = path.join(DATA, "sync-log.md");
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));
if (!fs.existsSync(path.join(DATA, "config.json"))) die(`No ${REL}/config.json yet: set the project up first (SKILL.md, "Set up").`);
// config.json is shared; local.json (gitignored) holds this machine's mirror folder.
const config = { ...readJson("config.json"), ...(fs.existsSync(path.join(DATA, "local.json")) ? readJson("local.json") : {}) };
const TGT = config.target ?? die(`No mirror folder set on this machine: write its path to ${REL}/local.json as {"target": "…"}.`);
// The project's own TypeScript parses best; without one, the copy npm install put in this skill folder.
const tryTs = (from) => {
  try {
    return createRequire(from)("typescript");
  } catch {
    return null;
  }
};
const ts =
  tryTs(path.join(SRC, "package.json")) ??
  tryTs(import.meta.url) ??
  die("This project has no TypeScript, which the code check uses: run npm install in the sync-repo skill's folder.");
// Mirror-owned files (the client README, its logos) exist only in the mirror and are never synced.
const OWNED = config.mirrorOwned ?? [];
const owned = (f) => OWNED.some((p) => (p.endsWith("/") ? f.startsWith(p) : f === p));
const SPEC = ["--", ".", ...[...config.exclude, ...OWNED].map((p) => `:(exclude)${p.replace(/\/$/, "")}`)];
const LEAKS = config.leakPatterns.map((p) => new RegExp(p, "g"));
const STRING_LEAKS = config.stringPatterns.map((p) => new RegExp(p, "g"));
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
// Only pushed commits are synced.
const REF = config.sourceRef ?? "HEAD";

const git = (cwd, args, opts) => execFileSync("git", ["-C", cwd, ...args], { maxBuffer: 1 << 30, ...opts });
const out = (cwd, args) => git(cwd, args, { encoding: "utf8" }).trim();
const zlist = (cwd, args) => git(cwd, args, { encoding: "utf8" }).split("\0").filter(Boolean);
const show = (rev, file) => git(SRC, ["show", `${rev}:${file}`]);
const isBinary = (buf) => buf.subarray(0, 8000).includes(0);
const inTarget = (file) => path.join(TGT, file);
const write = (file, buf) => {
  fs.mkdirSync(path.dirname(inTarget(file)), { recursive: true });
  fs.writeFileSync(inTarget(file), buf);
};

// --- sync state -------------------------------------------------------------

const lastSynced = () => fs.readFileSync(LOG, "utf8").match(/^Last synced: `([0-9a-f]{40})`/m)?.[1];

function record(sha, target, note) {
  const date = out(SRC, ["log", "-1", "--format=%as", sha]);
  const log = fs.readFileSync(LOG, "utf8").replace(/^Last synced: .*$/m, `Last synced: \`${sha}\``);
  const row = `| ${date} | ${sha.slice(0, 7)} | ${target} | ${note.replace(/\|/g, "\\|").slice(0, 100)} |`;
  fs.writeFileSync(LOG, `${log.trimEnd()}\n${row}\n`);
}

function pending() {
  const last = lastSynced();
  if (!last) die("Nothing synced yet: run `init` first.");
  try {
    git(SRC, ["merge-base", "--is-ancestor", last, REF], { stdio: "ignore" });
  } catch {
    die(`Last synced ${last.slice(0, 7)} is no longer in ${REF}'s history (rewritten?). Stop and ask.`);
  }
  // Each collaborator has their own mirror clone but shares this log: both must stand at the same commit.
  const logged = [...fs.readFileSync(LOG, "utf8").matchAll(/^\|[^|]*\| [0-9a-f]{7,} \| ([0-9a-f]{7,}) \|/gm)].at(-1)?.[1];
  if (logged && !out(TGT, ["rev-parse", "HEAD"]).startsWith(logged))
    die(`The mirror's HEAD is not ${logged}, the last mirror commit in the log. Pull the mirror and this repo, then retry.`);
  return out(SRC, ["rev-list", "--first-parent", "--reverse", `${last}..${REF}`]).split("\n").filter(Boolean);
}

function expectNext(rev) {
  const sha = out(SRC, ["rev-parse", rev]);
  const next = pending()[0];
  if (sha !== next) die(next ? `Next to sync is ${next.slice(0, 7)}, not ${sha.slice(0, 7)}.` : "Nothing pending.");
  return sha;
}

// Included changes of a commit against its first parent: [{ status, from?, file }].
function changes(sha) {
  const parts = zlist(SRC, ["diff-tree", "-r", "-M", "-z", "--no-commit-id", "--name-status", `${sha}^1`, sha, ...SPEC]);
  const list = [];
  for (let i = 0; i < parts.length; ) {
    const status = parts[i][0];
    if (status === "R" || status === "C") list.push({ status, from: parts[i + 1], file: parts[i + 2] }), (i += 3);
    else list.push({ status, file: parts[i + 1] }), (i += 2);
  }
  return list;
}

const targetDirty = () => out(TGT, ["status", "--porcelain"]) !== "";

// --- commands ---------------------------------------------------------------

function status() {
  if (REF.includes("/")) git(SRC, ["fetch", "-q", REF.split("/")[0]]);
  if (out(TGT, ["remote"]).split("\n").includes("origin")) {
    git(TGT, ["fetch", "-q", "origin"]);
    let behind = "0";
    try {
      behind = git(TGT, ["rev-list", "--count", "HEAD..origin/main"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {} // the client repo has no main yet
    if (behind !== "0") die(`The client repo has ${behind} commit(s) this mirror folder lacks. Pull the mirror and this repo, then retry.`);
  }
  const shas = pending();
  if (!shas.length) return console.log("Up to date.");
  if (targetDirty()) console.log(`warning: ${TGT} has uncommitted changes`);
  for (const sha of shas) {
    const list = changes(sha);
    console.log(out(SRC, ["log", "-1", "--format=%h %as %s", sha]).slice(0, 120));
    console.log(
      list.length
        ? list.map((c) => `    ${c.status} ${c.from ? `${c.from} -> ` : ""}${c.file}`).join("\n")
        : "    (only excluded paths: will be skipped)",
    );
  }
}

function init(rev) {
  if (lastSynced()) die("Already initialised: use status / apply.");
  if (fs.readdirSync(TGT).some((f) => f !== ".git")) die(`${TGT} is not empty.`);
  const sha = out(SRC, ["rev-parse", rev]);
  const tar = git(SRC, ["archive", "--format=tar", sha, ...SPEC]);
  execFileSync("tar", ["-x", "-C", TGT], { input: tar, maxBuffer: 1 << 30 });
  console.log(`Exported ${sha}. Clean it, verify ${sha.slice(0, 7)} --all, then stop for the review of the person running the sync.`);
}

function apply(rev) {
  if (targetDirty()) die(`${TGT} has uncommitted changes. Finish or discard them first.`);
  const sha = expectNext(rev ?? pending()[0] ?? die("Nothing pending."));
  const list = changes(sha);
  const subject = out(SRC, ["log", "-1", "--format=%s", sha]);
  if (!list.length) {
    record(sha, "skipped", `excluded paths only: ${subject}`);
    return console.log(`${sha.slice(0, 7)} touches only excluded paths: recorded as skipped.`);
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sync-repo-"));
  const report = { new: [], merged: [], conflicts: [], deleted: [], binary: [] };
  for (const { status, from, file } of list) {
    if (status === "D") {
      fs.rmSync(inTarget(file), { force: true });
      report.deleted.push(file);
      continue;
    }
    const theirs = show(sha, file);
    const base = from ?? file;
    if (isBinary(theirs)) write(file, theirs), report.binary.push(file);
    else if (status === "A" || status === "C" || !fs.existsSync(inTarget(base))) write(file, theirs), report.new.push(file);
    else {
      // 3-way: the mirror's cleaned file takes the source's change from parent to commit.
      fs.writeFileSync(path.join(tmp, "base"), show(`${sha}^1`, base));
      fs.writeFileSync(path.join(tmp, "theirs"), theirs);
      const args = ["merge-file", "-p", "-L", "mirror", "-L", "before", "-L", "source"];
      let merged;
      let conflicts = 0;
      try {
        merged = git(TGT, [...args, inTarget(base), path.join(tmp, "base"), path.join(tmp, "theirs")]);
      } catch (e) {
        if (!(e.status > 0 && e.status < 128)) throw e;
        merged = e.stdout;
        conflicts = e.status;
      }
      write(file, merged);
      (conflicts ? report.conflicts : report.merged).push(file);
    }
    if (status === "R" && from !== file) fs.rmSync(inTarget(from), { force: true });
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`Applied ${sha.slice(0, 7)}: ${subject}`);
  const show_ = (label, files) => files.length && console.log(`${label}:\n${files.map((f) => `    ${f}`).join("\n")}`);
  show_("NEW, clean every comment", report.new);
  show_("MERGED, clean the changed lines (git diff)", report.merged);
  show_("CONFLICTS, resolve (markers <<<<<<< mirror / >>>>>>> source), then clean", report.conflicts);
  show_("Deleted", report.deleted);
  show_("Binary, copied", report.binary);
  console.log(`Then: verify ${sha.slice(0, 7)}, write the message, commit ${sha.slice(0, 7)} <message-file>`);
}

// --- verify -----------------------------------------------------------------

const KINDS = {
  ts: ts.ScriptKind.TS,
  mts: ts.ScriptKind.TS,
  cts: ts.ScriptKind.TS,
  tsx: ts.ScriptKind.TSX,
  js: ts.ScriptKind.JS,
  mjs: ts.ScriptKind.JS,
  cjs: ts.ScriptKind.JS,
  jsx: ts.ScriptKind.JSX,
  json: ts.ScriptKind.JSON,
  webmanifest: ts.ScriptKind.JSON,
};
const STRING_KINDS = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
]);
// Comments that change what tools do: they must survive cleaning untouched.
const DIRECTIVE = /@ts-[a-z-]+|eslint-[a-z-]+[^\n*]*|prettier-ignore|@vite-ignore|[@#]__PURE__|\/\/\/\s*<reference[^>]*>/g;
const JS_DOC_TYPES = /@(type|param|returns?|typedef|template|satisfies)\b[^\n*]*/g;
// Decision and change IDs are the one edit allowed inside strings (test names, demo copy).
const dropIds = (s) =>
  s.replace(/\s*\((?:decisions? )?[CDQ]-\d{3}(?:(?:,| and) [CDQ]-\d{3})*\)|\b[CDQ]-\d{3}\b,?\s*/g, "");

// Splits a file into code (comments and formatting removed), comments and visible strings.
function analyse(text, file) {
  const ext = path.extname(file).slice(1);
  if (KINDS[ext] !== undefined) return analyseScript(text, file, KINDS[ext]);
  const re = /\.(css|html|svg)$/.test(file)
    ? /\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g
    : /\.sql$/.test(file)
      ? /--[^\n]*|\/\*[\s\S]*?\*\//g
      : /\.(ya?ml|sh|example)$|(^|\/)\.[^/]*(ignore|rc)$/.test(file)
        ? /(^|\s)#[^\n]*/g
        : null;
  if (!re) return { code: text, comments: [{ text, pos: 0 }], strings: [] };
  const comments = [...text.matchAll(re)].map((m) => ({ text: m[0], pos: m.index }));
  return { code: text.replace(re, " ").replace(/\s+/g, " ").trim(), comments, strings: [] };
}

function analyseScript(text, file, kind) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, kind);
  const tokens = [];
  const comments = new Map();
  const strings = [];
  const trivia = (n) => {
    for (const r of [...(ts.getLeadingCommentRanges(text, n.pos) ?? []), ...(ts.getTrailingCommentRanges(text, n.pos) ?? [])])
      comments.set(r.pos, { text: text.slice(r.pos, r.end), pos: r.pos });
  };
  const walk = (n) => {
    if (n.kind >= ts.SyntaxKind.FirstJSDocNode && n.kind <= ts.SyntaxKind.LastJSDocNode) return;
    if (n.kind === ts.SyntaxKind.JsxText) {
      const t = n.text.replace(/\s+/g, " ").trim();
      if (t) tokens.push(dropIds(t)), strings.push({ text: t, pos: n.pos });
      return;
    }
    const kids = n.getChildren(sf);
    // `{/* … */}` holds only a comment, so removing it is a comment edit.
    if (n.kind === ts.SyntaxKind.JsxExpression && !n.expression) return kids.forEach(trivia);
    if (kids.length) return kids.forEach(walk);
    trivia(n);
    const isString = STRING_KINDS.has(n.kind);
    tokens.push(isString ? dropIds(n.getText(sf)) : n.getText(sf));
    if (isString) strings.push({ text: n.getText(sf), pos: n.getStart(sf) });
  };
  walk(sf);
  const list = [...comments.values()].sort((a, b) => a.pos - b.pos);
  const directives = list.flatMap((c) => [
    ...c.text.matchAll(DIRECTIVE),
    ...(kind === ts.ScriptKind.JS ? c.text.matchAll(JS_DOC_TYPES) : []),
  ]);
  return { code: [...tokens, "--", ...directives.map((m) => m[0].trim())].join("\n"), comments: list, strings };
}

function hits(patterns, items, file, text) {
  const found = [];
  for (const { text: t, pos } of items)
    for (const re of patterns)
      for (const m of t.matchAll(re)) {
        const line = text.slice(0, pos + m.index).split("\n").length;
        found.push(`${file}:${line}: "${m[0]}" in: ${text.split("\n")[line - 1].trim().slice(0, 140)}`);
      }
  return found;
}

const included = (sha) => zlist(SRC, ["diff-tree", "-r", "-z", "--name-only", "--no-commit-id", EMPTY_TREE, sha, ...SPEC]);

function verify(rev, all) {
  const sha = out(SRC, ["rev-parse", rev]);
  const want = new Set(included(sha));
  const have = new Set(
    zlist(TGT, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]).filter((f) => fs.existsSync(inTarget(f))),
  );
  const problems = [];
  const warnings = [];
  for (const f of want) if (!have.has(f)) problems.push(`missing from the mirror: ${f}`);
  for (const f of have) if (!want.has(f) && !owned(f)) problems.push(`not in the source (or excluded): ${f}`);

  let hasHead = true;
  try {
    git(TGT, ["rev-parse", "--verify", "-q", "HEAD"], { stdio: "ignore" });
  } catch {
    hasHead = false;
  }
  const files =
    all || !hasHead
      ? [...have]
      : [
          ...new Set([
            ...zlist(TGT, ["diff", "-z", "--name-only", "--diff-filter=d", "HEAD"]),
            ...zlist(TGT, ["ls-files", "-z", "--others", "--exclude-standard"]),
          ]),
        ];

  for (const f of files.filter((f) => owned(f) && !isBinary(fs.readFileSync(inTarget(f))))) {
    const text = fs.readFileSync(inTarget(f), "utf8");
    problems.push(...hits(LEAKS, [{ text, pos: 0 }], f, text));
  }
  for (const f of files.filter((f) => want.has(f))) {
    const mine = fs.readFileSync(inTarget(f));
    const src = show(sha, f);
    if (isBinary(src) || isBinary(mine)) {
      if (!src.equals(mine)) problems.push(`binary differs from the source: ${f}`);
      continue;
    }
    const text = mine.toString("utf8");
    if (/^(<{7} mirror|>{7} source)/m.test(text)) problems.push(`conflict markers left: ${f}`);
    const prose = f.endsWith(".md") || config.divergent.includes(f);
    const a = prose ? null : analyse(text, f);
    if (a && a.code !== analyse(src.toString("utf8"), f).code) problems.push(`code differs from the source (only comments may change): ${f}`);
    problems.push(...hits(LEAKS, prose ? [{ text, pos: 0 }] : a.comments, f, text));
    if (a) warnings.push(...hits(STRING_LEAKS, a.strings, f, text));
  }

  for (const w of warnings) console.log(`string (report, do not edit): ${w}`);
  for (const p of problems) console.log(`FAIL ${p}`);
  console.log(`${files.length} files checked against ${sha.slice(0, 7)}: ${problems.length ? `${problems.length} problems` : "ok"}`);
  return problems.length === 0;
}

function commit(rev, msgFile) {
  if (!rev || !msgFile) die("usage: commit <sha> <message-file>");
  const snapshot = !lastSynced();
  // The first commit waits for the person running the sync to review the cleaned files themselves.
  if (snapshot && !process.argv.includes("--reviewed"))
    die("First commit: stop here. The person running the sync reviews the mirror's files; pass --reviewed only after they say to commit.");
  const sha = snapshot ? out(SRC, ["rev-parse", rev]) : expectNext(rev);
  const msg = fs.readFileSync(msgFile, "utf8").trim();
  const msgLeaks = hits(LEAKS, [{ text: msg, pos: 0 }], "message", msg);
  if (!msg || msgLeaks.length || /co-authored-by|generated with|claude-session/i.test(msg))
    die(`Message refused:\n${msgLeaks.join("\n") || "empty or carries a trailer"}`);
  if (!verify(sha, snapshot)) die("verify failed: nothing committed.");
  git(TGT, ["add", "-A"]);
  if (!out(TGT, ["diff", "--cached", "--name-only"])) {
    record(sha, "skipped", `no change after cleaning: ${msg.split("\n")[0]}`);
    return console.log("Nothing to commit after cleaning: recorded as skipped.");
  }
  // The source commit's dates always carry over; its author and committer names too, unless --as-me
  // (then the mirror's own git identity, the person running the sync, takes both).
  const [an, ae, ad, cn, ce, cd] = out(SRC, ["log", "-1", "--format=%an%x00%ae%x00%aI%x00%cn%x00%ce%x00%cI", sha]).split("\0");
  const asMe = process.argv.includes("--as-me");
  const names = asMe
    ? {}
    : { GIT_AUTHOR_NAME: an, GIT_AUTHOR_EMAIL: ae, GIT_COMMITTER_NAME: cn, GIT_COMMITTER_EMAIL: ce };
  git(TGT, ["commit", "-q", "--cleanup=strip", "-F", msgFile], {
    env: { ...process.env, ...names, GIT_AUTHOR_DATE: ad, GIT_COMMITTER_DATE: cd },
  });
  const made = out(TGT, ["rev-parse", "--short", "HEAD"]);
  record(sha, made, msg.split("\n")[0]);
  console.log(`Committed ${made} (from ${sha.slice(0, 7)}): ${out(TGT, ["log", "-1", "--format=author %an <%ae> %aI, committer %cn <%ce> %cI"])}. Not pushed.`);
}

const [cmd, a, b] = process.argv.slice(2);
// Pages the given commits touch, for compare.mjs: "all", "none" or a comma list.
function pages(shas) {
  if (!config.compare) return console.log("none"); // a project without a web app compares nothing
  const { pages: every, map, none } = config.compare;
  const found = new Set();
  for (const file of shas.flatMap((sha) => changes(out(SRC, ["rev-parse", sha])).map((c) => c.file))) {
    if (none.some((p) => file.endsWith(p) || file.startsWith(p) || path.basename(file).startsWith(p))) continue;
    const prefix = Object.keys(map)
      .filter((p) => file.startsWith(p))
      .sort((x, y) => y.length - x.length)[0];
    if (!prefix) return console.log("all"); // shared code, or a path the map doesn't know
    map[prefix].forEach((p) => found.add(p));
  }
  console.log(found.size ? [...found].filter((p) => every.includes(p)).join(",") : "none");
}

const commands = {
  status,
  init: () => init(a ?? REF),
  apply: () => apply(a),
  verify: () => process.exit(verify(a ?? die("usage: verify <sha> [--all]"), process.argv.includes("--all")) ? 0 : 1),
  commit: () => commit(a, b),
  pages: () => pages(process.argv.slice(3)),
};
(commands[cmd] ?? (() => die("usage: sync.mjs status | init [rev] | apply [sha] | verify <sha> [--all] | commit <sha> <message-file> [--reviewed] [--as-me] | pages <sha…>")))();
