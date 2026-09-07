# Changelog

All notable changes to the Armaze AI Stack — the shared shelf of skills and agents, and the `aistack` command that installs them — are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

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
