---
name: module-docs
description: Keeps one living page per product module - what it is, what is built now, what is coming next, what is still open, and a dated history of what changed, why, how it was planned and what was decided - written for the client and the developers alike. After each finished task it asks whether to document the work, catches up anything an earlier session left undocumented, rebuilds past history from git on its first run, links to the project's requirements when they exist, and can commit and push only the docs files. Lives in project-management/module-docs/. Use for "set up module docs", "document this", "update docs", "check module docs", "add a module", or /module-docs.
---

# Module docs

One page per product module, kept current as the work happens. A reader - the
client or a developer - opens a module and finds what it is, what is built
now, what is coming next, what is still open, and the dated history of how it
got here: what changed, why, how it was planned, and what was decided along
the way, including the options that were dropped.

Everything lives in `project-management/module-docs/`; below, `<engine>` means
`project-management/module-docs/engine`. Every command runs from the project
root.

**Hooks prompt, people decide, Claude writes.** Setup installs two hooks.
SessionStart reminds every session to offer documentation and lists the work
earlier sessions left undocumented. Stop runs at each turn end and, when the
turn changed documentable files nobody has asked about, nudges Claude to ask.
Nothing is written until the person says yes.

## Pick the mode from what was asked

| The user wants | Mode |
| --- | --- |
| module docs set up, installed, added | **Setup**, then **First run** |
| the Stop hook's nudge, "document this", a task just finished | **Document a task** |
| the SessionStart catch-up list, "update docs" | **Catch-up** |
| work in an area no module covers; "add a module", "exclude X" | **New area** |
| "check module docs", "update module docs setup", after `aistack update` | **Check** |

## Setup

1. Ask how the docs get published - AskUserQuestion, from
   `references/questions.md` ("Publishing"): Claude commits and pushes only
   the docs files, or leaves them for the person to commit. Ask for the date
   history should start from too, when the project has history worth
   rebuilding (offer the first commit's date, or today for none).
2. Run `node <skill_dir>/scripts/setup.mjs --publish <commit-and-push|leave> [--history-from YYYY-MM-DD]`.
   On a re-run, where `config.json` exists, the flags are optional and only
   change what they name.
3. Run **Check** to prove it works, then go straight on to **First run**.
4. Say that the hooks start with the next session, and that
   `.claude/settings.json`, `.gitignore` and `project-management/module-docs/`
   need committing so teammates get them.

## First run

Writes every module's page and rebuilds the history since `historyFrom`.

1. **Modules.** Find the product's modules in the person's own product docs
   (a modules list, an application-structure page). Never invent them. Show
   the list with AskUserQuestion ("Modules") and confirm it; then
   `node <engine>/config.mjs add-module --name "<Name>" --description "<their words>" --source <file>`
   for each, in the order they want the pages listed. If the project has
   requirements, run `node <engine>/config.mjs adopt` so the two share one
   module list.
2. **Code.** Propose which folders and files each module covers, from the
   routes, components and domain folders, as globs (`app/profile/**`,
   `components/profile-*`). Show them as a table and confirm ("Paths": Looks
   right / Change something), then `config.mjs add-paths --id <id> --path <glob>...`.
   A module with nothing built yet gets no paths.
3. **Backfill evidence.** `node <engine>/evidence.mjs backfill`. It groups
   every commit since `historyFrom`, one group per module per day, and lists
   the areas no module covers. Ask about each area once (**New area**), in
   rounds of up to four questions, save each answer, and run backfill again
   until no areas are left.
4. **Current state.** For each module, `node <engine>/evidence.mjs inventory <id>`,
   read the module's main screens and components, and write
   `modules/<id>/overview.md` from `<skill_dir>/templates/overview.md`, following
   `references/writing-guide.md`. "What it is" comes only from the person's
   product docs; a gap is a `[To confirm: ...]` placeholder, reported to them.
   "Open follow-ups" lists only explicit markers and gaps the commits name.
   A module with nothing built is `status: not-started`.
5. **History.** For each group in `local/backfill.json`, write one entry
   `modules/<id>/history/<day>-<slug>.md` with `kind: backfill`: "What
   changed", plus "Why and the plan" only when a commit body states a reason.
   Never guess at plans or decisions that were not recorded. For many groups,
   hand one module's groups at a time to a subagent with the writing guide.
6. `node <engine>/pages.mjs lint`, fix every error, look at every warning.
7. Publish once (see **Publishing**): "Document every module: current state
   and history since <historyFrom>". Include `config.json`.

## Document a task

After finishing a task the person asked for that changed project files - or
when the Stop hook's nudge says so - ask, unless the task is not finished,
the session is in plan mode, or the person has said "Not now" in this
session.

1. If the nudge names an area no module covers, run **New area** first.
2. **Ask** ("Document" in `references/questions.md`): the module, a one-line
   summary of the work, and the options **Yes, under <Module>** / **Different
   module** / **Not now** / **Don't document**. One question per module when
   the work touched several.
   - Different module: ask which, offering the likeliest four (Other names a
     new one - then **New area**).
   - Not now: `node <engine>/log.mjs record --decision deferred --session <id> --group <id>`,
     and do not ask again this session. The next session's catch-up raises it.
   - Don't document: `log.mjs record --decision skipped --session <id> --group <id>`.
3. On a yes: `node <engine>/evidence.mjs --session <session id> --group <module id>`,
   read the evidence file it names, and write the entry from
   `<skill_dir>/templates/entry.md` following `references/writing-guide.md`. The session
   id is in the SessionStart context and the nudge.
4. Rewrite the module's `overview.md`: "What's built now" as it is after the
   work, "Open follow-ups" rolled up (add the new ones, drop the ones this work
   resolved), `updated` to today, `status: in-progress`.
5. If a decision changed behaviour the client approved in a requirement, tell
   the person a change record is needed through the requirements skill. Do
   not write it, and never change a requirement's status.
6. `node <engine>/pages.mjs lint <files>` - errors fixed, warnings looked at.
7. `node <engine>/log.mjs record --decision documented --session <id> --group <id> --entry <entry file>`.
8. Publish (see **Publishing**).

## Catch-up

Triggered by the SessionStart list (ask in your first reply, before the
person's request, then carry on with it) or by "update docs".

1. `node <engine>/config.mjs adopt` (when the project has requirements), then
   `node <engine>/scan.mjs`.
2. Ask about each unassigned area first (**New area**).
3. Ask ("Catch-up" in `references/questions.md`): up to four items, one
   question each with the four options; more than four, one question - Yes,
   all / Let me choose / Not now / Don't document any.
4. For each yes: `node <engine>/evidence.mjs <item id>`, write the entry from
   the evidence file alone, refresh the overview, then
   `log.mjs record --decision documented --item <item id> --entry <file>`.
   Skips and deferrals are recorded with `--item` too.
5. Lint, then publish everything in one commit: "Document N pieces of work:
   Profiles, Forums".
6. Docs written earlier but not committed (`scan.mjs` says so) are published
   now if their work has been committed since.

## New area

Work in files no module covers is asked about once per area, never per task.

Ask ("New area"): "<area> isn't part of any module. Where does it belong?" -
**Under <closest module>** / **Under <second closest>** / **Leave it out**;
Other names a new module. Then:

- an existing module: `config.mjs add-paths --id <id> --path <glob>`
- leave it out: `config.mjs exclude --area "<plain name>" --path <glob>`
- a new module: ask for a one-line description in their words (or write a
  `[To confirm: ...]` placeholder and say so), then
  `config.mjs add-module --name "<Name>" --description "..." --path <glob>`

The answer is saved in `config.json`, so the area is never asked about again.

## Check

`node <skill_dir>/scripts/check.mjs --fix`. Exit 2 with `needs: publish` means
ask the publishing question first, then run it again with `--publish <mode>`.
Relay what was fixed and every line still marked `✘` or `!`. A failing page
lint is fixed by editing the page, never by editing the engine.

## Publishing

`config.json`'s `publish.mode` decides.

- **leave**: never commit. List the files written and say they go in with the
  person's next commit.
- **commit-and-push**: first check whether the work itself is committed - the
  evidence marks every file `committed: true/false`. If any is not, ask
  ("Commit both"): **Commit both** / **Hold the docs** / **Docs only**.
  - Commit both: `--work <file>` for each of the task's own files (only those
    the evidence lists, shown to the person in the question) with a plain
    `--work-message` describing the work.
  - Hold the docs: write them but do not publish; the next catch-up publishes
    them once the work is committed.
  - Then: `node <engine>/publish.mjs --message "Document <Module>: <title>" [--work ... --work-message "..."] <docs files> [project-management/module-docs/config.json]`
  - Exit 3: HEAD has commits that are not pushed. Show them and ask before
    re-running with `--include-unpushed` - pushing publishes them too.
  - Exit 4: the remote moved on. The commits are safe locally; tell the person
    to pull and push. Never pull, rebase or force on your own.
  - Exit 5: wrong branch. Say so; do not switch branches.

Commit messages are plain sentences about the work. They never name a tool, a
co-author or a session.

## Requirements

When `config.json` has a `requirements` block (setup adds it when
`project-management/requirements/` exists):

- One module list: a module the requirements have and module-docs does not is
  adopted (`config.mjs adopt`); a new module added here uses the same id the
  requirements would.
- An entry names the requirements and decisions its work delivered by their
  titles ("This delivers the agreed banner upload"); their IDs go only in the
  entry's internal `refs`. The evidence marks which ones the session mentioned.
- "Coming next" on a page lists the module's requirements whose status is in
  `requirements.comingNext`. A renderer draws it from the requirements files
  at build time (see `references/page-format.md`), so it is never copied into
  the pages and never goes stale.
- module-docs never writes a requirements file and never changes a status.

## Rules

- **Never on a page:** hours, durations, budgets or billing; people's names,
  emails, usernames or computers - who did what; Claude, AI, skills, agents,
  prompts, plan mode, hooks or any tooling; internal IDs; commit SHAs; paths
  under `project-management/` or `.claude/`. `pages.mjs lint` enforces what it
  can; the rest is on the writer.
- **Never invent product content.** Module names, descriptions and purposes
  come from the person's own docs or words. Plans and decisions come only from
  the evidence. A gap is a `[To confirm: ...]` placeholder, never a guess.
- **Tooling-only work is never offered:** changes only under `.claude/`,
  `project-management/` and the other `ignore` paths in `config.json`.
- **Ask once per area.** A saved area is never asked about again.
- **Read evidence files, not transcripts.** The engine reads the transcripts.
- **Publish only through `publish.mjs`**, and only module-docs paths plus the
  task's own files the person agreed to. No attribution lines, never force,
  never pull or rebase on your own. In `leave` mode, never commit.
- **The engine and the hooks are setup's.** Never hand-edit `<engine>/*.mjs`
  or the hook entries; change the skill and re-run setup.
- **The local log is append-only.** Never rewrite `local/log.jsonl`.
