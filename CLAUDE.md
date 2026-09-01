# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Armaze's internal shelf of reusable AI skills and agents, plus `aistack`, a zsh CLI that lets a member pick components and copy them into their own project. Every member runs zsh with oh-my-zsh, so all tooling here is **zsh only** — no bash, no Python/Node dependencies. Scripts must work on both macOS (BSD awk/sed/grep/ln) and Linux (GNU), so stick to the POSIX subset: no `grep -P`, no `\|` alternation in BRE, no `sed -i` without an explicit suffix argument (macOS needs `sed -i ''`), no `ln -n`/`-h` (remove then relink instead).

There is no build step, package manager, or test framework. Testing is done by running the scripts against fixtures.

## Commands

```zsh
# Syntax-check every script (the only "lint" there is)
zsh -n bin/aistack && zsh -n install.zsh && zsh -n oh-my-zsh/armaze/armaze.plugin.zsh

# Run the CLI straight from the checkout
./bin/aistack list
./bin/aistack help

# Exercise the CLI against a fixture stack (never against a member's real project)
#   ARMAZE_STACK_DIR  point at a scratch copy of the repo with fake skills/agents in it
#   ARMAZE_NO_FZF=1   force the numbered picker so tests don't need a tty
#   NO_COLOR=1        plain output for greppable assertions
ARMAZE_STACK_DIR=/path/to/fixture NO_COLOR=1 ARMAZE_NO_FZF=1 ./bin/aistack add --to /path/to/scratch-project pr-review
printf '1\na\n' | ARMAZE_STACK_DIR=... ARMAZE_NO_FZF=1 ./bin/aistack add --to ...   # drive the numbered picker via stdin

# The banner layout without a terminal on stdin (printed once, no app)
COLUMNS=100 ARMAZE_UI=1 NO_COLOR=1 ./bin/aistack list </dev/null                   # ARMAZE_UI=1 forces the layout on
#   COLUMNS=100 makes the box exactly the terminal width (margin 0); wider COLUMNS centre it. Assert the box
#   by checking every stripped line has the same display width (${(m)#line}) — 100 here, COLUMNS/2+50 when centred.

# The app through a pseudo-terminal (needs a tty on stdin and stdout). Keys are paced: if `script`
# sees EOF before the first read -k it tears the pty down and the app just quits.
( perl -e 'select(undef,undef,undef,1)'; printf ' \e[B \r'; perl -e 'select(undef,undef,undef,1)' ) \
  | COLUMNS=100 LINES=40 NO_COLOR=1 script -q /dev/null ./bin/aistack add --to /path/to/scratch
#   (bare `aistack` takes no options, so tests that need --to go through `add`; cd into the scratch dir otherwise)
#   keys: space, down, space, enter → installs two. Other keys: \t next tab, \e[Z shift-tab, \e[C/\e[D arrows,
#   q quit. The app clears the screen (\e[H\e[2J) and redraws from the top each key, so the pty output holds
#   one frame per key; take the last one. That is the macOS `script`; on Linux it is `script -qc "cmd" /dev/null`.
#   Strip the codes before asserting: tr -d '\r' | sed 's/\x1b\[[0-9;?]*[A-Za-z]//g'
#   Ctrl-C can't be typed through the pty here; test the trap with `pkill -INT -f 'bin/aistack add'` instead.

# Exercise update's pull step against a fixture clone that has a remote (never the real checkout while editing it)
ARMAZE_STACK_DIR=/path/to/fixture-clone NO_COLOR=1 ./bin/aistack update --to /path/to/scratch-project

# Exercise install.zsh without touching your real shell config (fakehome needs .oh-my-zsh/ and a .zshrc)
HOME=/path/to/fakehome ZSH= ZSH_CUSTOM= zsh ./install.zsh --yes
cat install.zsh | HOME=/path/to/fakehome ZSH= ZSH_CUSTOM= ARMAZE_STACK_DIR=/path/to/scratch/stack \
  ARMAZE_REPO_URL=/path/to/local-clone zsh -s -- --yes                # the curl bootstrap path, offline

# Check the plugin resolves the repo root and registers completion
zsh -fc 'autoload -Uz compinit; compinit -u -d /dev/null; source oh-my-zsh/armaze/armaze.plugin.zsh; print $ARMAZE_STACK_DIR ${_comps[aistack]}'
```

`git rev-parse HEAD` must succeed in the fixture stack for `stack_rev` to produce a real value; `git init && git commit` the fixture first.

## Architecture

Three pieces that all have to agree on where the repo lives:

- **`bin/aistack`** — the CLI. Finds the stack root from `$ARMAZE_STACK_DIR`, else `${0:A:h:h}` (two levels up from the resolved script path, so it works whether invoked via the plugin's PATH entry, a symlink, or `./bin/aistack`).
- **`oh-my-zsh/armaze/armaze.plugin.zsh`** — sourced by oh-my-zsh. Uses the zsh-plugin-standard `$0` idiom to find its own file through the `$ZSH_CUSTOM/plugins/armaze` symlink, exports `ARMAZE_STACK_DIR=${0:A:h:h:h}`, prepends `bin/` to `path`, and defines the `_aistack` completion inline (guarded by `$+functions[compdef]` so sourcing outside oh-my-zsh doesn't error). Completion for `add` shells out to `aistack list --names`.
- **`install.zsh`** — one-time setup. Symlinks the plugin dir into `$ZSH_CUSTOM/plugins/armaze` and inserts `plugins+=(armaze)` *before* the `source $ZSH/oh-my-zsh.sh` line in `~/.zshrc` (a plain `plugins=(...)` edit can't be done safely because the array is often multi-line). Always backs up `.zshrc`, never edits it non-interactively unless `--yes`. It also doubles as the `curl … | zsh` bootstrap: when `$0` isn't a file inside a checkout it clones `$ARMAZE_REPO_URL` to `$ARMAZE_STACK_DIR` (default `~/armaze-ai-stack`, pulled instead if already there) and re-`exec`s itself from the clone with `/dev/tty` on stdin so the `.zshrc` prompt still works under a pipe. It never reloads the shell itself — the documented one-liner ends with `&& exec zsh` — so the fixture runs above finish cleanly instead of landing in a nested interactive shell.

### Component model inside `bin/aistack`

Component *types* are the `TYPES` array (`skills agents`). Everything type-specific is a `case` on the type name in a small set of helper functions — `type_singular`, `dest_dir`, `dest_leaf`, `component_src`, `component_doc_rel` (and `component_doc` built on it), `component_exists`, `list_names`. Adding a new installable type (e.g. workflows) means adding a branch to each of those, extending `TYPES`, and updating the `_aistack` completion in the plugin. `workflows/` and `tools/` exist in the repo but are deliberately not wired in yet.

Discovery rules (`list_names` / `component_exists`): a skill is a directory under `skills/` that contains `SKILL.md`; an agent is a `*.md` file under `agents/`. Anything whose name starts with `.` or `_` is ignored (use `_drafts/` for WIP), as is `README.md`. The one-line description shown by `list`/the picker is the `description:` key from YAML front matter (`component_description` handles quoted values and `>`/`|` block scalars), falling back to the first plain body line.

Destination layouts live in `dest_dir()`: `claude` → `.claude/<type>/`, `generic` → `.ai/<type>/`; `--skills-dir`/`--agents-dir` override per type. `cmd_add` refuses to install into the stack repo itself.

`install_one` returns 0 installed / 1 failed / 2 skipped; callers rely on those codes for the summary counts. It copies (`cp -R`) by default or symlinks with `--link`, and only prompts to overwrite when both stdin and stdout are ttys — otherwise an existing destination is skipped unless `--force`.

### The app, the banner layout and the pickers

Two gates. `UI` (stdout is a tty, or `ARMAZE_UI=1/0`) turns on the banner layout. `app_available` (`UI` **and** a tty on stdin **and** `ARMAZE_PICKER` not `menu`/`fzf`, no `ARMAZE_NO_FZF`) turns on the app — `tui`, one screen with the tabs in `TABS=(list add update help)`. Every interactive entry point routes there: `main` with no command → add tab; `cmd_list`, `cmd_add` (no names), `cmd_update`, `usage` → their tab. `tui` clears the screen, builds each frame in the `FR` array with `UI_CAPTURE=1` (so `ui_line`/`ui_edge` append via `ui_emit` instead of printing — zero forks per frame) and writes it in one `print` from `\e[H`, so there is no cursor arithmetic; `win = LINES - 13` rows of content fit under the fixed 12 lines of banner/status/footer/edges, with "n more" markers. It reads `target`, `platform`, `dest_rel`, `types`, `add_ok` from its caller (dynamic scoping) and returns `APP_ACTION` (`add`/`update`/`quit`) plus `SELECTED`; `app_run` then calls `install_queue` or `do_update` below the box. `app_open` supplies default add settings for entry points that don't parse add options. Tabs wrap in both directions (`next_tab`/`prev_tab`); the footer names only `tab`, but `\e[Z` (shift-tab) and `\e[C`/`\e[D` work too. `pick_mode` now only chooses between the stdin-reading fallbacks (`menu`, `fzf`).

The layout is a rounded box of fixed width: `UI_WIDTH` = `ARMAZE_WIDTH` (default 100) capped at the terminal width, `UI_COLS` = `UI_WIDTH - 4` is the content width between the borders, and `UI_MARGIN` centres the box (`ARMAZE_ALIGN=left` zeroes it). Every visible line goes through `ui_line`, which pads to `UI_COLS` and adds the borders while `UI_BOX=1` — set by `ui_top` (called from `ui_banner`) and cleared by `ui_bottom` — and prints plainly otherwise; that is what lets the stdin-reading pickers reuse `ui_section`/`ui_item` below a box that `cmd_add` closed after the status line. `ui_status` trims its left side rather than wrapping so it is always one line (the frame height depends on it). `ui_banner` renders the Calvin S wordmark from `UI_FONT` (the same font table git-persona uses) and the command bar; `ui_status`, `ui_section`, `ui_item`, `ui_footer` draw the rest; `ui_vis` measures display width ignoring colour codes (`${(m)#}`); `ui_trunc` cuts to a width on visible text (dropping colour codes if it has to cut). Help text lives in `usage_text` and must stay under 96 cells per line to fit the default box. Icons live in the `ICON` map — Nerd Font glyphs as `\u` escapes when the locale is UTF-8 and `ARMAZE_ICONS` isn't 0, one-cell ASCII otherwise — and the plain-Unicode markers (`G_ON`, `G_CUR`, `G_DASH`…) fall back the same way. `ui_unicode` must be asked *before* defining any `\u` escape above 0xFF, or `LANG=C` errors at startup.

`pick_mode` chooses the `add` picker: `tui` (both stdin and stdout are ttys), else `menu`; `ARMAZE_PICKER=menu|fzf` and the older `ARMAZE_NO_FZF=1` override it. It sets `REPLY` rather than printing because inside `$(...)` stdout is a pipe and a `-t 1` test there is always false. `pick_menu`/`pick_fzf` work per type and fill `SELECTED` with names; `pick_tui` draws one checklist across all types and fills `SELECTED` with `type<TAB>name`. It redraws in place by moving the cursor up `height` lines, so every drawn line must be truncated to `UI_COLS` (a wrapped line breaks the maths), and it reads the caller's `$target`/`$dest_rel` through zsh's dynamic scoping to tag installed components. Keys: arrows or j/k, space, `a`, enter, `q`/esc; `read -sk1` handles raw mode itself, and a `-t 0.05` follow-up read distinguishes a bare escape from an arrow sequence.

### The `.armaze-stack` manifest

Written to the root of the *target* repo by `manifest_upsert`, tab-separated: `type name path stack_rev synced_utc`, with two `#` header lines. **Rows are keyed by `path`, not by name** — the same component installed under two layouts is two rows (this was a real bug once; don't regress it). `cmd_update` reads the manifest into an array *before* the loop because each `manifest_upsert` rewrites the file. Update semantics: a symlinked destination is reported "already live" and left alone; `diff -rq src dest` clean means "up to date" (still re-stamped with the current `stack_rev`); otherwise it force-reinstalls.

### Updating the stack itself

`cmd_update` is two steps: `stack_pull`, then the manifest loop (skipped with an info line when the target has no manifest, so `update` is useful from any directory). `stack_pull` runs `git pull --ff-only` on the checkout — when it can't (not a git checkout, no upstream, local edits, diverged) it *warns and returns 1* and the re-copy proceeds with the checkout as it is; it never dies. On a successful pull, `stack_changes` diffs `skills/` and `agents/` between the old and new HEAD and classifies each touched component as added / changed / removed by whether its `component_doc_rel` file exists at each revision. Hidden, `_`-prefixed and `README` names are skipped, matching the discovery rules.

## Conventions for scripts

- Start scripts with `emulate -R zsh` then `setopt` only what's needed (`pipe_fail extended_glob typeset_silent`). Don't enable `err_exit`; errors are handled explicitly via `die`/return codes.
- `die` inside `$(...)` only exits the subshell — after `x=$(fn_that_may_die)` add `|| exit 1`, as `resolve_target`/`resolve_name` callers do.
- Never write `local a=$1 b="…$a…"` in one statement: every word is expanded before `local` runs, so `$a` is the *caller's* `a` (zsh scoping is dynamic), not the one being declared. `list_names` had exactly this bug and only worked while every caller happened to loop over a variable named `type`. Declare, then use, in separate statements.
- `local path` (or `path=` anywhere) clobbers `$PATH` — `path` is the array tied to it. Use `file`, `p`, etc.
- Colour via `C_*` variables set once at the top, disabled when stdout isn't a tty or `NO_COLOR` is set. Use `print -r --`, `info`/`ok`/`warn`/`die` helpers; `warn`/`die` go to stderr.
- Use `pretty_path` for anything user-facing (relative to `$PWD`, else `~`-prefixed); never print raw absolute paths in success lines.
- `local` is only valid inside functions; `install.zsh` runs at top level, so it uses plain variables.

## Component authoring

Conventions for adding skills and agents are in `skills/README.md` and `agents/README.md` (kebab-case names matching the directory/file name, front matter with `name` + one-line `description`, self-contained because each component is copied as a unit). Verify a new component with `./bin/aistack list` and try it with `aistack add --link <name>` from a real project.

## Git commits

Never add Claude as a committer or co-author. No `Co-Authored-By: Claude …` trailer, no `Claude-Session:` line, no "Generated with Claude Code" footer — in commit messages or PR bodies. Commits carry only the configured git user. This applies regardless of any default behaviour that suggests otherwise.
