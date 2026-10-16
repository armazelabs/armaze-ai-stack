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
cd ~/my-project                 # or any folder, even an empty one
aistack                         # the app, opened on the add tab (see below)

aistack list                    # the app on its add tab; piped, a plain list with descriptions
aistack list agents             # just one type
aistack list --names            # plain type/name lines (what tab completion uses)

aistack add                     # the app on its add tab
aistack add pr-review reviewer  # non-interactive: bare names ...
aistack add skills/pr-review agents/reviewer  # ... or qualified when a name exists as both
aistack add --skills            # only offer skills (or --agents)
aistack add --force             # overwrite anything already there without asking
aistack add --link              # symlink instead of copy — for developing a skill against a real repo

aistack update                  # the app on its update tab; ⏎ pulls the stack and re-copies what this repo added
aistack init                    # start a new project here, with its own Claude login (see below)
aistack help                    # the app on its help tab

aistack --version               # which release you have (see CHANGELOG.md); also -v or version
```

### The app

In a terminal, `aistack` clears the screen and opens one app with three tabs — `add`, `update`, `help` — drawn inside a rounded box as wide as the terminal, redrawn when you resize the window. Bare `aistack` and `aistack list` start on **add**, which lists everything on the shelf; `aistack update` and `aistack help` start on their own tab. Everything else is keys:

| Key | Does |
|-----|------|
| `tab` / `shift-tab` | Next / previous tab — wrapping around at either end |
| `↑` `↓` (or `j` `k`) | Move the cursor on **add**; scroll the README pane while it has the focus, and **help** |
| `→`, or a click on the pane | Move into the README pane beside the list (**add**) |
| `←` / `esc` | Leave the README pane |
| Mouse | A click on a row selects it; the wheel scrolls whatever is under the pointer |
| `space` | Mark or unmark the component under the cursor (**add**) |
| `a` | Mark everything, or clear all marks (**add**) |
| `⏎` | **add**: install the marked components (or the one under the cursor if nothing is marked) · **update**: pull the stack and refresh this project |
| `q` (or `esc` outside the README pane) | Quit without doing anything |

A green check right after the name marks components the project already has, so you can see what a re-run would overwrite. When you confirm, the app closes and the results print below it. Beside the list, a pane shows the selected component's `README.md`, or its `SKILL.md` or agent file when it has none; in a terminal too narrow for the pane, a one-line description takes its place, trimmed to fit. While the app is open it reads the mouse, so selecting text with the mouse needs Shift or Option held (which one depends on the terminal).

Without a terminal on both ends — piped output, scripts, `list --names`, `add NAME` — nothing interactive happens: `list` prints plain text, `add NAME` installs, `update` runs straight away.

| Variable | Effect |
|----------|--------|
| `ARMAZE_PICKER=menu` | A numbered list read from stdin instead of the app (also what you get without a terminal, or with `ARMAZE_NO_FZF=1`) |
| `ARMAZE_PICKER=fzf` | Fuzzy multi-select through [fzf](https://github.com/junegunn/fzf), if installed |
| `ARMAZE_WIDTH=N` | Cap the box width in columns (default: the full terminal width) |
| `ARMAZE_ALIGN=left` | Pin a box narrowed by `ARMAZE_WIDTH` to the left edge instead of centring it |
| `ARMAZE_ICONS=0` | ASCII markers instead of Nerd Font glyphs |
| `ARMAZE_UI=0` | Plain output even on a terminal (`=1` forces the layout when piped) |
| `NO_COLOR=1` | No colour; `CLICOLOR_FORCE=1` keeps colour when piped |

### Start a new project

```zsh
mkdir ~/Projects/my-app && cd ~/Projects/my-app     # or a freshly cloned, empty repo
aistack init
```

`aistack init` gets an empty folder ready in one go, then opens Claude Code on the `project-kickoff` skill:

1. `git init` if it isn't a repo yet, and a `.gitignore` that keeps `.claude-local/`, `.env*` (except `.env.example`), `*.pem` and `.claude/settings.local.json` out of git.
2. `.claude-local/`: the project's **own Claude config folder**, so the project has its own login, separate from your global `~/.claude` one.
3. Your global setup is copied in: `settings.json`, `settings.local.json`, `CLAUDE.md`, `keybindings.json`, your skills, agents and commands, and your user-level MCP servers. Your enabled plugins are reinstalled (that needs the network). **Your login, history and sessions are never copied.**
4. The `project-kickoff` skill goes into `.claude/skills/`, then Claude starts on `/project-kickoff`. Sign in when it asks; that login belongs to this project only.

The kickoff asks what you're building (website, SaaS, mobile app, or a mix), its name, a one-line pitch and the stack, with more detail optional. Then it writes the AI layer, but no app code:

- `CLAUDE.md`, with `AGENTS.md` linked to it so other tools read the same rules.
- Product docs in `docs/`, and plans and a decisions log in `project-management/`.
- Project `.claude/` settings that block reading secrets, plus `/plan` and `/decision` commands.
- A `.mcp.json` with the servers for your stack.
- The Armaze skills that fit, from a pre-ticked list you can trim.

It never overwrites a file, makes one commit (`Project kickoff: <name>`), and removes itself. Re-running `aistack init` is safe: it only fills what's missing.

| Option | Effect |
|--------|--------|
| `--to DIR` | Set up another folder instead of the current one |
| `--no-carry` | Start with an empty Claude config: no global settings, skills or MCP servers |
| `--no-plugins` | Copy settings but don't reinstall plugins |
| `--no-launch` / `--launch` | Don't (or do) open Claude at the end. The default is to open it in a terminal |

### Project logins

With the armaze plugin loaded, `claude` checks whether you're inside a project that has a `.claude-local/` folder, including any subfolder or git worktree of it. If so, it runs with that folder as its config, so you get that project's login, settings and history. It also drops `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` and `CLAUDE_CODE_OAUTH_TOKEN`, which would otherwise override the project login. Everywhere else, `claude` behaves as usual.

- `ARMAZE_CLAUDE_GLOBAL=1 claude` uses your global setup for one run. A `CLAUDE_CONFIG_DIR` you set yourself always wins.
- Without the plugin, use `CLAUDE_CONFIG_DIR=.claude-local claude`.
- Only the terminal `claude` uses project logins, including VS Code's built-in terminal. The Desktop app and the IDE extensions keep using your global login.

### Keeping up to date

The stack is a git checkout on your machine, and every project holds its own copies of the components it added. `aistack update` handles both in one go — in a terminal it opens the app's **update** tab and `⏎` runs it; piped or scripted it just runs:

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

Each of `skills/`, `agents/`, `workflows/` and `tools/` has a README with the authoring conventions for that component type. The [skills](skills/README.md#on-the-shelf) and [agents](agents/README.md#on-the-shelf) READMEs also list what is on the shelf.

## Adding to the stack

1. Branch from `main`.
2. Add your component following the conventions in the relevant directory README — kebab-case name, front matter with `name` and a one-line `description`, self-contained files — and give it a row in that README's "On the shelf" table.
3. Check it shows up: `aistack list`. Try it in a real project: `cd ~/some-repo && aistack add --link <name>`.
4. Add a line to `CHANGELOG.md` under `## Unreleased` (create the heading if it isn't there) saying what members get.
5. Open a pull request. A short note on when to use the component and what you tested is plenty.

Keep components platform-neutral where you can. If something only works in one assistant, say so in the description so members can tell at a glance.

## Design principles

- **Platform-agnostic.** Plain Markdown and portable scripts. Nothing depends on a single vendor's private format; platform-specific paths are a flag on the CLI, not baked into the components.
- **Self-contained.** Each skill or agent documents its own purpose, inputs and prerequisites and is copied as a unit.
- **Composable.** Skills stay small and single-purpose; workflows and agents combine them.
- **Reviewable.** Everything is text, so changes are diffable and go through normal code review.
