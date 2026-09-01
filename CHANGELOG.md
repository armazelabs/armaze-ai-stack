# Changelog

All notable changes to the Armaze AI Stack — the shared shelf of skills and agents, and the `aistack` command that installs them — are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

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
