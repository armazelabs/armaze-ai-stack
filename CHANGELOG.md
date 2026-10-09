# Changelog

All notable changes to the Armaze AI Stack — the shared shelf of skills and agents, and the `aistack` command that installs them — are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

## 0.15.1 - 2026-10-09

### Fixed

- **research-workspace**: the modules README now shows a module's own `research/` folder. It used to show the full `project-management/research/` path there, in both the folder tree and the "How to Add a Module" steps. It also lists `research/screenshots/`, where product-teardown saves its screenshots. The version-control rule's example branch name is `research/competitor-x` again. Workspaces scaffolded earlier keep their old README, because the scaffold never overwrites a file. Fix those two lines by hand, or delete the README and run the scaffold again.

## 0.15.0 - 2026-10-09

**New skill: product-teardown.** Add it to any project with `aistack add product-teardown`. It needs Orca.

### Added

- **product-teardown** researches a website, SaaS product, Figma file or mobile app one module at a time, in Orca's browser. It maps the product and proposes the modules, and you confirm them. It then sends up to three modules at once to background agents. For each screen and every state it can reach (empty, error, success, menus, modals), an agent:
  - saves a JPEG screenshot
  - extracts the page's headings, verbatim copy, links, buttons and every form field (label, type, placeholder, required, options, validation messages, help text), so the screen can be redesigned from the write-up
  - writes up functionality, user flows and a UX analysis, adding what docs, reviews and videos say, with citations
- Everything lands in the module's folder in the research tree: `research/teardown-<product>-<date>.md`, with the screenshots in `research/screenshots/`. For your own product it also fills the module definition and user flows.
- When a module comes back thin, it suggests three to five competitors or alternatives. Once you confirm, it studies them the same way, adds a "How others do it" section and creates their competitor profiles.
- Logins are kept in `.claude/product-teardown.local.env`, git-ignored and readable only by you. A helper types the saved login into the page, so the password never shows in the conversation. In a logged-in product the skill creates `teardown-test` records when it needs them, never deletes anything, and never touches billing, invites or settings.
- **project-kickoff** offers product-teardown for every project type.

## 0.14.0 - 2026-10-09

**The research tree moves into `project-management/`.** This applies to new workspaces; one that already has `research/` at the project root keeps it there, and the skills keep using it. Run `aistack update` in each project.

### Changed

- **research-workspace** creates the research tree in `project-management/research/` instead of `research/`, so `project-management/` is the only folder it adds at the project root. The guide, routing table and seeded docs point there. A workspace with a root `research/` keeps that layout and gets no second tree.
- **create-competitor-profile**, **update-competitor-profile**, **ux-visualization-assistant** (and its built-in guide) and **feedback-intake** read and write `project-management/research/`, falling back to a root `research/` where a project has one.

## 0.13.0 - 2026-10-09

**Skills now write their documents in `project-management/`, not at the project root.** This applies to new projects; an existing project keeps its root files and the skills keep using them there. Run `aistack update` in each project.

### Changed

- Only what a tool looks for stays at the project root: `CLAUDE.md`, `AGENTS.md`, `.claude/`, `.mcp.json`, `.gitignore`, `package.json`, and the release notes in `CHANGELOG.md`. Every other document a skill writes goes under `project-management/`. `skills/README.md` and `agents/README.md` make it the rule for new components.
- **research-workspace** adds only `research/` and `project-management/` at the root. Its guide is `project-management/README.md`, so a repo's own `README.md` is never written; `feature.md` and `rules/` move to `project-management/feature.md` and `project-management/rules/`. A workspace that already has them at the root keeps that layout.
- **project-kickoff** writes the product docs to `project-management/docs/` instead of `docs/`. In a project with several parts, each part's docs go in `project-management/docs/<part>/` (`web/`, `mobile/`) instead of `apps/<part>/docs/`; each part keeps its own `CLAUDE.md`. The `/plan` command and the `CLAUDE.md` it writes point there.
- **code-to-figma** and **figma-to-code** keep `FIGMA.md`, a generated `DESIGN.md` and the `figma-library-keys.md` / `figma-screen-keys.md` registries in `project-management/design/`. A project with `FIGMA.md` at the root and a root `design/` keeps using them.
- **ux-visualization-assistant** and **create-competitor-profile** point to the rules in `project-management/rules/`.

### Fixed

- **feedback-intake** refers to `CLAUDE.md` with its real spelling (`claude.md` is not found on a case-sensitive disk), and no longer links to a work board that nothing creates.

## 0.12.0 - 2026-10-09

**Run `aistack update` twice in each project this time.** The first run pulls 0.12.0; the second moves `scaffold-folder-structure` over to its new name, `research-workspace`. Commit the change. From 0.12.0 on, one run is enough.

### Changed

- **scaffold-folder-structure** is now **research-workspace**: the name says what it builds and looks after. What it does is unchanged. `aistack update` replaces the old copy in each project with the renamed skill — a symlinked install stays a symlink — and updates `.armaze-stack`. `aistack add scaffold-folder-structure` still works, with a note.

### Added


- `aistack init` starts a project in an empty folder or a freshly cloned repo, with its own Claude login. It runs `git init`, writes a `.gitignore` that keeps secrets and the login out of git, and creates `.claude-local/`: the project's own Claude config. It copies in your global settings, skills, agents, commands and MCP servers, and reinstalls your plugins. It never copies your login. Then it opens Claude Code on `/project-kickoff`. Re-running it only fills gaps.
- **project-kickoff** asks what you're building (website, SaaS, mobile app or a mix), the name, a one-line pitch and the stack, with more detail optional. Then it writes the project's AI layer, with no app code:
  - `CLAUDE.md`, with `AGENTS.md` linked to it;
  - product docs in `docs/`;
  - plans and decisions in `project-management/`;
  - `.claude/` settings that block reading secrets, plus `/plan` and `/decision` commands;
  - `.mcp.json` for the chosen stack;
  - the shelf skills that fit, from a pre-ticked list.

  It makes one commit and removes itself. The website stack defaults to Next.js, Tailwind and shadcn; the SaaS backend and the mobile stack are always asked.
- The armaze plugin's `claude` uses a project's `.claude-local/` automatically anywhere inside the project, including its git worktrees. It ignores any `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` or `CLAUDE_CODE_OAUTH_TOKEN` in your shell there, since those would override the project login. Run `ARMAZE_CLAUDE_GLOBAL=1 claude` to use your global setup instead.
- **research-workspace** writes the UX visualization guide to `research/internal/product-knowledge/ux-research/ux-visualization-guide.md`: how to pick between task flows, user flows, journeys, experience maps, IA, sitemaps, personas, empathy maps and competitive analysis, and how to draw each. It is only written if missing, so re-run the skill on an existing workspace to get it.
- **ux-visualization-assistant** carries the same guide built in, for projects without one. A project's own guide always wins.
- `aistack update` follows renamed skills and agents: it installs the new name, removes the old copy and updates the manifest.
- `aistack update` restarts itself when the pull brings a newer `aistack`, so the new version's rules apply in the same run.

### Fixed

- `aistack update` lists a renamed skill or agent as one removed and one added, instead of only the new name.

## 0.11.0 - 2026-10-09

**Project-management files now live in one folder, `project-management/`.** On each project: `aistack update`, then re-run `scaffold-folder-structure` if the project has a `project-management-log/`, say "update time tracker setup" in Claude Code, and commit the moved folders.

### Changed

- Every skill and agent keeps what it writes for project management under `project-management/` at the project root, spelled exactly that way. `skills/README.md` and `agents/README.md` make it the rule for new components.
- **scaffold-folder-structure** creates `project-management/` instead of `project-management-log/`. Re-run on an older workspace, it moves `project-management-log/` into `project-management/` — never overwriting a file already there, and listing any clash to merge by hand — and rewrites the workspace's references to the old name.
- **feedback-intake** writes to `project-management/feedback/`.
- **time-tracker** always installs into `project-management/tracking/` and no longer reuses a `Project Management` or `project_management` folder. Setup moves a tracker it finds under any other folder there, and repoints the hooks in `.claude/settings.json`, the `time:*` npm scripts, the `.gitignore` cache entry and the tracking readme. If `project-management/tracking/` already holds something, it stops and asks for the two to be merged by hand. Check flags a tracker still in another folder, and `--fix` moves it.

### Added

- **time-tracker** budget exceptions: `budgetExceptions` in `config.json` sets a different week cap — and can lift the month cap — for a stretch of days the person chooses. The PDFs print each week's own cap, say "no month cap" where it is lifted, and carry the exception's `note`, in the person's words, under the heading of every PDF touching its months.

### Fixed

- **time-tracker** reads transcripts and prompts from every Claude config folder the project may run from — `~/.claude`, the repo's own `.claude-local`, and any `CLAUDE_CONFIG_DIR` — so time spent in a session started with its own config folder is no longer measured as a few stray minutes.

## 0.10.0 - 2026-10-08

**Upgrade every computer on a project the same day.** A computer still on 0.9.0 cannot read the timesheets 0.10.0 writes. On each computer: `aistack update`, then say "update time tracker setup" in Claude Code, then commit and push the `tracking/` folder.

### Changed

- **time-tracker** keeps one timesheet per computer, named after the computer — `2026-10.<computer>.md` — with no git name or email involved. Setup no longer registers people; re-running it renames this computer's `2026-10.<person>.<computer>.md` files and deletes its `activity/` overlap records. `people` in `config.json` is no longer read and can be removed once every computer has upgraded.
- **time-tracker** counts every computer in full. Two computers working at the same time are two lots of hours; the overlap between one person's computers is no longer taken off. On an upgrade, setup writes `fullCountFrom` — the Monday of the month's first week — and days before it keep the hours already recorded.
- **time-tracker** names a computer's work only from the commits made on it, read from its git reflog, instead of from commits matching a person's email.
- **time-tracker** weekly PDFs cover whole Monday-to-Sunday weeks: the week of 28 September - 4 October is one PDF, `weekly/2026-09-28.<computer>.pdf`, no longer split at the month's edge. Client weeklies are `client/weekly/<first day>.pdf`. Setup lists the old `weekly/<YYYY-MM>/` folders as safe to delete.
- **time-tracker** never refuses a PDF for an unnamed day. Unnamed time shows as **Research & exploration**, typed Research, with its hours counted; the collector and the report list the days still unnamed.
- **time-tracker** manual hours are always Research and are scaled by the hours multiplier like measured time: 2h given at 1.5 is recorded as 3h, and the timesheet keeps both (`Research · manual, 2h given`). Entries already recorded stay as they are. `--type` is gone, bullets are optional, and an entry on another computer's timesheet is changed with `--computer <name>`.
- **time-tracker** turns a main-session turn started by an agent's task notification, rather than by a prompt, into agent time at `subagentMultiplier`.
- **time-tracker** asks for at least two outcome bullets on every measured task.

### Added

- **time-tracker** PDFs show the hour budget for their span: a week's hours done, remaining and total (`monthlyHours / 4`), a month's hours done so far, remaining and total. A computer's own PDFs put its hours beside the project's.
- **time-tracker** monthly PDFs have a week-by-week table — every week touching the month, upcoming ones included, each counting its whole week — and the days grouped under each week with subtotals.
- **time-tracker** groups each day's tasks by work type, with a subtotal per type.
- **time-tracker** records when each task happened and in which Claude Code session. The month file gains `When` and `Session` columns and, under each day, a legend naming every session by its opening prompt. A computer's own PDF prints `09:10-11:20 · studio · "fix checkout validation bug"` under each task; the client PDF never shows computers, sessions or times.
- **time-tracker** check warns about computers whose timesheets still have the older names, and about a leftover `people` key.

### Fixed

- **time-tracker** setup no longer reports a per-person install as starting today: the `trackFrom` fallback now reads two-part timesheet names.
- **time-tracker** hour budget leaves out timesheet-upkeep rows, so it matches the client PDF exactly.

## 0.9.0 - 2026-10-08

### Added

- **time-tracker** has an hour budget. Setup asks how many hours a month the project has — the whole team's budget, not each person's — and a week gets a quarter of it (160 a month is 40 a week). Weeks run Monday to Sunday, and the month is a hard ceiling too, so in a five-week month the last week gets whatever is left. It counts recorded hours from every timesheet in the checkout, measured and manual, after the multipliers. `node <tracking>/engine/budget.mjs` shows where this week and month stand.
- **time-tracker** checks in with every session. Setup installs three hooks in the project's `.claude/settings.json`: a session start re-measures the hours and shows the week's and month's hours used and left, a session end re-measures so the timesheet stays current, and each prompt is refused once the week or month is used up — until the next Monday or the 1st. "update tracker" still works, and starting Claude Code with `TIME_TRACKER_OVERRIDE=1` lets work through. Hours past the budget are still recorded as measured; a collect warns and the log notes it once per week or month.

- **time-tracker** has a check. Say **"check time tracker"** and it checks the project has the newest version, the monthly hours and multipliers are set, you and this computer are registered, the session hooks are installed and actually run, hours measure, the budget shows and a browser for PDFs is found - and fixes what it can by re-running setup, asking only for what it can't know (the monthly hours, a computer's name). After `aistack update`, say **"update time tracker setup"** to move a project to the new version the same way. A new setup ends with the check. Both phrases are upkeep: not counted as work, and they still work when the hours have run out. The README has step-by-step guides for a new setup and for updating.

### Changed

- **time-tracker** manual hours count toward the budget: an entry that would take its week or month over it is refused, with how much is left.
- **time-tracker** counts subagent time that no main session covered at its own multiplier, `subagentMultiplier`, 1.2 by default (it was counted at its actual length).
- **time-tracker** no longer asks for the hours multiplier: new installs record measured hours at 1.5. Existing installs keep theirs. Re-running setup on an existing install adds `subagentMultiplier`, installs the hooks (replacing the old SessionStart one), and asks for the monthly hours if the config has none.

## 0.8.1 - 2026-10-05

### Fixed

- **time-tracker** no longer crashes on long sessions. A session with a very large number of timestamps made "update tracker" fail with `RangeError: Maximum call stack size exceeded`. It now completes, with exactly the same hours as before.

### Added

- **time-tracker** has a plain-language `README.md` explaining what it does, how to set it up and what to say to it.

## 0.8.0 - 2026-10-05

### Added

- **time-tracker** says what kind of work each task was. Every task carries a work type — Design, Development, Research, Content, QA/Testing, Meetings, Project management or Other by default, from a `categories` list in `config.json` that each project can edit. The labelling pass picks the type from the same commits and prompts it names the task from. Every PDF shows the type next to each task and a new **By type** table with how much of each type was logged by hand. Days named before this get their types on the next "update tracker"; a missing type only warns.
- **time-tracker** records manual hours. Work done away from Claude Code — an afternoon in Figma, a sketch on paper — can't be measured from transcripts, so every "update tracker" now asks whether there was any. Describe it in your own words; Claude works out the date, type, task and hours, shows them back, and records them once you confirm. Say "log manual hours" to add some without an update, or ask to change or remove one. Manual hours are recorded exactly as given (the multiplier never applies), never trimmed by later updates, and tagged **Manual** on every PDF, client one included. Each one is logged with your own description.

### Changed

- **time-tracker** keeps one timesheet per person per computer. Setup names each computer once (kept in `~/.claude/time-tracker/machine.json`, for every project), and every file it writes carries the person and the computer — `2026-10.<person>.<computer>.md` — so using the tracker on two computers no longer causes git conflicts or overwrites one computer's hours with the other's. Each computer commits the time it counted (`activity/`), and an hour with Claude running on two of your computers at once is counted once. Your personal PDF adds all your computers together, and a day still unnamed on another computer holds it back, naming that computer. The first computer to re-run setup takes your existing timesheet; upgrade one computer, push, and pull on the others before running setup there.
- **time-tracker** client PDF merges the same task on the same day only when its work type matches too; a row pooling manual and measured hours is tagged **Partly manual**.

## 0.7.1 - 2026-10-01

### Fixed

- **time-tracker** keeps counting a day after it has been named. Running "update tracker" partway through a day used to freeze it: a named past day was treated as settled, and the rest of the day's work was never counted. A named day now still grows. Its rows stay as written and the extra time shows up as a new `Unlabelled` row to name. It still never shrinks.
- **time-tracker** counts subagent time. Background agents that keep working while their main session sits idle were dropped. Their time is now added at its actual length, without the hours multiplier, and only where no main session was already counting it.
- **time-tracker** no longer bills for its own upkeep. Time spent in "update tracker" runs is left out of the hours, and a timesheet row such as "Timesheet update" never reaches a monthly, weekly or client PDF. Day totals on the PDF always equal the rows shown.

## 0.7.0 - 2026-09-25

### Changed

- **rooter** rows say what kind of thing they open. Each destination has a `kind` — `app`, `system`, `deck`, `version` or `mobile` — shown as a small icon and a tag above the name, set in the design system's own label style (tracked uppercase mono when it has none), from a fixed icon set that ships with the skill (`skills/rooter/assets/icons/`). The tag is now stacked above the name at every width, with the arrow on the tag line.
- **rooter** tracks where each destination stands. An optional `status` — `chosen`, `in-progress` or `archived` — shows in the tag line: a chosen version moves to the top in the accent colour, archived rows move to the bottom, muted, and are still reachable. A destination with an `added` date shows `new` for 14 days, then drops it without an edit. "The client chose V2" is a one-line config change.
- **rooter** links to other sites. A destination's `href` can be a full URL, so a deck, a Figma file or a TestFlight build can sit alongside the site's own routes. Detection never finds these; they come from the instruction or the checklist's **Other**.
- **rooter** checks its links. Every run requests each route and URL before asking and again after building, and reports anything that doesn't resolve instead of linking to nothing.
- **rooter** names and footers follow house style. Every destination name is in Title Case (`Release Notes`, not `Release notes`), keeping a brand's own casing (`FloorZap`, `iOS`). The footer is always `Copyright © {year} {project}`: the year is computed when the page renders, and the project name is taken from what the product calls itself, then confirmed in the proposal, or asked for when it isn't clear.
- **rooter** marks its defaults instead of claiming to pre-tick them. The selection can't start ticked, so labels say `(in Rooter)` or `(recommended)`, and unticking an `(in Rooter)` row removes it.
- **time-tracker** works for teams. Each person on a project keeps their own timesheet: setup registers whoever runs it by `git config user.name` and `user.email`, and their files carry that id — `2026-09.<id>.md`, `2026-09.<id>.pdf`, `log.<id>.jsonl` — so teammates sharing a repo never overwrite each other's days. Only commits authored under the person's own email(s) are used to name their days, so a teammate's work no longer lands on your timesheet. An existing single-person timesheet is renamed to the first person who re-runs setup. The email lives only in `config.json` and never appears on the PDF.
- **time-tracker** PDFs now say what the time delivered. Under each task sit 2–4 plain-language outcome bullets ("Customers get a receipt email after every purchase") written from that day's commits, commit messages and prompts. **Update tracker** also adds bullets to days that were named before this change.
- **time-tracker** writes weekly PDFs alongside the monthly one. Each update writes this month's PDF and this week's, into `<tracking>/weekly/<month>/`. Weeks run Monday to Sunday and are split at the month's edge, so a month's weekly PDFs always add up to its monthly PDF. `report.mjs --all-weeks` rewrites every week of a month.
- **time-tracker** writes a client PDF — the one to send. Every timesheet in the tracking folder is merged into `<tracking>/client/<month>.pdf` (plus weekly ones), with no names and nothing that shows how many people worked: hours are summed per day and the same task on the same day becomes one row. The terminal lists whose timesheets were merged and when each was last updated, and a teammate's unnamed day holds the client PDF back rather than leaving their hours out.

## 0.6.0 - 2026-09-16

### Added

- **code-to-figma** skill — pushes a screen or component from the codebase into a Figma file (code → design). Writing to Figma is gated: nothing is touched unless you ask, you pick which frames change, you see the changes before they are made, and anything bigger than a small tweak asks whether to back up the old frame first. Screens are built from the components, variables and styles already in the file rather than raw values, and what was pushed is recorded so the next run knows what the file holds. Handles a single file or a published design-system library with a separate screens file.
- **figma-to-code** skill — brings a design into the codebase (design → code): syncs the design-system tokens, implements a new screen or mirrors changes to an existing one, or unpacks a claude.ai/design handoff link. It only reads Figma, previews the code changes before writing, and maps design values back to the project's tokens instead of pasting raw colours and sizes.

Both skills keep project-specific details — the Figma file, viewport, token paths, component catalogue — in a `FIGMA.md` at the project root, and offer to create one on first run.

### Changed

- **time-tracker** keeps a run log. Each **update tracker** now ends by adding one line to `<tracking>/log.jsonl` — the days it named, the commits it used, the month total — so a client-facing timesheet has an audit trail, and the next run knows which commits it has already seen. Labelling reads only the days that still need a name (`cache/<month>.pending.json`) instead of the whole month, including days with hours but no commits.

## 0.5.0 - 2026-09-07

### Added

- **rooter** skill — builds and maintains a Rooter: one permanent client-facing URL at the root of a deployed project that hands the client on to the right experience (version, product vs design system, persona). One flow every run — analyse, ask which destinations belong as a real multi-select, propose the tree, then build only after confirmation. Collapses to a redirect when a level has fewer than two destinations. Config-driven, so adding a version is a one-line edit; inherits the product's branding, and never commits.

### Changed

- **time-tracker** loses its on/off switch. Hours are still measured after the fact from Claude Code session transcripts, but the boundary is now a `trackFrom` date written into `config.json` at setup rather than something you start and stop. **Update tracker** becomes the single main mode — remeasure the hours, name every unnamed day from that day's commits, re-render the PDF — replacing `start`, `stop` and `update tracking`. Nothing runs in the background any more: the `SessionStart` hook is gone, along with the `state`, `track` and `session-start` engine scripts.

## 0.4.0 - 2026-09-07

### Changed

- **An agent can now be a directory.** Alongside `agents/<name>.md`, `agents/<name>/` with an `AGENT.md` entry document (a `SKILL.md` is accepted too) is discovered, listed and installed — copied as a whole folder into the target's agents directory — so an agent that carries prompts, config or reference docs no longer has to be flattened into one file.
- **website-weaver** ships as its own directory: `SKILL.md`, the `model-matrix.yaml` routing table, the `prompts/` for the draft-decomposition and review stages, and the design docs under `docs/specs/`.

## 0.3.0 - 2026-09-07

### Added

- **whats-new-generator** skill — builds and maintains a project's changelog. Scaffolds a whole "what's new" system into a project that has none (typed data layer, root `CHANGELOG.md`, changelog page, last-seen-version modal, nav or footer entry), seeds entries from git history and proposes a semver bump; also updates an existing changelog with recent work and drafts reader-facing update posts. Adapts to the target's actual language, framework and router.
- **website-weaver** agent — orchestrates website and digital product delivery. Turns a project brief into a dependency-ordered task DAG, assigns each task the Claude model and effort level suited to it, and flags the decisions that need human sign-off. Carries the model matrix, the DAG schema and both planning stages (draft decomposition, review and refinement) in one file. The first agent on the shelf.

### Changed

- **time-tracker** is now language-agnostic and switchable. It sets itself up in any project — no `package.json`, no build tooling — under `<project-management>/tracking/`, and tracking is something you turn on and off rather than a system that is simply present. Labelling and stack detection moved into `references/`.

## 0.2.0 - 2026-09-01

### Added

- **time-tracker** skill — sets up automatic, transcript-based time tracking on a Node/npm project: a measurement engine under `lib/time-tracking/`, a labelling agent, a `SessionStart` hook, a project rule and a `project-management/` folder with monthly timesheets and a PDF report. No timer to start or stop; hours are measured from Claude Code session transcripts, and only the task labels are written by hand (or by the agent). Idempotent setup script; the scheduled labelling runs are `orca automations` you register once per machine.

### Changed

- Components the current project already has are marked with a green check instead of an `installed ·` tag in the description: before the name on the **list** tab (which also drops the `▶` every row used to carry), right after the name on the **add** tab and in the numbered menu.

## 0.1.4 - 2026-09-01

### Added

- **`aistack` is now an app.** Run it bare in a terminal and it clears the screen and opens on the **add** tab; `tab` (and `shift-tab`) cycle through `list · add · update · help`, wrapping at either end. `aistack list`, `aistack update` and `aistack help` open the same app on their own tab. On **update**, `⏎` pulls the stack and refreshes the project; on **list**, `⏎` jumps to add; `q` quits. Piped or scripted, every command behaves as before — plain output, direct install, immediate update.

### Changed

- The whole frame is redrawn from the top on each key instead of moving the cursor back up, and frames are built without spawning subshells, so the app feels instant.
- The status line trims its left side instead of wrapping when the terminal is narrow.

## 0.1.3 - 2026-09-01

### Changed

- The banner layout (`list`, the `add` picker, `help`) now sits inside a rounded box of fixed width — 100 columns, or the terminal width if narrower — centred in the window, instead of stretching across it. Long descriptions are trimmed with an ellipsis. `ARMAZE_WIDTH=N` changes the width, `ARMAZE_ALIGN=left` pins the box to the left.

### Fixed

- `aistack add --link` with the interactive picker now symlinks as asked; it used to copy, because the picker's mode overwrote the copy/link mode.

## 0.1.2 - 2026-09-01

### Changed

- The wordmark now reads `ARMAZE AI STACK`; terminals too narrow for it get a plain-text heading instead.
- **`aistack update` now does everything:** it pulls the latest stack, shows what was added, changed or removed, then re-copies what the project previously added. `self-update` and `update --pull` are gone. If the stack can't be pulled it says so and carries on; outside a project it just pulls.
- The setup one-liner in the README now ends with `&& exec zsh`, so the shell is reloaded as part of the command.
- `install.zsh` no longer reloads the shell itself (`--no-exec` is gone); the `exec zsh` in the setup command does that, without a nested shell.

## 0.1.1 - 2026-09-01

### Added

- **A new look for `list`, the `add` picker and `help`.** An `AISTACK` wordmark, a command bar with the current command highlighted, sections with icons, right-aligned stack info, descriptions cut to the terminal width, and a key legend at the bottom. Only when you are looking at a terminal — piped output and `list --names` stay plain. Nerd Font glyphs when you have one, ASCII markers otherwise.
- **Arrow-key picker.** `aistack add` now opens an in-place checklist: `↑↓` (or `j`/`k`) move, `space` toggles, `a` toggles everything, `⏎` adds, `q` cancels. It marks components the target already has. No fzf needed.
- `ARMAZE_PICKER=menu|fzf`, `ARMAZE_ICONS=0`, `ARMAZE_UI=0/1` and `CLICOLOR_FORCE=1` to adjust the picker and the display.
- `aistack --version` / `-v` now appear in `help`, the README and tab completion.
- `install.zsh` finishes by reloading your shell (`exec zsh`) when run from a terminal, so the command works immediately; `--no-exec` skips that.

### Changed

- fzf is no longer used automatically; set `ARMAZE_PICKER=fzf` if you prefer fuzzy search.
- **The command is now `aistack`** (was `armaze`). The oh-my-zsh plugin, `plugins+=(armaze)`, the `.armaze-stack` manifest and the `ARMAZE_*` variables keep their names.

## 0.1.0 - 2026-09-01

The first release: a working shelf, the command to shop from it, and a one-line setup for every member's shell.

### Added

#### Getting set up

- **One-line install.** `curl -fsSL https://raw.githubusercontent.com/armazelabs/armaze-ai-stack/main/install.zsh | zsh` clones the stack to `~/armaze-ai-stack`, links the oh-my-zsh plugin, and asks before enabling it in `~/.zshrc` (a backup is kept). Running it again pulls the latest stack instead of cloning. `./install.zsh` from an existing checkout does the same without cloning.
- **oh-my-zsh plugin.** Puts `armaze` on your PATH in every shell, with tab completion for commands, options and skill names.

#### The `armaze` command

- **`armaze list`** shows every skill and agent on the shelf with its one-line description.
- **`armaze add`** installs components into the project you are standing in — or any folder, even an empty one. With no names it opens a multi-select picker (fuzzy with fzf, a numbered menu without); with names it is non-interactive. Choose the Claude Code layout (`.claude/skills/`, the default), a neutral `.ai/` layout, or your own directories. `--link` symlinks instead of copying while you develop a skill; `--force` overwrites without asking.
- **`armaze update`** re-copies whatever a project previously added, so it picks up newer versions from the stack. Components that already match are left untouched.
- **`armaze self-update`** fast-forwards your stack checkout and lists which skills and agents were added, changed or removed. `armaze update --pull` does both in one go.
- **`.armaze-stack` manifest.** Every install is recorded in a small, committable file at the project root — what came from where, at which stack revision, and when — so teammates can see a component's origin and `armaze update` knows what to refresh.

#### Skills on the shelf

Eight skills, brought over from the TruckerZoom project:

- **changelog-generator** — turns git history into user-facing release notes.
- **content-research-writer** — research, citations and section-by-section feedback for long-form writing.
- **create-competitor-profile** and **update-competitor-profile** — build a sourced competitor profile from scratch, and keep existing ones current through a draft-then-approve flow.
- **feedback-intake** — captures and categorises project feedback, deduplicates it, and imports from FigJam boards.
- **remove-ai-marks** — strips AI provenance marks (invisible Unicode, C2PA/EXIF/XMP metadata) from text and files.
- **scaffold-folder-structure** — scaffolds and enforces a product-design documentation workspace.
- **ux-visualization-assistant** — picks and generates the right UX artifact (user flows, journeys, sitemaps, personas) as Mermaid diagrams or tables.

#### Repository

- `skills/`, `agents/`, `workflows/` and `tools/` directories, each with a README of authoring conventions. Only skills and agents are installable in this release.

### Known limitations

- `feedback-intake`, `ux-visualization-assistant`, `create-competitor-profile` and `update-competitor-profile` expect the folder layout that `scaffold-folder-structure` creates (`research/…`, `project-management-log/…`). Run that skill first, or adjust the paths in the copied `SKILL.md`.
- `agents/` is empty; `workflows/` and `tools/` are not wired into `armaze` yet.
