# Armaze AI Stack

A collection of reusable AI skills, agents, workflows, and tools designed to work across different AI platforms and coding environments.

This repo is internal to Armaze. It is the shared shelf: members pick the skills and agents they want and add them to their own projects with the `aistack` command — a zsh script that ships in this repo and plugs into oh-my-zsh, so it works the same on every member's machine.

## Prerequisites

- zsh with [oh-my-zsh](https://ohmyz.sh/) — the standard Armaze shell setup
- git
- Optional: a [Nerd Font](https://www.nerdfonts.com) in your terminal for the icons. Without one you get plain ASCII markers and the layout is unchanged (`ARMAZE_ICONS=0` forces them).

## Setup (once per machine)

```zsh
curl -fsSL https://raw.githubusercontent.com/armazelabs/armaze-ai-stack/main/install.zsh | zsh && exec zsh
```

That clones the stack to `~/armaze-ai-stack` (set `ARMAZE_STACK_DIR` first to put it somewhere else), links the oh-my-zsh plugin into `$ZSH_CUSTOM/plugins/armaze`, and asks before adding `plugins+=(armaze)` to your `~/.zshrc` (a backup is kept). The `exec zsh` at the end reloads your shell, so `aistack` is on your PATH with tab completion straight away — no new terminal needed.

Already have a checkout? `./install.zsh` from inside it does the same without cloning. Pass `--yes` to skip the `.zshrc` prompt, or `--no-rc` to link the plugin only and edit `.zshrc` yourself; either way, finish with `exec zsh`. Prefer no plugin at all? Put `<checkout>/bin` on your PATH.

## Using `aistack`

```zsh
aistack list                    # what the stack offers, with one-line descriptions
aistack list agents             # just one type

cd ~/my-project                 # or any folder, even an empty one
aistack add                     # picker: ↑↓ move, space toggle, a all, ⏎ add, q cancel
aistack add pr-review reviewer  # non-interactive: bare names ...
aistack add skills/pr-review agents/reviewer  # ... or qualified when a name exists as both
aistack add --skills            # only offer skills (or --agents)
aistack add --force             # overwrite anything already there without asking
aistack add --link              # symlink instead of copy — for developing a skill against a real repo

aistack update                  # pull the latest stack, then re-copy everything this repo previously added

aistack --version               # which release you have (see CHANGELOG.md); also -v or version
aistack --help                  # every command and option
```

### The picker and the display

`aistack list`, the `aistack add` picker and `aistack help` draw a banner layout — wordmark, command bar, sections with icons, and a key legend — when they are talking to a terminal. Pipe them, or use `list --names`, and you get plain text. The picker marks components the target already has, so you can see at a glance what a re-run would overwrite.

| Variable | Effect |
|----------|--------|
| `ARMAZE_PICKER=menu` | Numbered list instead of the arrow-key picker (also what you get without a terminal, or with `ARMAZE_NO_FZF=1`) |
| `ARMAZE_PICKER=fzf` | Fuzzy multi-select through [fzf](https://github.com/junegunn/fzf), if installed |
| `ARMAZE_ICONS=0` | ASCII markers instead of Nerd Font glyphs |
| `ARMAZE_UI=0` | Plain output even on a terminal (`=1` forces the layout when piped) |
| `NO_COLOR=1` | No colour; `CLICOLOR_FORCE=1` keeps colour when piped |

### Keeping up to date

The stack is a git checkout on your machine, and every project holds its own copies of the components it added. `aistack update` handles both in one go:

1. It fast-forwards the checkout and lists which skills and agents were added (`+`), changed (`~`) or removed (`-`). If it can't pull — no git checkout, local edits, a diverged branch — it says so and carries on with what you have.
2. Inside a project, it then re-copies whatever `.armaze-stack` records from the now-current stack. Components that already match are left alone; symlinked ones (`--link`) are live already.

Run it outside a project and it just does the first step. Re-running the setup one-liner pulls the stack too.

### Where components land

By default `aistack` uses the Claude Code layout. Pass `--platform generic` for a neutral one, or set the directories explicitly.

| Layout | Skills | Agents |
|--------|--------|--------|
| `claude` (default) | `.claude/skills/<name>/` | `.claude/agents/<name>.md` |
| `generic` | `.ai/skills/<name>/` | `.ai/agents/<name>.md` |
| custom | `--skills-dir DIR` | `--agents-dir DIR` |

The target is the git repo you are standing in (or `--to DIR`). Components are **copied**, so they get committed with your project and keep working for anyone who clones it.

### The `.armaze-stack` manifest

Every `aistack add` records what it installed in a small tab-separated file at the root of the target repo — type, name, path, the stack commit it came from, and when. Commit it: it is what lets `aistack update` refresh those components after the stack changes, and it tells teammates where a skill came from.

## Repository layout

```
armaze-ai-stack/
├── CHANGELOG.md               # what changed in each version
├── bin/aistack                # the CLI (zsh)
├── install.zsh                # one-time member setup (also what the curl one-liner runs)
├── oh-my-zsh/armaze/          # oh-my-zsh plugin: PATH + tab completion
├── skills/                    # one directory per skill, each with a SKILL.md
├── agents/                    # one Markdown file per agent
├── workflows/                 # multi-step processes composing skills and agents
└── tools/                     # scripts, CLIs, MCP servers
```

Each of `skills/`, `agents/`, `workflows/` and `tools/` has a README with the authoring conventions for that component type.

## Adding to the stack

1. Branch from `main`.
2. Add your component following the conventions in the relevant directory README — kebab-case name, front matter with `name` and a one-line `description`, self-contained files.
3. Check it shows up: `aistack list`. Try it in a real project: `cd ~/some-repo && aistack add --link <name>`.
4. Add a line to `CHANGELOG.md` under `## Unreleased` (create the heading if it isn't there) saying what members get.
5. Open a pull request. A short note on when to use the component and what you tested is plenty.

Keep components platform-neutral where you can. If something only works in one assistant, say so in the description so members can tell at a glance.

## Design principles

- **Platform-agnostic.** Plain Markdown and portable scripts. Nothing depends on a single vendor's private format; platform-specific paths are a flag on the CLI, not baked into the components.
- **Self-contained.** Each skill or agent documents its own purpose, inputs and prerequisites and is copied as a unit.
- **Composable.** Skills stay small and single-purpose; workflows and agents combine them.
- **Reviewable.** Everything is text, so changes are diffable and go through normal code review.
