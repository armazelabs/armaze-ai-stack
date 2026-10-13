// Tests for the module-docs engine and scripts.
//
//   node --test skills/module-docs/tests/
//
// Nothing here touches a real project: the engine is imported straight from
// the templates, and everything that needs files builds a throwaway git
// repository (and a bare remote, for publishing) in a temporary folder.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { engineDrift } from "../scripts/check.mjs";
import { isOurHook, withDocsHooks } from "../scripts/setup.mjs";
import {
  DEFAULT_CONFIG,
  areaKey,
  classify,
  expandBraces,
  groupOf,
  matchesGlob,
  slugify,
  specificity,
  toRepoRelative,
} from "../templates/module-docs/engine/config.mjs";
import { backfill, fit, sessionEvidence } from "../templates/module-docs/engine/evidence.mjs";
import { parseLog, parseReflog } from "../templates/module-docs/engine/git.mjs";
import { sessionStartOutput, standingInstruction, stopOutput } from "../templates/module-docs/engine/hook.mjs";
import { readLog, resolvedThrough } from "../templates/module-docs/engine/log.mjs";
import { identityTokens, lintText, parseBody, parseEntry, parseFrontMatter, parseOverview } from "../templates/module-docs/engine/pages.mjs";
import { PublishError, publish } from "../templates/module-docs/engine/publish.mjs";
import { adoptable, bullet, comingNext, parseFeature, parseRegister, readRequirements, stripIds } from "../templates/module-docs/engine/requirements.mjs";
import { pendingWork } from "../templates/module-docs/engine/scan.mjs";
import { chosenLabels, decisionsOf, isDeferAnswer, isSkipAnswer, listSessions, promptOf, readSession } from "../templates/module-docs/engine/transcripts.mjs";

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SETUP = path.join(SKILL_DIR, "scripts", "setup.mjs");
const BASE = Date.parse("2026-10-12T09:00:00Z");

// --- helpers -----------------------------------------------------------------

function tempDir(name) {
  return realpathSync(mkdtempSync(path.join(tmpdir(), `module-docs-${name}-`)));
}

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } }).trim();
}

function repo(name = "repo") {
  const root = tempDir(name);
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Test Person");
  git(root, "config", "user.email", "test.person@example.com");
  git(root, "config", "commit.gpgsign", "false");
  return root;
}

function write(root, rel, content) {
  const file = path.join(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
  return file;
}

function commitAll(root, message, env = {}) {
  git(root, "add", "-A");
  execFileSync("git", ["commit", "-q", "-m", message], { cwd: root, env: { ...process.env, ...env } });
  return git(root, "rev-parse", "--short", "HEAD");
}

function config(overrides = {}) {
  return {
    ...DEFAULT_CONFIG,
    installed: new Date(BASE - 60 * 60 * 1000).toISOString(),
    timeZone: "UTC",
    modules: [
      { id: "profiles", name: "Profiles", description: "", paths: ["app/profile/**", "components/profile-*"] },
      { id: "friends", name: "Friends", description: "", paths: ["lib/social/**"] },
      { id: "teams", name: "Teams", description: "", paths: [] },
    ],
    excluded: [{ area: "Staging gate", paths: ["proxy*", "app/login/**"], decided: "2026-10-12" }],
    ...overrides,
  };
}

/** A transcript builder: each call appends a JSONL record a minute after the last. */
function transcript(root, sessionId) {
  const lines = [];
  let at = BASE;
  const stamp = () => new Date((at += 60_000)).toISOString();
  let id = 0;
  const api = {
    lines,
    prompt(text, origin = { kind: "human" }) {
      lines.push({ type: "user", sessionId, timestamp: stamp(), origin, message: { role: "user", content: text } });
      return api;
    },
    raw(entry) {
      lines.push(entry);
      return api;
    },
    title(text) {
      lines.push({ type: "ai-title", aiTitle: text, sessionId });
      return api;
    },
    say(text) {
      lines.push({ type: "assistant", sessionId, timestamp: stamp(), message: { role: "assistant", content: [{ type: "text", text }] } });
      return api;
    },
    tool(name, input, result = {}, { error = false } = {}) {
      const use = `t${(id += 1)}`;
      lines.push({ type: "assistant", sessionId, timestamp: stamp(), message: { role: "assistant", content: [{ type: "tool_use", id: use, name, input }] } });
      lines.push({ type: "user", sessionId, timestamp: stamp(), message: { role: "user", content: [{ type: "tool_result", tool_use_id: use, content: "x", ...(error ? { is_error: true } : {}) }] }, toolUseResult: result });
      return api;
    },
    edit(rel, options) {
      return api.tool("Edit", { file_path: path.join(root, rel), old_string: "a", new_string: "b" }, {}, options);
    },
    ask(questions, answers) {
      return api.tool("AskUserQuestion", { questions }, { questions, answers, annotations: {} });
    },
    get time() {
      return at;
    },
    save(subagents = {}) {
      const dir = path.join(root, ".claude-local", "projects", root.replaceAll("/", "-").replaceAll(".", "-"));
      mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${sessionId}.jsonl`);
      writeFileSync(file, `${lines.map((line) => (typeof line === "string" ? line : JSON.stringify(line))).join("\n")}\n`);
      for (const [name, sub] of Object.entries(subagents)) {
        const subDir = path.join(dir, sessionId, "subagents");
        mkdirSync(subDir, { recursive: true });
        writeFileSync(path.join(subDir, `${name}.jsonl`), `${sub.map((line) => JSON.stringify(line)).join("\n")}\n`);
      }
      return file;
    },
  };
  return api;
}

const DOCS = "project-management/module-docs";

function overview(fields = {}, sections = {}) {
  const meta = { module: "profiles", name: '"Profiles"', status: "in-progress", updated: "2026-10-12", ...fields };
  const body = {
    "What it is": "Each person's public page.",
    "What's built now": "The header shows a banner (`app/profile/page.tsx`).",
    "Open follow-ups": "- Banner images have no size limit yet.",
    ...sections,
  };
  return `---\n${Object.entries(meta).map(([key, value]) => `${key}: ${value}`).join("\n")}\n---\n\n${Object.entries(body).map(([heading, text]) => `## ${heading}\n\n${text}\n`).join("\n")}`;
}

function entry({ date = "2026-10-12", title = "A banner can be uploaded", kind = "work", sessions = "[]", commits = "[]", body = null } = {}) {
  const sections = body ?? {
    "What changed": "The profile header gained a banner upload (`app/profile/page.tsx`).",
    "Why and the plan": "People wanted to personalise their page.",
    "Decisions made": "- The crop happens in the browser, not on the server.",
    "Open follow-ups": "None.",
  };
  return `---\ndate: ${date}\ntitle: "${title}"\nkind: ${kind}\nsessions: ${sessions}\ncommits: ${commits}\nrefs: []\n---\n\n${Object.entries(sections).map(([heading, text]) => `## ${heading}\n\n${text}\n`).join("\n")}`;
}

// --- config -------------------------------------------------------------------

test("globs: ** crosses folders, * and ? do not, braces expand", () => {
  assert.ok(matchesGlob("app/profile/**", "app/profile/page.tsx"));
  assert.ok(matchesGlob("app/profile/**", "app/profile/edit/form.tsx"));
  assert.ok(!matchesGlob("app/profile/**", "app/profiles/page.tsx"));
  assert.ok(matchesGlob("components/profile-*", "components/profile-card.tsx"));
  assert.ok(!matchesGlob("components/profile-*", "components/sub/profile-card.tsx"));
  assert.ok(matchesGlob("**/*.css", "styles/profile.css"));
  assert.ok(matchesGlob("**/*.css", "a.css"));
  assert.ok(matchesGlob("styles/{lobby,game}.css", "styles/game.css"));
  assert.ok(!matchesGlob("styles/{lobby,game}.css", "styles/stream.css"));
  assert.ok(matchesGlob("app/(auth)/**", "app/(auth)/sign-in/page.tsx"));
  assert.ok(matchesGlob("proxy?ts", "proxy.ts"));
  assert.deepEqual(expandBraces("a/{b,c}/{d,e}"), ["a/b/d", "a/b/e", "a/c/d", "a/c/e"]);
  assert.ok(specificity("app/profile/edit/**") > specificity("app/profile/**"));
  assert.ok(specificity("app/profile/**") > specificity("app/**"));
});

test("classify: ignored first, then the most specific of excluded and module, a module winning a tie", () => {
  const settings = config({
    excluded: [{ area: "Profile admin", paths: ["app/profile/admin/**"] }, { area: "Tie", paths: ["lib/social/**"] }],
  });
  assert.deepEqual(classify(".claude/settings.json", settings), { kind: "ignored" });
  assert.deepEqual(classify("project-management/tracking/x.md", settings), { kind: "ignored" });
  assert.equal(classify("app/profile/page.tsx", settings).id, "profiles");
  assert.equal(classify("app/profile/admin/page.tsx", settings).kind, "excluded");
  assert.equal(classify("lib/social/friends.ts", settings).id, "friends");
  const loose = classify("app/events/page.tsx", settings);
  assert.equal(loose.kind, "unassigned");
  assert.equal(loose.key, "app/events");
  assert.equal(groupOf("app/events/page.tsx", settings), "area:app/events");
  assert.equal(groupOf("README.md", settings), "area:README.md");
  assert.equal(groupOf(".claude/x", settings), null);
});

test("areaKey: one area per folder under a container, per name prefix for loose files", () => {
  assert.deepEqual(areaKey("app/events/page.tsx"), { key: "app/events", label: "app/events/", globs: ["app/events/**"] });
  assert.equal(areaKey("src/app/lobby/lobby-page.tsx").key, "src/app/lobby");
  assert.equal(areaKey("src/lib/auth/gate.ts").key, "src/lib/auth");
  assert.deepEqual(areaKey("components/event-card.tsx"), { key: "components/event", label: "components/event*", globs: ["components/event*"] });
  assert.equal(areaKey("app/home-hero.tsx").key, "app/home");
  assert.equal(areaKey("styles/forum.css").key, "styles/forum");
  assert.deepEqual(areaKey("rules/no-feature-branches.md"), { key: "rules", label: "rules/", globs: ["rules/**"] });
  assert.deepEqual(areaKey("proxy.ts"), { key: "proxy.ts", label: "proxy.ts", globs: ["proxy.ts"] });
});

test("slugify and toRepoRelative", () => {
  assert.equal(slugify("Admin panel"), "admin-panel");
  assert.equal(slugify("Café & Forums!"), "cafe-forums");
  assert.equal(toRepoRelative("/repo/app/x.ts", "/repo"), "app/x.ts");
  assert.equal(toRepoRelative("/elsewhere/x.ts", "/repo"), null);
  assert.equal(toRepoRelative("/repo", "/repo"), null);
});

// --- transcripts ---------------------------------------------------------------

test("readSession: prompts, edits, asks, plans, title and summaries; failures and noise left out", () => {
  const root = repo("transcript");
  const t = transcript(root, "11111111-aaaa");
  t.prompt("Add a banner upload")
    .raw({ type: "user", isMeta: true, message: { content: "Base directory for this skill" } })
    .prompt("<command-name>/model</command-name><command-args></command-args>", undefined)
    .prompt("<command-name>/grill-me</command-name><command-args>the banner</command-args>", undefined)
    .prompt("<task-notification><task-id>x</task-id></task-notification>", { kind: "task-notification" })
    .title("First title")
    .title("Profile banner upload")
    .tool("ExitPlanMode", { plan: "# Plan\n\nUpload button.\n\n\n\nCrop 3:1." }, { plan: "# Plan", filePath: "/x" })
    .tool("ExitPlanMode", { plan: "Rejected plan" }, "Error: The user doesn't want to proceed", { error: true })
    .ask(
      [
        { question: "Where does the crop happen?", header: "Crop", multiSelect: false, options: [{ label: "In the browser (Recommended)", description: "" }, { label: "On the server", description: "" }] },
        { question: "Which sizes?", header: "Sizes", multiSelect: true, options: [{ label: "Small", description: "" }, { label: "Large", description: "" }, { label: "Huge", description: "" }] },
        { question: "Name it?", header: "Name", multiSelect: false, options: [{ label: "Banner", description: "" }, { label: "Cover", description: "" }] },
      ],
      { "Where does the crop happen?": "In the browser (Recommended)", "Which sizes?": "Small, Large", "Name it?": "Header image" },
    )
    .edit("app/profile/page.tsx")
    .edit("lib/social/friends.ts", { error: true })
    .tool("Write", { file_path: "/somewhere/else/x.ts", content: "" })
    .tool("Read", { file_path: path.join(root, "project-management/requirements/x.md") })
    .say("Added the banner upload.");
  t.raw("{not json");
  const file = t.save({
    "agent-1": [{ type: "assistant", timestamp: new Date(BASE + 5_000_000).toISOString(), message: { content: [{ type: "tool_use", id: "s1", name: "Write", input: { file_path: path.join(root, "components/profile-card.tsx") } }] } }],
  });

  const session = readSession(file, { repoRoot: root, subagents: listSessions(root)[0].subagents });
  assert.equal(session.title, "Profile banner upload");
  assert.deepEqual(session.prompts.map((prompt) => prompt.text), ["Add a banner upload", "/grill-me the banner"]);
  assert.deepEqual(session.edits.map((edit) => edit.path), ["app/profile/page.tsx", "components/profile-card.tsx"]);
  assert.deepEqual(session.reads, ["project-management/requirements/x.md"]);
  assert.equal(session.plans.length, 2);
  assert.equal(session.plans[0].approved, true);
  assert.equal(session.plans[0].text, "# Plan\n\nUpload button.\n\nCrop 3:1.");
  assert.equal(session.plans[1].approved, false);
  assert.deepEqual(session.summaries.map((summary) => summary.text), ["Added the banner upload."]);

  const [crop, sizes, name] = decisionsOf(session.asks[0]);
  assert.deepEqual(crop.options.map((option) => option.chosen), [true, false]);
  assert.deepEqual(chosenLabels({ ...session.asks[0].questions[1] }), ["Small", "Large"]);
  assert.deepEqual(sizes.options.map((option) => option.chosen), [true, true, false]);
  assert.equal(name.typed, "Header image");

  const light = readSession(file, { repoRoot: root, light: true });
  assert.deepEqual(light.prompts, []);
  assert.deepEqual(light.plans, []);
  assert.equal(light.firstPrompt, "Add a banner upload");
  assert.deepEqual(light.edits.map((edit) => edit.path), ["app/profile/page.tsx"]);
  assert.equal(light.asks.length, 1);
  rmSync(root, { recursive: true, force: true });
});

test("promptOf and the answer classes", () => {
  assert.equal(promptOf({ type: "user", origin: { kind: "human" }, message: { content: "hi" } }), "hi");
  assert.equal(promptOf({ type: "user", isMeta: true, message: { content: "hi" } }), null);
  assert.equal(promptOf({ type: "user", message: { content: [{ type: "tool_result" }] } }), null);
  assert.equal(promptOf({ type: "user", message: { content: "<local-command-stdout>x</local-command-stdout>" } }), null);
  assert.ok(isSkipAnswer("Don't document"));
  assert.ok(isSkipAnswer("Dont document any"));
  assert.ok(!isSkipAnswer("Yes, under Profiles"));
  assert.ok(isDeferAnswer("Not now"));
  assert.ok(!isDeferAnswer("Yes, all"));
  const own = decisionsOf({ questions: [{ question: "Document this?", header: "Document", options: [], answer: "Yes", multiSelect: false }] });
  assert.deepEqual(own, []);
});

// --- git ------------------------------------------------------------------------

test("parseReflog keeps commits made here, once per amend chain, with their files", () => {
  const R = "\x1e";
  const F = "\x1f";
  const D = "\x1d";
  const text = [
    `${R}aaa111${F}aaa${F}200${F}commit (amend): Fix it${F}Fix it${F}body${D}\napp/x.ts\n`,
    `${R}bbb222${F}bbb${F}200${F}commit: Fix it${F}Fix it${F}${D}\napp/x.ts\n`,
    `${R}ccc333${F}ccc${F}100${F}pull: Fast-forward${F}Their work${F}${D}\nlib/y.ts\n`,
    `${R}ddd444${F}ddd${F}50${F}commit (initial): Start${F}Start${F}${D}\nREADME.md\nlib/z.ts\n`,
  ].join("");
  const commits = parseReflog(text);
  assert.deepEqual(commits.map((commit) => commit.sha), ["aaa", "ddd"]);
  assert.deepEqual(commits[0].files, ["app/x.ts"]);
  assert.equal(commits[0].body, "body");
  assert.deepEqual(commits[1].files, ["README.md", "lib/z.ts"]);
  const log = parseLog(`${R}eee555${F}eee${F}300${F}Subject${F}Line one\nline two${D}\n\na.ts\nb.ts\n`);
  assert.deepEqual(log[0].files, ["a.ts", "b.ts"]);
  assert.equal(log[0].body, "Line one\nline two");
});

// --- pages ----------------------------------------------------------------------

test("front matter: words, dates, quoted strings and inline lists", () => {
  const { data, body, problems } = parseFrontMatter('---\nmodule: profiles\ntitle: "A \\"quoted\\" title"\nsessions: [abc, "d e"]\nempty: []\n---\n\n## X\n');
  assert.deepEqual(problems, []);
  assert.equal(data.module, "profiles");
  assert.equal(data.title, 'A "quoted" title');
  assert.deepEqual(data.sessions, ["abc", "d e"]);
  assert.deepEqual(data.empty, []);
  assert.equal(body, "\n## X\n");
  assert.match(parseFrontMatter("no front matter").problems[0], /front matter/);
});

test("the body subset: paragraphs, one-level lists with continuations; everything else is a problem", () => {
  const { sections, problems } = parseBody("## A\n\nOne line\ncontinues.\n\n- item one\n  continues\n- item two\n\n## B\n");
  assert.deepEqual(problems, []);
  assert.deepEqual(sections[0].blocks, [
    { type: "paragraph", text: "One line continues." },
    { type: "list", items: ["item one continues", "item two"] },
  ]);
  assert.deepEqual(sections[1].blocks, []);
  const bad = parseBody("Before\n## A\n### Deep\n| a | b |\n<div>x</div>\n1. one\n  - nested\n* star\n> quote\n![img](x.png)\n```\n").problems.join("\n");
  for (const problem of ["text before", "only ##", "tables", "HTML", "numbered", "nested", 'start with "- "', "quotes", "images", "code blocks"]) {
    assert.match(bad, new RegExp(problem.replace(/[()]/g, "\\$&")));
  }
  assert.deepEqual(parseBody("## A\n\nUse `<Button>` here.\n").problems, []);
});

test("overview and entry contracts", () => {
  assert.deepEqual(parseOverview(overview()).problems, []);
  assert.match(parseOverview(overview({ status: "done" })).problems.join(), /status/);
  const swapped = overview({}, { "What it is": "x" }).replace("## What's built now", "## Built");
  assert.match(parseOverview(swapped).problems.join(), /sections must be/);
  assert.deepEqual(parseEntry(entry(), "2026-10-12-banner.md").problems, []);
  assert.match(parseEntry(entry(), "2026-10-11-banner.md").problems.join(), /file name/);
  const backfillEntry = entry({ kind: "backfill", body: { "What changed": "The page was added." } });
  assert.deepEqual(parseEntry(backfillEntry, "2026-10-12-x.md").problems, []);
  const workMissing = entry({ body: { "What changed": "x" } });
  assert.match(parseEntry(workMissing, "2026-10-12-x.md").problems.join(), /sections must be/);
});

test("lint: identities, IDs, paths, em dashes and placeholders are errors; tools, hours and money warn", () => {
  const tokens = identityTokens({
    identities: [
      { kind: "name", value: "Hamna Amir" },
      { kind: "email", value: "rahim.khel21@example.com" },
      { kind: "name", value: "Will Page" },
    ],
    user: { name: "Test Person", email: "test.person@example.com" },
    computers: ["studio-3f9a"],
  });
  assert.ok(tokens.exact.includes("hamna amir"));
  assert.ok(tokens.parts.includes("Hamna"));
  assert.ok(!tokens.parts.includes("Page"), "everyday words are never matched alone");
  const lint = (sections) => lintText(overview({}, sections), { kind: "overview", tokens });
  assert.deepEqual(lint({}).errors, []);
  assert.match(lint({ "What it is": "Hamna built it." }).errors.join(), /names a person/);
  assert.match(lint({ "What it is": "By hamna amir." }).errors.join(), /names a person/);
  assert.match(lint({ "What it is": "Ask rahim.khel21@example.com." }).errors.join(), /names a person/);
  assert.match(lint({ "What it is": "Made on studio-3f9a." }).errors.join(), /names a person/);
  assert.deepEqual(lint({ "What it is": "The page lets a person upload. Will it work?" }).errors, []);
  assert.match(lint({ "What it is": "Delivers R-012." }).errors.join(), /internal ID/);
  assert.match(lint({ "What it is": "See project-management/requirements/x.md." }).errors.join(), /project-management/);
  assert.match(lint({ "What it is": "A \u2014 B." }).errors.join(), /em dash/);
  assert.match(lint({ "What it is": "{{name}}" }).errors.join(), /placeholder/);
  const warned = lint({ "What it is": "Planned with Claude in 3h for $40." }).warnings.join("\n");
  assert.match(warned, /Claude/);
  const hours = lint({ "What it is": "It took 3h." }).warnings.join();
  assert.match(hours, /duration/);
  assert.match(lint({ "What it is": "Within budget." }).warnings.join(), /money/);
  assert.match(lint({ "What it is": "An AI feature." }).warnings.join(), /AI/);
});

// --- requirements -----------------------------------------------------------------

test("requirements: IDs stripped, template lines ignored, columns found by name", () => {
  assert.equal(stripIds("R-014 - Banner upload (D-002, D-003)"), "Banner upload");
  assert.equal(stripIds("See [the PRD](features/x.md) and S-001."), "See the PRD and.");
  assert.equal(bullet("- **Status:** draft | client-approved | built", "Status"), null);
  assert.equal(bullet("- **Status:** client-approved", "Status"), "client-approved");
  const feature = parseFeature("# Banner upload\n\n- **Status:** client-approved\n\n## Problem\n\n_Guidance._\n\nPeople cannot personalise their page. More.\n", "profiles");
  assert.equal(feature.summary, "People cannot personalise their page.");
  assert.equal(parseFeature("# T\n- **Summary:** One line (R-001).\n", "x").summary, "One line.");
  const rows = parseRegister("text\n\n| Status | Ask | ID | Type | Module |\n| -- | -- | -- | -- | -- |\n| building | Fix the crop | R-002 | small | Profiles |\n");
  assert.deepEqual(rows, [{ status: "building", ask: "Fix the crop", id: "R-002", type: "small", module: "Profiles" }]);
});

test("requirements on disk: coming next, adoption and near-duplicates", () => {
  const root = repo("requirements");
  write(root, "project-management/requirements/modules/profiles/overview.md", "# Profiles - overview\n");
  write(root, "project-management/requirements/modules/profiles/features/banner.md", "# Banner upload\n\n- **Status:** client-approved\n- **Summary:** A banner on every profile.\n");
  write(root, "project-management/requirements/modules/profiles/features/old.md", "# Old\n\n- **Status:** built\n");
  write(root, "project-management/requirements/modules/leaderboards/overview.md", "# Leaderboards - overview\n");
  write(root, "project-management/requirements/modules/friend/overview.md", "# Friend - overview\n");
  write(root, "project-management/requirements/register.md", "| ID | Module | Ask | Type | Status |\n| -- | -- | -- | -- | -- |\n| R-003 | Profiles | Fix crop (D-001) | small | building |\n| R-004 | Profiles | Huge thing | feature | draft |\n");
  write(root, "project-management/requirements/decisions/d-001.md", "# D-001 - Crop in the browser\n\n- **Status:** settled\n- **Module:** Profiles\n");
  const settings = config({ requirements: { dir: "project-management/requirements", comingNext: ["client-approved", "building"] } });
  const found = readRequirements(settings, root);
  assert.deepEqual(comingNext(found, "profiles", settings.requirements.comingNext), [
    { title: "Banner upload", summary: "A banner on every profile.", status: "client-approved" },
    { title: "Fix crop", summary: null, status: "building" },
  ]);
  assert.equal(found.decisions[0].title, "Crop in the browser");
  assert.equal(found.decisions[0].module, "profiles");
  const adopt = adoptable(settings, root);
  assert.deepEqual(adopt.adopt.map((module) => module.slug), ["leaderboards"]);
  assert.deepEqual(adopt.similar, [{ slug: "friend", like: "friends" }]);
  rmSync(root, { recursive: true, force: true });
});

// --- scan, log and hooks ------------------------------------------------------------

function scanFixture() {
  const root = repo("scan");
  write(root, "app/profile/page.tsx", "1");
  write(root, "lib/social/friends.ts", "1");
  // Before the install, so it is history rather than pending work.
  commitAll(root, "Start", { GIT_AUTHOR_DATE: "2026-10-01T09:00:00Z", GIT_COMMITTER_DATE: "2026-10-01T09:00:00Z" });
  const settings = config();
  const docs = path.join(root, DOCS);
  mkdirSync(path.join(docs, "modules"), { recursive: true });
  writeFileSync(path.join(docs, "config.json"), JSON.stringify(settings));
  return { root, settings, modulesDir: path.join(docs, "modules"), indexPath: path.join(docs, "local", "scan-index.json"), logPath: path.join(docs, "local", "log.jsonl") };
}

test("scan: pending session work per group, resolved by log, entries and skip answers - never by Not now", () => {
  const { root, settings, modulesDir, indexPath, logPath } = scanFixture();
  const scan = (extra = {}) => pendingWork({ config: settings, repoRoot: root, modulesDir, indexPath, ...extra });

  transcript(root, "aaaaaaaa-1").prompt("Profile work").title("Profile work").edit("app/profile/page.tsx").edit("app/events/page.tsx").edit(".claude/settings.json").edit("proxy.ts").save();
  const first = scan();
  assert.deepEqual(first.items.map((item) => item.id).sort(), ["s-aaaaaaaa-area-app-events", "s-aaaaaaaa-profiles"]);
  assert.equal(first.areas.length, 1);
  assert.equal(first.areas[0].key, "app/events");
  assert.equal(scan({ excludeSession: "aaaaaaaa-1" }).items.length, 0);

  // A log record resolves its group up to `through`.
  mkdirSync(path.dirname(logPath), { recursive: true });
  writeFileSync(logPath, `${JSON.stringify({ kind: "documented", session: "aaaaaaaa-1", group: "profiles", through: new Date(BASE + 3_600_000).toISOString() })}\n`);
  assert.deepEqual(scan().items.map((item) => item.id), ["s-aaaaaaaa-area-app-events"]);
  assert.equal(resolvedThrough(readLog(logPath), "aaaaaaaa-1", "profiles"), BASE + 3_600_000);

  // A committed entry listing the session resolves the group whole.
  transcript(root, "bbbbbbbb-2").prompt("Friends").edit("lib/social/friends.ts").save();
  assert.ok(scan().items.some((item) => item.id === "s-bbbbbbbb-friends"));
  write(root, `${DOCS}/modules/friends/history/2026-10-12-x.md`, entry({ sessions: "[bbbbbbbb]" }));
  assert.ok(!scan().items.some((item) => item.id === "s-bbbbbbbb-friends"));

  // "Don't document" in the transcript resolves; "Not now" does not.
  const docAsk = (answer) => [[{ question: "Document this under Profiles? x", header: "Document", multiSelect: false, options: [] }], { "Document this under Profiles? x": answer }];
  transcript(root, "cccccccc-3").edit("app/profile/page.tsx").ask(...docAsk("Not now")).save();
  assert.ok(scan().items.some((item) => item.id === "s-cccccccc-profiles"));
  transcript(root, "dddddddd-4").edit("app/profile/page.tsx").ask(...docAsk("Don't document")).save();
  assert.ok(!scan().items.some((item) => item.id === "s-dddddddd-profiles"));
  rmSync(root, { recursive: true, force: true });
});

test("scan: commits made here with no session behind them become commit items", () => {
  const { root, settings, modulesDir, indexPath } = scanFixture();
  write(root, "lib/social/friends.ts", "2");
  const sha = commitAll(root, "Tweak friends outside Claude");
  const { items } = pendingWork({ config: { ...settings, installed: new Date(Date.now() - 60_000).toISOString() }, repoRoot: root, modulesDir, indexPath });
  const item = items.find((candidate) => candidate.kind === "commits");
  assert.ok(item, "a commit item");
  assert.equal(item.group, "friends");
  assert.deepEqual(item.commits, [sha]);
  rmSync(root, { recursive: true, force: true });
});

test("stop hook: silent when continuing, planning, asking, deferred or nothing new; otherwise a nudge", () => {
  const { root, settings, modulesDir } = scanFixture();
  const file = transcript(root, "eeeeeeee-5").prompt("Work").edit("app/profile/page.tsx").edit("app/events/page.tsx").save();
  const stop = (input, records = []) => stopOutput({ session_id: "eeeeeeee-5", transcript_path: file, ...input }, { config: settings, repoRoot: root, modulesDir, records });

  const nudge = stop({ last_assistant_message: "Done." });
  assert.equal(nudge.hookSpecificOutput.hookEventName, "Stop");
  assert.match(nudge.hookSpecificOutput.additionalContext, /Profiles: app\/profile\/page\.tsx/);
  assert.match(nudge.hookSpecificOutput.additionalContext, /app\/events.*New area/);
  assert.equal(stop({ stop_hook_active: true }), null);
  assert.equal(stop({ permission_mode: "plan" }), null);
  assert.equal(stop({ last_assistant_message: "Which colour?" }), null);
  const everything = [
    { kind: "documented", session: "eeeeeeee-5", group: "profiles", through: new Date(BASE + 9e9).toISOString() },
    { kind: "skipped", session: "eeeeeeee-5", group: "area:app/events", through: new Date(BASE + 9e9).toISOString() },
  ];
  assert.equal(stop({}, everything), null);

  const asked = transcript(root, "ffffffff-6").edit("app/profile/page.tsx");
  asked.ask([{ question: "Document this under Profiles? x", header: "Document", multiSelect: false, options: [] }], { "Document this under Profiles? x": "Yes, under Profiles" });
  const askedFile = asked.save();
  assert.equal(stopOutput({ transcript_path: askedFile, session_id: "ffffffff-6" }, { config: settings, repoRoot: root, modulesDir, records: [] }), null, "nothing changed since the ask");

  const deferred = transcript(root, "99999999-7").edit("app/profile/page.tsx");
  deferred.ask([{ question: "Document this under Profiles? x", header: "Document", multiSelect: false, options: [] }], { "Document this under Profiles? x": "Not now" });
  deferred.edit("lib/social/friends.ts");
  assert.equal(stopOutput({ transcript_path: deferred.save(), session_id: "99999999-7" }, { config: settings, repoRoot: root, modulesDir, records: [] }), null, "quiet after Not now");
  rmSync(root, { recursive: true, force: true });
});

test("session-start hook: always the instruction; a catch-up list and a one-line message only when work is pending", () => {
  const item = { id: "s-aaaaaaaa-profiles", kind: "session", day: "2026-10-12", module: "profiles", name: "Profiles", title: "Banner", files: ["a"], lastAt: 1 };
  const scan = (pending) => () => ({ items: pending, areas: [], adopt: [], unpublished: [] });
  const busy = sessionStartOutput({ source: "startup", session_id: "x1" }, { config: config(), scan: scan([item]) });
  assert.equal(busy.hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(busy.hookSpecificOutput.additionalContext, /This session is x1/);
  assert.match(busy.hookSpecificOutput.additionalContext, /Catch-up/);
  assert.match(busy.hookSpecificOutput.additionalContext, /s-aaaaaaaa-profiles/);
  assert.match(busy.systemMessage, /1 earlier piece/);
  const quiet = sessionStartOutput({ source: "startup" }, { config: config(), scan: scan([]) });
  assert.equal(quiet.systemMessage, undefined);
  let scanned = false;
  const compact = sessionStartOutput({ source: "compact" }, { config: config(), scan: () => ((scanned = true), null) });
  assert.equal(scanned, false);
  assert.equal(compact.hookSpecificOutput.additionalContext, standingInstruction(null));
});

// --- evidence -------------------------------------------------------------------------

test("session evidence: the group's files, the decisions with what was dropped, and commits from the session", () => {
  const { root, settings } = scanFixture();
  const t = transcript(root, "12345678-9")
    .prompt("Banner")
    .ask([{ question: "Crop where?", header: "Crop", multiSelect: false, options: [{ label: "Browser", description: "" }, { label: "Server", description: "" }] }], { "Crop where?": "Browser" })
    .edit("app/profile/page.tsx")
    .edit("lib/social/friends.ts");
  const file = t.save();
  const evidence = sessionEvidence({ config: settings, session: { file, subagents: [] }, group: "profiles", repoRoot: root });
  assert.deepEqual(evidence.files.map((item) => item.path), ["app/profile/page.tsx"]);
  assert.deepEqual(evidence.otherGroups, ["friends"]);
  assert.deepEqual(evidence.questions[0].options, [{ label: "Browser", description: "", chosen: true }, { label: "Server", description: "", chosen: false }]);
  assert.equal(evidence.module.name, "Profiles");
  const big = fit({ summaries: Array.from({ length: 400 }, () => "x".repeat(500)), prompts: [], plans: [], questions: [], commits: [], files: [] });
  assert.ok(Buffer.byteLength(JSON.stringify(big)) <= 30 * 1024);
  rmSync(root, { recursive: true, force: true });
});

test("backfill: one group per module per day, in the project's time zone; merges skipped; areas listed once", () => {
  const root = repo("backfill");
  const at = (iso) => ({ GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso });
  write(root, "app/profile/page.tsx", "1");
  write(root, "app/events/page.tsx", "1");
  commitAll(root, "Profile and events", at("2026-10-01T20:30:00Z"));
  write(root, "app/profile/page.tsx", "2");
  execFileSync("git", ["-c", "user.name=Other Author", "-c", "user.email=other@example.com", "commit", "-qam", "Profile tweak"], { cwd: root, env: { ...process.env, ...at("2026-10-01T21:30:00Z") } });
  git(root, "checkout", "-q", "-b", "side");
  write(root, "lib/social/friends.ts", "1");
  commitAll(root, "Friends", at("2026-10-02T10:00:00Z"));
  git(root, "checkout", "-q", "main");
  execFileSync("git", ["merge", "-q", "--no-ff", "-m", "Merge side", "side"], { cwd: root, env: { ...process.env, ...at("2026-10-02T11:00:00Z") } });

  const utc = backfill({ config: config(), since: "2026-09-30", until: "2026-10-03", repoRoot: root });
  assert.equal(utc.commits, 3, "the merge is skipped");
  assert.deepEqual(
    utc.groups.map((group) => `${group.day} ${group.group} ${group.commits.length}`),
    ["2026-10-01 area:app/events 1", "2026-10-01 profiles 2", "2026-10-02 friends 1"],
  );
  assert.equal(utc.areas[0].key, "app/events");
  assert.ok(!JSON.stringify(utc).includes("Other Author"), "no author names in the evidence");
  const karachi = backfill({ config: config({ timeZone: "Asia/Karachi" }), since: "2026-09-30", until: "2026-10-03", repoRoot: root });
  assert.ok(karachi.groups.some((group) => group.day === "2026-10-02" && group.group === "profiles"), "21:30Z is the next day in Karachi");
  rmSync(root, { recursive: true, force: true });
});

// --- publish -----------------------------------------------------------------------------

function publishFixture() {
  const remote = tempDir("remote");
  git(remote, "init", "-q", "--bare", "-b", "main");
  const root = repo("publish");
  write(root, "app/profile/page.tsx", "1");
  write(root, `${DOCS}/config.json`, "{}");
  commitAll(root, "Start");
  git(root, "remote", "add", "origin", remote);
  git(root, "push", "-q", "-u", "origin", "main");
  const settings = config({ publish: { mode: "commit-and-push", remote: "origin", branch: "main" } });
  const options = { config: settings, repoRoot: root, docsDir: path.join(root, DOCS), localDir: path.join(root, DOCS, "local") };
  return { root, remote, settings, options };
}

test("publish: only the listed docs are committed and pushed, other work untouched, no trailers", () => {
  const { root, remote, options } = publishFixture();
  write(root, `${DOCS}/modules/profiles/overview.md`, "x");
  write(root, "notes.txt", "staged");
  git(root, "add", "notes.txt");
  write(root, "app/profile/page.tsx", "2");
  const result = publish({ ...options, docs: [`${DOCS}/modules/profiles`], message: "Document Profiles: banner" });
  assert.equal(result.commits.length, 1);
  assert.deepEqual(git(root, "show", "--name-only", "--format=", "HEAD").split("\n"), [`${DOCS}/modules/profiles/overview.md`]);
  assert.equal(git(root, "log", "-1", "--format=%B"), "Document Profiles: banner");
  assert.equal(git(root, "log", "-1", "--format=%an <%ae>"), "Test Person <test.person@example.com>");
  assert.equal(git(root, "diff", "--cached", "--name-only"), "notes.txt", "still staged, not committed");
  assert.equal(git(root, "diff", "--name-only"), "app/profile/page.tsx", "still changed, not committed");
  assert.equal(git(remote, "log", "-1", "--format=%s", "main"), "Document Profiles: banner");
  rmSync(root, { recursive: true, force: true });
  rmSync(remote, { recursive: true, force: true });
});

test("publish: work and docs as two commits; dry run changes nothing; refusals and exit codes", () => {
  const { root, remote, settings, options } = publishFixture();
  write(root, "app/profile/page.tsx", "3");
  write(root, `${DOCS}/modules/profiles/overview.md`, "y");
  const head = git(root, "rev-parse", "HEAD");
  publish({ ...options, docs: [`${DOCS}/modules`], work: ["app/profile/page.tsx"], workMessage: "Limit banner size", message: "Document Profiles: size", dryRun: true });
  assert.equal(git(root, "rev-parse", "HEAD"), head, "dry run made no commit");
  const result = publish({ ...options, docs: [`${DOCS}/modules`], work: ["app/profile/page.tsx"], workMessage: "Limit banner size", message: "Document Profiles: size" });
  assert.deepEqual(result.commits.map((commit) => commit.message), ["Limit banner size", "Document Profiles: size"]);
  assert.equal(git(remote, "log", "-2", "--format=%s", "main"), "Document Profiles: size\nLimit banner size");

  const code = (fn) => {
    try {
      fn();
    } catch (error) {
      assert.ok(error instanceof PublishError, error.message);
      return error.code;
    }
    return 0;
  };
  write(root, `${DOCS}/modules/profiles/overview.md`, "z");
  assert.equal(code(() => publish({ ...options, docs: ["app/profile/page.tsx"], message: "x" })), 2, "outside the docs");
  assert.equal(code(() => publish({ ...options, docs: [`${DOCS}/local/log.jsonl`], message: "x" })), 2, "local state");
  assert.equal(code(() => publish({ ...options, docs: [`${DOCS}/modules`], message: "Docs\n\nCo-Authored-By: Claude <x>" })), 2, "attribution");
  assert.equal(code(() => publish({ ...options, docs: [`${DOCS}/modules`], message: "Document Games: session timeouts" })), 0, "product words are fine");
  assert.equal(code(() => publish({ ...options, config: { ...settings, publish: { ...settings.publish, mode: "leave" } }, docs: [`${DOCS}/modules`], message: "x" })), 6, "leave mode");

  write(root, "app/x.ts", "unpushed");
  commitAll(root, "Unpushed work");
  write(root, `${DOCS}/modules/profiles/overview.md`, "w");
  assert.equal(code(() => publish({ ...options, docs: [`${DOCS}/modules`], message: "Document" })), 3, "unpushed commits");

  const other = tempDir("other");
  git(other, "clone", "-q", remote, ".");
  git(other, "config", "user.name", "O");
  git(other, "config", "user.email", "o@example.com");
  write(other, "other.txt", "1");
  commitAll(other, "Other");
  git(other, "push", "-q", "origin", "main");
  assert.equal(code(() => publish({ ...options, docs: [`${DOCS}/modules`], message: "Document", includeUnpushed: true })), 4, "remote moved on");
  assert.match(git(root, "log", "-1", "--format=%s"), /Document/, "the commit stays local");

  git(root, "checkout", "-q", "-b", "elsewhere");
  write(root, `${DOCS}/modules/profiles/overview.md`, "v");
  assert.equal(code(() => publish({ ...options, docs: [`${DOCS}/modules`], message: "Document" })), 5, "wrong branch");
  for (const dir of [root, remote, other]) rmSync(dir, { recursive: true, force: true });
});

// --- setup and check ------------------------------------------------------------------------

test("hooks merge: others' hooks kept, ours replaced not duplicated, invisible to the time tracker", () => {
  const timeTracker = { type: "command", command: 'node "$CLAUDE_PROJECT_DIR/project-management/tracking/engine/hooks.mjs" session-start' };
  const settings = { model: "x", hooks: { SessionStart: [{ hooks: [timeTracker] }], PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo" }] }] } };
  const once = withDocsHooks(settings);
  const twice = withDocsHooks(once);
  assert.deepEqual(twice, once);
  assert.equal(once.model, "x");
  assert.deepEqual(once.hooks.PreToolUse, settings.hooks.PreToolUse);
  assert.equal(once.hooks.SessionStart.length, 2);
  assert.ok(once.hooks.SessionStart[0].hooks[0] === timeTracker);
  assert.equal(once.hooks.Stop.length, 1);
  const ours = once.hooks.Stop[0].hooks[0];
  assert.ok(isOurHook(ours));
  assert.equal(ours.timeout, 15);
  assert.ok(!/engine\/hooks\.mjs|session-start\.m[jt]s/.test(ours.command), "the time tracker's setup would delete a hook matching its own test");
  assert.ok(!isOurHook(timeTracker));
});

test("setup: stops without a publish mode, installs with one, and a re-run changes nothing", () => {
  const root = repo("setup");
  const run = (...args) => spawnSync(process.execPath, [SETUP, ...args], { cwd: root, encoding: "utf8" });
  const first = run();
  assert.equal(first.status, 2);
  assert.match(first.stderr, /needs: publish/);
  const install = run("--publish", "leave", "--history-from", "2026-08-04");
  assert.equal(install.status, 0, install.stderr);
  const saved = JSON.parse(readFileSync(path.join(root, DOCS, "config.json"), "utf8"));
  assert.equal(saved.publish.mode, "leave");
  assert.equal(saved.historyFrom, "2026-08-04");
  assert.equal(saved.requirements, null);
  const settingsBefore = readFileSync(path.join(root, ".claude", "settings.json"), "utf8");
  const gitignoreBefore = readFileSync(path.join(root, ".gitignore"), "utf8");
  assert.match(gitignoreBefore, /project-management\/module-docs\/local\//);
  mkdirSync(path.join(root, "project-management", "requirements"), { recursive: true });
  const again = run();
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /requirements linked/);
  assert.equal(readFileSync(path.join(root, ".claude", "settings.json"), "utf8"), settingsBefore);
  assert.equal(readFileSync(path.join(root, ".gitignore"), "utf8"), gitignoreBefore);
  const drift = engineDrift(path.join(SKILL_DIR, "templates", "module-docs", "engine"), path.join(root, DOCS, "engine"));
  assert.deepEqual(drift, { changed: [], missing: [], extra: [] });
  writeFileSync(path.join(root, DOCS, "engine", "stale.mjs"), "");
  assert.deepEqual(engineDrift(path.join(SKILL_DIR, "templates", "module-docs", "engine"), path.join(root, DOCS, "engine")).extra, ["stale.mjs"]);
  rmSync(root, { recursive: true, force: true });
});
