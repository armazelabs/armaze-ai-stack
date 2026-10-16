---
name: sync-repo
description: Syncs this repo's pushed commits into a cleaned copy for the client (the mirror), one commit each, keeping each commit's dates and, unless told otherwise, its author and committer. It leaves out AI tooling, skills, research, project management, tasks, rules and anything Figma-related, keeps comments short, checks that only comments changed, waits for the runner's review before the first commit, offers a Playwright comparison of both apps, and pushes only on the runner's yes. Needs Node and git. Use when someone says "sync-repo", "sync repo", "sync the client repo", "set up sync-repo" or runs /sync-repo.
---

# sync-repo

This skill keeps a cleaned copy of this repo for the client: the **mirror**, a clone of the client's repo. It is private, so:
- Never mention the mirror or the sync-repo data folder in the project's docs: the CHANGELOG, the decision log, CLAUDE.md, a README or plans.
- This skill folder and the data folder may be committed. Neither ever reaches the mirror: `.claude` and `project-management` are in `exclude`.
- After a sync, `sync-log.md` has new rows. Don't commit it yourself. Tell the person running the sync that it changed and must be committed and pushed, so the next person's sync starts from it.

The setup:
- **Data folder:** `project-management/sync-repo/`. A project that already has a `.sync-repo/` folder keeps using that one.
- **Config:** `config.json` (shared) holds the excluded paths, the leak patterns and the comparison setup. `local.json` (gitignored, one per machine) holds `target`, this machine's mirror folder.
- **Project rules:** `rules.md` holds what is particular to this project: the first commit's message, the install and check commands, names to keep out, files that ship as they are, comments that are data. Read it before every clean. Where it and this file disagree, it wins.
- **Log:** `sync-log.md` holds the last synced source commit and one row per source commit.
- **Script:** `node <skill_dir>/scripts/sync.mjs <command>`, run from the repo root.
- **Source of truth:** the script reads only committed git objects. Uncommitted work in this repo, including work from other sessions, is never synced.

## Set up (once per project)

When the script says there is no `config.json` yet:

1. Copy `<skill_dir>/templates/config.json` and `templates/sync-log.md` into `project-management/sync-repo/`. Copy `templates/rules.md` there too.
2. Fit `exclude` to this repo: list its top-level paths (`git ls-tree --name-only HEAD`) and add every AI, process or internal path the template misses. Drop the ones the repo doesn't have only if they clutter; an unused entry is harmless.
3. Ask the person who sets it up:
   - the first commit's message, and the install and check commands for the mirror
   - names to keep out: the team (`git log --format=%an | sort -u` gives the authors), the client's other projects and any internal tool not in the template
   - anything else `rules.md` asks for

   Write the answers into `rules.md`, and add each name to `leakPatterns`. Drop a template pattern only when it clashes with the product's own words.
4. Set up `compare`, or remove it when the project has no web app: `app` is the app's folder in the repo, `command` starts its dev server (`{port}` is replaced), `env` adds environment variables, `loading` is a CSS selector of loaders to wait out, `themeParam` is the URL parameter for an app that takes its theme from the URL. Then `pages`, `expected`, `none`, and `map` (folder prefix to the pages it affects).
5. Add `project-management/sync-repo/local.json` to the root `.gitignore`.
6. Run `npm install` in `<skill_dir>` once on each machine that compares, or when the project has no TypeScript of its own (`verify` needs it).

Then carry on with "On a new machine".

## On a new machine

- If the script says no mirror folder is set, ask the person for the path to their clone of the client repo (clone it first if they have none), then write `local.json` as `{ "target": "<path>" }`.
- Once the log has a "Last synced", the mirror folder is always a clone of the client repo, never an empty folder: `init` happens once, on the very first sync.
- Everyone shares the log, and each person has their own clone. Before a sync, both this repo and the mirror clone must be pulled. `status` stops when they disagree.

## Hard rules

1. Nothing from an excluded path reaches the mirror: `.claude/`, `.agents/`, skills, research, project management, tasks, rules, tools, everything else in `exclude`, and **anything Figma-related** (`FIGMA.md`, Figma keys, node ids, frames, library names). Nothing that points at them reaches it either, in a comment, a doc or a commit message.
2. Only **pushed** source commits are synced (`sourceRef`, `origin/main`, after `git fetch`). Local unpushed commits wait for a later sync.
3. Each source commit becomes one mirror commit. Its message describes the change in product terms. It keeps the source commit's author and committer dates. It keeps their names too, unless the person running the sync says no to the identity question (see Run): then both are their mirror's git identity. Never a co-author.
4. **Never push the mirror without a yes from the person running the sync, in that same run.** Never force-push, never branch.
5. The comparison is never automatic. Ask first, every time.
6. Every comment you add or keep obeys the cleaning rules below. `verify` must pass before every commit.
7. Comments stay short and useful. Remove AI-style narration, but never strip a file bare.
8. Files that `rules.md` says ship as they are are never excluded, converted or renamed.

## First run (no "Last synced" in the log yet)

1. Run `init`. It exports `origin/main` into the mirror, which must be empty apart from `.git`.
2. Clean the whole tree using the rules below. For a large tree, split it into folder slices across parallel subagents.
3. Write the mirror-owned files: README and `.gitignore`, and any logos they use (see below).
4. Get `verify <sha> --all` clean.
5. In the mirror, run the install and check commands from `rules.md`.
6. If `compare` is set up, ask: **"Run the Playwright comparison of every page?"** On yes, see Compare: `node <skill_dir>/scripts/compare.mjs --all`.
7. **Stop. Do not commit.** Tell the person running the sync that the files are ready for their review (with the comparison result, if it ran), and wait.
8. Only when they say to commit, ask the identity question (see Run), then run `commit <sha> <file> --reviewed` (plus `--as-me` on a no) with the first commit's message from `rules.md`. It is dated at that source commit. The script refuses the first commit without `--reviewed`.
9. Ask to push (see Push).

## Run

1. Run `status`. It fetches, then lists the pending pushed commits, oldest first, with their included changes.
   - "Up to date" means there is nothing to sync, so go to step 5.
   - If it says history was rewritten, or the mirror has uncommitted changes, stop and tell the person running the sync.
   - If it says the mirror is behind the client repo, or isn't at the log's last mirror commit, the mirror clone or this repo needs a pull. Stop and tell them which.
2. For each pending commit, in order:
   1. Run `apply`. It applies the next commit:
      - commits that only touch excluded paths are recorded as skipped
      - NEW files get every comment cleaned
      - MERGED files get the changed lines cleaned (`git -C <target> diff`)
      - CONFLICTS have markers `<<<<<<< mirror` / `>>>>>>> source`: keep the source's code, write the comments the clean way, and remove the markers
   2. Clean, following the rules below and `rules.md`.
   3. Run `verify <sha>`. Fix every `FAIL`:
      - "code differs" means you changed code: undo that change. Only comments may differ.
      - A leak hit: rewrite or drop that comment.
      - `string (report…)` lines are visible strings or test names. Don't edit them. The one allowed exception is removing a decision or change ID such as `(D-032)`. Collect the rest for the final report.
   4. Before the run's first commit, ask once: **"Keep each commit's original author and committer? (No commits them as you: <the mirror's `git config user.name` and `user.email`>.)"** On no, add `--as-me` to every `commit` in this run. The dates are always the source's.
   5. Write the message to a temp file in the scratchpad, then run `commit <sha> <file>`. It re-runs `verify`, refuses leaks and trailers, commits with the source dates and the chosen names, prints the author and committer it used, and records the row.
3. In the mirror, run the install command from `rules.md` (only if the lockfile changed or `node_modules` is missing), then the check command. If it fails, report it. Don't paper over it.
4. If `compare` is set up, work out the touched pages: `sync.mjs pages <the run's synced shas>`. It prints `all`, `none` or a list. Add any page a change clearly affects that the map missed.
   - Ask: **"Run the Playwright comparison of <pages>?"** On yes, run `compare.mjs --pages <list>`, or `--all`.
   - If the answer was `none`, say there's nothing visual to compare.
5. Report to the person running the sync:
   - the mirror commits made, with the source commit, author and committer each came from
   - the commits skipped
   - any string warnings
   - the comparison result, or that none ran
   - that `sync-log.md` changed and needs committing and pushing
6. If there are unpushed mirror commits, ask to push (see Push).

## Compare

`compare.mjs` screenshots each page in both apps and diffs them pixel by pixel:
- pages: `compare.pages`, at every viewport in `compare.viewports` and every theme in `compare.themes`
- pass rule: 0 differing pixels, and a page that differs is retried once

**The servers:**
- The **source** is the source folder itself, on `sourcePort`. If a dev server is already serving its `app` folder there, it's reused and left running. If nothing is there, the script starts one with `command` and stops it afterwards. Anything else on that port stops the run.
- The **mirror** runs on `mirrorPort`, started and stopped by the script.

**Before running, check the source.** List what would cause false differences: uncommitted files (`git status --short`), and local commits newer than the last synced one (`git log --oneline <last synced>..HEAD`). If there are any, show them and ask whether to compare anyway.

**Reading the result:**
- Each shot is `same`, `expected (…)` or `DIFFERENT`.
- `compare.expected` lists the pages that always differ, with the reason (`rules.md` says which area may change). Still open an expected page's diff, and confirm only that known area changed.
- The images and `report.md` go to a temp folder, whose path the script prints.
- For each DIFFERENT shot, open its `-diff.png`, then say what differs and the likely cause.
- **Report only.** Change nothing, and commit nothing, without the word of the person running the sync.

Playwright runs from this skill folder (`npm install` there once) and uses the installed Google Chrome. Nothing is added to the app.

## Push

- Always ask before pushing: **"Push N commits to the client repo?"** Include the comparison result: same, expected, the differences (if any), or "no comparison was run".
- Push only on yes: `git -C <target> push origin main`, adding `-u` the first time.
- Never force-push, and never push on your own.

## Cleaning rules (comments in code, and prose in shipped `.md` files)

**Keep** a comment that says why the code does something, or describes a behaviour that isn't obvious from the code. Shorten it to one or two plain sentences. `rules.md` lists references that may stay.

**Remove or rewrite:**
- decision, change, question and task IDs: `D-012`, `C-146`, `Q-003`, `T5`, "Phase 6", "Checkpoint F"
- provenance, meaning who asked or reviewed and when: "Sam's review", "the client's review", "(2026-10-08)", "read on …"
- change-history narration: "it was 36px", "no longer…", "now…", "moved here from…"
- anything that names an excluded file or folder: `CLAUDE.md`, `PRODUCT.md`, `feature.md`, `rules/…`, `tasks/…`, `research/…`, `project-management/…`, the decision log
- anything that names a tool: Claude, AI agents, skills, MCP, Orca, Playwright MCP, graft, armaze, impeccable, the time tracker, module docs
- the names in `rules.md`: the team, the client's other projects
- **anything Figma-related**:
  - the word Figma
  - file keys, node ids such as `244:1770`, and component-set keys
  - library and variant names such as "Components (WebApp)" and `Size=Large`
  - "the frame draws…", "the library's…"

  State the design rule itself in plain words instead. For example, "Figma's frame puts 16px between rows" becomes "16px between rows".
- comments that only restate the next line of code

**Never touch:**
- code, string literals, JSX text or test names (the one exception is dropping an ID, above). Visible strings stay as they are, even when they mention Figma.
- directive comments: `eslint-*`, `@ts-*`, `prettier-ignore`, `@vite-ignore`, `/// <reference>`, `__PURE__`, and JSDoc `@type`/`@param`/`@returns` in `.js`/`.mjs`

**Comments that are data:** some comments are read by a program, such as a page that parses a tokens file. `rules.md` names them. Leave them exactly as in the source. The project's check command catches a break here, but `verify` doesn't.

**When a rule from an excluded doc matters to the code**, state it in the comment in plain words. For example: "Unbuilt destinations show a toast instead of a broken link."

**Generated files** carry the header `rules.md` gives them, and nothing else that points at how they were made.

**Divergent files** (`divergent` in the config) carry more than comment edits. The 3-way merge keeps the cleaned versions, so keep them clean. `rules.md` says what differs; `package.json` never has `time:*` scripts.

**Mirror-owned files** (`mirrorOwned` in the config: `README.md`, `.gitignore` and `.github/`) exist only in the mirror and are never synced. `verify` still scans them for leaks.
- `README.md` has a short overview, then install and usage. Nothing else, apart from what `rules.md` adds (a logo in light and dark mode, for example).
- `.gitignore` lists only what the app produces, such as `node_modules/`, `dist/`, `*.tsbuildinfo`, `.env*` (but not `.env.example`), `.DS_Store`, `*.log`.
- When a synced commit changes something these files depend on, update them by hand in that same mirror commit. For example, a new Node or package manager version, script, setup step or build output.

## Commit messages

- One short line in the imperative, under about 72 characters, and a short body only when the line can't carry it.
- Describe what changed for the product. Use no IDs, names, tools, research, plans or timesheet.
- Base it on the source commit's subject, but never copy its process notes.
- Never add `Co-Authored-By`, `Claude-Session` or "Generated with" lines.
