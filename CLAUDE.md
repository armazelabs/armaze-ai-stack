# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Armaze's internal shelf of reusable AI skills and agents, plus `armaze`, a zsh CLI that lets a member pick components and copy them into their own project. Every member runs zsh with oh-my-zsh, so all tooling here is **zsh only** — no bash, no Python/Node dependencies. Scripts must work on both macOS (BSD awk/sed/grep/ln) and Linux (GNU), so stick to the POSIX subset: no `grep -P`, no `\|` alternation in BRE, no `sed -i` without an explicit suffix argument (macOS needs `sed -i ''`), no `ln -n`/`-h` (remove then relink instead).

There is no build step, package manager, or test framework. Testing is done by running the scripts against fixtures.

## Commands

```zsh
# Syntax-check every script (the only "lint" there is)
zsh -n bin/armaze && zsh -n install.zsh && zsh -n oh-my-zsh/armaze/armaze.plugin.zsh

# Run the CLI straight from the checkout
./bin/armaze list
./bin/armaze help

# Exercise the CLI against a fixture stack (never against a member's real project)
#   ARMAZE_STACK_DIR  point at a scratch copy of the repo with fake skills/agents in it
#   ARMAZE_NO_FZF=1   force the numbered picker so tests don't need a tty
#   NO_COLOR=1        plain output for greppable assertions
ARMAZE_STACK_DIR=/path/to/fixture NO_COLOR=1 ARMAZE_NO_FZF=1 ./bin/armaze add --to /path/to/scratch-project pr-review
printf '1\na\n' | ARMAZE_STACK_DIR=... ARMAZE_NO_FZF=1 ./bin/armaze add --to ...   # drive the picker via stdin

# Exercise self-update against a fixture clone that has a remote (never the real checkout while editing it)
ARMAZE_STACK_DIR=/path/to/fixture-clone NO_COLOR=1 ./bin/armaze self-update

# Exercise install.zsh without touching your real shell config (fakehome needs .oh-my-zsh/ and a .zshrc)
HOME=/path/to/fakehome ZSH= ZSH_CUSTOM= zsh ./install.zsh --yes
cat install.zsh | HOME=/path/to/fakehome ZSH= ZSH_CUSTOM= ARMAZE_STACK_DIR=/path/to/scratch/stack \
  ARMAZE_REPO_URL=/path/to/local-clone zsh -s -- --yes                # the curl bootstrap path, offline

# Check the plugin resolves the repo root and registers completion
zsh -fc 'autoload -Uz compinit; compinit -u -d /dev/null; source oh-my-zsh/armaze/armaze.plugin.zsh; print $ARMAZE_STACK_DIR ${_comps[armaze]}'
```

`git rev-parse HEAD` must succeed in the fixture stack for `stack_rev` to produce a real value; `git init && git commit` the fixture first.

## Architecture

Three pieces that all have to agree on where the repo lives:

- **`bin/armaze`** — the CLI. Finds the stack root from `$ARMAZE_STACK_DIR`, else `${0:A:h:h}` (two levels up from the resolved script path, so it works whether invoked via the plugin's PATH entry, a symlink, or `./bin/armaze`).
- **`oh-my-zsh/armaze/armaze.plugin.zsh`** — sourced by oh-my-zsh. Uses the zsh-plugin-standard `$0` idiom to find its own file through the `$ZSH_CUSTOM/plugins/armaze` symlink, exports `ARMAZE_STACK_DIR=${0:A:h:h:h}`, prepends `bin/` to `path`, and defines the `_armaze` completion inline (guarded by `$+functions[compdef]` so sourcing outside oh-my-zsh doesn't error). Completion for `add` shells out to `armaze list --names`.
- **`install.zsh`** — one-time setup. Symlinks the plugin dir into `$ZSH_CUSTOM/plugins/armaze` and inserts `plugins+=(armaze)` *before* the `source $ZSH/oh-my-zsh.sh` line in `~/.zshrc` (a plain `plugins=(...)` edit can't be done safely because the array is often multi-line). Always backs up `.zshrc`, never edits it non-interactively unless `--yes`. It also doubles as the `curl … | zsh` bootstrap: when `$0` isn't a file inside a checkout it clones `$ARMAZE_REPO_URL` to `$ARMAZE_STACK_DIR` (default `~/armaze-ai-stack`, pulled instead if already there) and re-`exec`s itself from the clone with `/dev/tty` on stdin so the `.zshrc` prompt still works under a pipe.

### Component model inside `bin/armaze`

Component *types* are the `TYPES` array (`skills agents`). Everything type-specific is a `case` on the type name in a small set of helper functions — `type_singular`, `dest_dir`, `dest_leaf`, `component_src`, `component_doc_rel` (and `component_doc` built on it), `component_exists`, `list_names`. Adding a new installable type (e.g. workflows) means adding a branch to each of those, extending `TYPES`, and updating the `_armaze` completion in the plugin. `workflows/` and `tools/` exist in the repo but are deliberately not wired in yet.

Discovery rules (`list_names` / `component_exists`): a skill is a directory under `skills/` that contains `SKILL.md`; an agent is a `*.md` file under `agents/`. Anything whose name starts with `.` or `_` is ignored (use `_drafts/` for WIP), as is `README.md`. The one-line description shown by `list`/the picker is the `description:` key from YAML front matter (`component_description` handles quoted values and `>`/`|` block scalars), falling back to the first plain body line.

Destination layouts live in `dest_dir()`: `claude` → `.claude/<type>/`, `generic` → `.ai/<type>/`; `--skills-dir`/`--agents-dir` override per type. `cmd_add` refuses to install into the stack repo itself.

`install_one` returns 0 installed / 1 failed / 2 skipped; callers rely on those codes for the summary counts. It copies (`cp -R`) by default or symlinks with `--link`, and only prompts to overwrite when both stdin and stdout are ttys — otherwise an existing destination is skipped unless `--force`.

### The `.armaze-stack` manifest

Written to the root of the *target* repo by `manifest_upsert`, tab-separated: `type name path stack_rev synced_utc`, with two `#` header lines. **Rows are keyed by `path`, not by name** — the same component installed under two layouts is two rows (this was a real bug once; don't regress it). `cmd_update` reads the manifest into an array *before* the loop because each `manifest_upsert` rewrites the file. Update semantics: a symlinked destination is reported "already live" and left alone; `diff -rq src dest` clean means "up to date" (still re-stamped with the current `stack_rev`); otherwise it force-reinstalls.

### Updating the stack itself

`armaze self-update` and `armaze update --pull` share `stack_pull`: `git pull --ff-only` on the checkout (dies with git's own message if it can't fast-forward), then `stack_changes` diffs `skills/` and `agents/` between the old and new HEAD and classifies each touched component as added / changed / removed by whether its `component_doc_rel` file exists at each revision. Hidden, `_`-prefixed and `README` names are skipped, matching the discovery rules.

## Conventions for scripts

- Start scripts with `emulate -R zsh` then `setopt` only what's needed (`pipe_fail extended_glob typeset_silent`). Don't enable `err_exit`; errors are handled explicitly via `die`/return codes.
- `die` inside `$(...)` only exits the subshell — after `x=$(fn_that_may_die)` add `|| exit 1`, as `resolve_target`/`resolve_name` callers do.
- Colour via `C_*` variables set once at the top, disabled when stdout isn't a tty or `NO_COLOR` is set. Use `print -r --`, `info`/`ok`/`warn`/`die` helpers; `warn`/`die` go to stderr.
- Use `pretty_path` for anything user-facing (relative to `$PWD`, else `~`-prefixed); never print raw absolute paths in success lines.
- `local` is only valid inside functions; `install.zsh` runs at top level, so it uses plain variables.

## Component authoring

Conventions for adding skills and agents are in `skills/README.md` and `agents/README.md` (kebab-case names matching the directory/file name, front matter with `name` + one-line `description`, self-contained because each component is copied as a unit). Verify a new component with `./bin/armaze list` and try it with `armaze add --link <name>` from a real project.

## Git commits

Never add Claude as a committer or co-author. No `Co-Authored-By: Claude …` trailer, no `Claude-Session:` line, no "Generated with Claude Code" footer — in commit messages or PR bodies. Commits carry only the configured git user. This applies regardless of any default behaviour that suggests otherwise.
