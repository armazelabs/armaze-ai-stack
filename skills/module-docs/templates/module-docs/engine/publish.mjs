// Commit the docs - only the docs - and push them.
//
//   node <engine>/publish.mjs --message "Document Profiles: banner upload" <docs paths...>
//   node <engine>/publish.mjs --message "..." --work <path> --work <path> --work-message "Add banner upload" <docs paths...>
//   node <engine>/publish.mjs --dry-run ...
//   node <engine>/publish.mjs --include-unpushed ...
//
// Used only when config.json's publish mode is "commit-and-push". It is the
// one place module-docs writes to git, and it is careful about it:
//
//   - only the paths given are committed (`git commit --only`): anything else
//     staged or changed in the checkout stays exactly as it was
//   - docs paths must be inside project-management/module-docs/ (never local/)
//   - `--work` paths - the task's own files, which the person agreed to commit
//     with its docs - go in a commit of their own, first
//   - the commit carries the configured git user and nothing else: a message
//     naming a tool, a co-author or a session is refused
//   - it pushes HEAD to the configured branch, never with force, and never
//     pulls or rebases on its own
//
// Exit codes:
//   0  committed and pushed (or, with --dry-run, would have)
//   1  git failed (the message says how)
//   2  refused before touching git: bad arguments, a path outside the docs,
//      a message with attribution in it, no git user, a merge or rebase in progress
//   3  HEAD already has commits the remote lacks: pushing would publish them
//      too. Ask the person, then re-run with --include-unpushed.
//   4  the push was rejected because the remote moved on. The commits are
//      safe locally; the person pulls and pushes when ready.
//   5  the checked-out branch is not the publish branch
//   6  publish mode is "leave": nothing is committed

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { LOCAL_DIR, MODULE_DOCS_DIR, REPO_ROOT, loadConfig, toRepoRelative } from "./config.mjs";

/** Attribution a commit must never carry: a tool, a co-author trailer, a session link. Product words like "session" are fine. */
const ATTRIBUTION = /co-authored-by|\bclaude\b|anthropic|generated with|[a-z]+-session:|session_[a-z0-9]{6,}|\bai-generated\b|copilot|chatgpt/i;

export class PublishError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function run(args, { repoRoot, dryRun, log }) {
  log(`$ git ${args.map((arg) => (/[\s"']/.test(arg) ? JSON.stringify(arg) : arg)).join(" ")}`);
  if (dryRun) return "";
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      timeout: 60_000,
    });
  } catch (error) {
    const detail = `${error.stderr ?? ""}${error.stdout ?? ""}`.trim() || error.message;
    const failure = new PublishError(1, `git ${args[0]} failed: ${detail}`);
    failure.stderr = detail;
    throw failure;
  }
}

function read(args, repoRoot) {
  try {
    return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

/** Refusals that need no git command to decide. */
export function checkArguments({ docs, work, message, workMessage, docsDir, localDir, repoRoot }) {
  if (!message?.trim()) throw new PublishError(2, "--message is required.");
  if (docs.length === 0) throw new PublishError(2, "Name the docs files to publish.");
  if (work.length > 0 && !workMessage?.trim()) throw new PublishError(2, "--work needs --work-message for the work's own commit.");
  for (const text of [message, workMessage].filter(Boolean)) {
    if (ATTRIBUTION.test(text)) throw new PublishError(2, `Refused: "${text}" names a tool, a co-author or a session. Commits carry only the configured git user.`);
    if (/\n\s*\n/.test(text)) throw new PublishError(2, "Keep commit messages to one paragraph - no trailers.");
  }
  const docsRel = toRepoRelative(docsDir, repoRoot);
  const localRel = toRepoRelative(localDir, repoRoot);
  const docsPaths = docs.map((file) => {
    const rel = toRepoRelative(file, repoRoot);
    if (!rel || !(rel === docsRel || rel.startsWith(`${docsRel}/`))) throw new PublishError(2, `Refused: ${file} is not inside ${docsRel}/.`);
    if (rel === localRel || rel.startsWith(`${localRel}/`)) throw new PublishError(2, `Refused: ${rel} is this computer's local state and never committed.`);
    return rel;
  });
  const workPaths = work.map((file) => {
    const rel = toRepoRelative(file, repoRoot);
    if (!rel) throw new PublishError(2, `Refused: ${file} is outside the project.`);
    if (rel === docsRel || rel.startsWith(`${docsRel}/`)) throw new PublishError(2, `${rel} is a docs file - pass it as a docs path, not --work.`);
    return rel;
  });
  return { docsPaths: [...new Set(docsPaths)], workPaths: [...new Set(workPaths)] };
}

/** Commit the work (if any), then the docs, then push. Returns a summary. */
export function publish({ docs = [], work = [], message, workMessage = null, dryRun = false, includeUnpushed = false, config, repoRoot = REPO_ROOT, docsDir = MODULE_DOCS_DIR, localDir = LOCAL_DIR, log = () => {} }) {
  if (config.publish?.mode !== "commit-and-push") {
    throw new PublishError(6, 'Publish mode is "leave": the files are written, and the person commits them.');
  }
  const { docsPaths, workPaths } = checkArguments({ docs, work, message, workMessage, docsDir, localDir, repoRoot });
  const { remote, branch } = config.publish;

  const gitDir = read(["rev-parse", "--git-dir"], repoRoot);
  if (!gitDir) throw new PublishError(2, "Not a git repository.");
  const absoluteGitDir = path.resolve(repoRoot, gitDir);
  for (const marker of ["MERGE_HEAD", "rebase-merge", "rebase-apply", "CHERRY_PICK_HEAD", "REVERT_HEAD"]) {
    if (existsSync(path.join(absoluteGitDir, marker))) throw new PublishError(2, "A merge, rebase, cherry-pick or revert is in progress - finish it first.");
  }
  if (!read(["config", "user.name"], repoRoot) || !read(["config", "user.email"], repoRoot)) {
    throw new PublishError(2, "No git user configured - set user.name and user.email first.");
  }
  const current = read(["branch", "--show-current"], repoRoot);
  if (current !== branch) throw new PublishError(5, `On branch "${current ?? "(detached)"}", but docs publish to "${branch}". Switch, or change publish.branch in config.json.`);

  const upstream = read(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], repoRoot) || `${remote}/${branch}`;
  const ahead = read(["log", "--format=%h %s", `${upstream}..HEAD`], repoRoot);
  const unpushed = ahead ? ahead.split("\n").filter(Boolean) : [];
  if (unpushed.length > 0 && !includeUnpushed) {
    const error = new PublishError(3, `HEAD has ${unpushed.length} commit(s) ${upstream} does not, and a push would publish them too:\n${unpushed.map((line) => `  ${line}`).join("\n")}`);
    error.unpushed = unpushed;
    throw error;
  }

  const options = { repoRoot, dryRun, log };
  const commits = [];
  const commitPaths = (paths, text) => {
    run(["add", "-A", "--", ...paths], options);
    const staged = dryRun ? paths.join("\n") : read(["diff", "--cached", "--name-only", "--", ...paths], repoRoot);
    if (!staged) return null;
    run(["commit", "--only", "-m", text, "--", ...paths], options);
    const sha = dryRun ? "(dry run)" : read(["rev-parse", "--short", "HEAD"], repoRoot);
    commits.push({ sha, message: text, files: staged.split("\n").filter(Boolean) });
    return sha;
  };
  if (workPaths.length > 0) commitPaths(workPaths, workMessage.trim());
  commitPaths(docsPaths, message.trim());
  if (commits.length === 0) return { commits, pushed: false, nothingToCommit: true };

  try {
    run(["push", remote, `HEAD:${branch}`], options);
  } catch (error) {
    const detail = error.stderr ?? error.message;
    if (/non-fast-forward|fetch first|rejected|updates were rejected/i.test(detail)) {
      const rejected = new PublishError(4, `${remote}/${branch} has commits this checkout does not. The commit(s) ${commits.map((commit) => commit.sha).join(", ")} are safe here - pull and push when ready. Nothing was forced.`);
      rejected.commits = commits;
      throw rejected;
    }
    throw error;
  }
  return { commits, pushed: !dryRun, remote, branch };
}

function main() {
  const args = process.argv.slice(2);
  const docs = [];
  const work = [];
  let message = null;
  let workMessage = null;
  let dryRun = false;
  let includeUnpushed = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--message") message = args[++index];
    else if (arg === "--work-message") workMessage = args[++index];
    else if (arg === "--work") work.push(args[++index]);
    else if (arg === "--dry-run") dryRun = true;
    else if (arg === "--include-unpushed") includeUnpushed = true;
    else if (arg.startsWith("--")) throw new PublishError(2, `Unknown option ${arg}.`);
    else docs.push(arg);
  }
  const config = loadConfig();
  if (!config) throw new PublishError(2, "module-docs is not set up here.");
  const result = publish({ docs, work, message, workMessage, dryRun, includeUnpushed, config, log: dryRun ? (line) => console.log(line) : () => {} });
  if (result.nothingToCommit) {
    console.log("Nothing to commit - those files have no changes.");
    return;
  }
  for (const commit of result.commits) console.log(`${dryRun ? "Would commit" : "Committed"} ${commit.sha}: ${commit.message} (${commit.files.length} file${commit.files.length === 1 ? "" : "s"})`);
  console.log(dryRun ? `Would push HEAD to ${config.publish.remote}/${config.publish.branch}.` : `Pushed to ${result.remote}/${result.branch}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(error instanceof PublishError ? error.code : 1);
  }
}
