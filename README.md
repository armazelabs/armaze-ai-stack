# Armaze AI Stack

A collection of reusable AI skills, agents, workflows, and tools designed to work across different AI platforms and coding environments.

This repo is internal to Armaze. It is the shared shelf: members pick the skills and agents they want and add them to their own projects with the `armaze` command — a zsh script that ships in this repo and plugs into oh-my-zsh, so it works the same on every member's machine.

## Prerequisites

- zsh with [oh-my-zsh](https://ohmyz.sh/) — the standard Armaze shell setup
- git
- Optional: [fzf](https://github.com/junegunn/fzf) for a fuzzy multi-select picker. Without it `armaze` falls back to a numbered menu.

## Setup (once per machine)

```zsh
git clone https://github.com/armazelabs/armaze-ai-stack.git ~/armaze-ai-stack
cd ~/armaze-ai-stack
./install.zsh
```

`install.zsh` symlinks `oh-my-zsh/armaze/` into `$ZSH_CUSTOM/plugins/armaze` and offers to add `plugins+=(armaze)` to your `~/.zshrc` (a backup is kept). Open a new shell and `armaze` is on your PATH with tab completion.

Prefer to do it by hand? Link the plugin directory yourself and add `armaze` to your `plugins=(...)` line — or skip the plugin entirely and put `~/armaze-ai-stack/bin` on your PATH.

## Using `armaze`

```zsh
armaze list                     # what the stack offers, with one-line descriptions
armaze list agents              # just one type

cd ~/my-project
armaze add                      # interactive picker: skills first, then agents
armaze add pr-review reviewer   # non-interactive: bare names ...
armaze add skills/pr-review agents/reviewer   # ... or qualified when a name exists as both
armaze add --skills             # only offer skills (or --agents)
armaze add --force              # overwrite anything already there without asking
armaze add --link               # symlink instead of copy — for developing a skill against a real repo

armaze update                   # re-copy everything this repo previously added
armaze update --pull            # ... after pulling the latest stack first
```

### Where components land

By default `armaze` uses the Claude Code layout. Pass `--platform generic` for a neutral one, or set the directories explicitly.

| Layout | Skills | Agents |
|--------|--------|--------|
| `claude` (default) | `.claude/skills/<name>/` | `.claude/agents/<name>.md` |
| `generic` | `.ai/skills/<name>/` | `.ai/agents/<name>.md` |
| custom | `--skills-dir DIR` | `--agents-dir DIR` |

The target is the git repo you are standing in (or `--to DIR`). Components are **copied**, so they get committed with your project and keep working for anyone who clones it.

### The `.armaze-stack` manifest

Every `armaze add` records what it installed in a small tab-separated file at the root of the target repo — type, name, path, the stack commit it came from, and when. Commit it: it is what lets `armaze update` refresh those components after the stack changes, and it tells teammates where a skill came from.

## Repository layout

```
armaze-ai-stack/
├── bin/armaze                 # the CLI (zsh)
├── install.zsh                # one-time member setup
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
3. Check it shows up: `armaze list`. Try it in a real project: `cd ~/some-repo && armaze add --link <name>`.
4. Open a pull request. A short note on when to use the component and what you tested is plenty.

Keep components platform-neutral where you can. If something only works in one assistant, say so in the description so members can tell at a glance.

## Design principles

- **Platform-agnostic.** Plain Markdown and portable scripts. Nothing depends on a single vendor's private format; platform-specific paths are a flag on the CLI, not baked into the components.
- **Self-contained.** Each skill or agent documents its own purpose, inputs and prerequisites and is copied as a unit.
- **Composable.** Skills stay small and single-purpose; workflows and agents combine them.
- **Reviewable.** Everything is text, so changes are diffable and go through normal code review.
