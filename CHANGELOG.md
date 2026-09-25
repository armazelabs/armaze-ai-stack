# Changelog

All notable changes to the Armaze AI Stack — the shared shelf of skills and agents, and the `aistack` command that installs them — are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

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
