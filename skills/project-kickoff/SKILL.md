---
name: project-kickoff
description: One-time setup of a new project's AI layer - asks what it is (website, SaaS, mobile app or several), its name, pitch and stack, then writes CLAUDE.md with an AGENTS.md link, product docs, project-management plans and decisions, project .claude settings and .mcp.json, installs matching Armaze skills, commits once and removes itself. Writes no app code. Started by `aistack init`; use when asked to kick off or set up a fresh project.
---

# Project kickoff

Turns an empty folder (or a freshly cloned repo) into a project an AI assistant
can work in well: the rules it should follow, what the product is, where plans
and decisions go, what it may and may not touch, and the tools it can reach.
It writes **no application code** - no framework starter, no package.json. The
stack is written down so the first coding session starts from it.

`aistack init` installs this skill into `.claude/skills/project-kickoff/` and opens
Claude Code on `/project-kickoff`. It is written for Claude Code (clickable
questions, `.claude/`, `.mcp.json`); in another tool, ask the same questions as
short numbered choices and skip the Claude-specific files.

## Rules

- **Fill gaps only.** Never overwrite a file that exists. A whole file that
  exists is skipped; `.claude/settings.json` and `.mcp.json` only gain the keys
  and entries they're missing. Say what you skipped.
- **Ask, don't assume.** Every choice goes to the user as a clickable question
  (AskUserQuestion): at most 4 questions per call, 2-4 options each, the
  recommended option first with "(Recommended)" on its label. Never write the
  questions out as a numbered text list. Only the pitch and the feature list are
  free text.
- **No house default for a SaaS backend or a mobile stack.** Always ask. The
  website stack has a default the user can change.
- **Project-management files go under `project-management/`**, spelled exactly
  that way: plans, the decisions log, next steps.
- **The commit carries only the user's git identity** - no co-author trailer, no
  "Generated with" line.
- Write in plain, direct language. A CLAUDE.md is read on every turn: keep it
  short, specific to this project, and free of generic advice.

## Workflow

### 0. Preflight

1. Confirm you're at the repo root (`git rev-parse --show-toplevel` equals the
   working directory). If not, stop and say where to run it.
2. List what's already there (top two levels, ignoring `.git` and
   `.claude-local`) so the gap rules have something to check against. Read an
   existing `CLAUDE.md`, `AGENTS.md` or `README.md` - they may already answer
   some questions; don't ask what they answer.
3. Check `command -v aistack` - it decides how step 7 installs shelf components.

### 1. The basics

Follow `references/interview.md`, round 1: project type (multi-select: Website,
SaaS, Mobile app), name (the folder name is the recommended option), then the
one-line pitch as a single short free-text question.

### 2. The stack

`references/interview.md`, round 2, using the options in `references/stacks.md`
for each type picked. A mobile app without SaaS is asked whether it needs a
backend.

### 3. More detail (optional)

Offer one question: add more detail now, or skip and fill it in later
(recommended: skip if the user seems in a hurry; offer it either way). If yes,
run `references/interview.md`, round 3. Anything not asked is written into the
docs as an open question, not invented.

### 4. Extras

Work out the pre-ticked shelf components from `references/shelf-map.md` and the
MCP servers and permissions from `references/mcp.md` for the types picked. Show
them as one short list, every item ticked, then ask "Keep all (Recommended) /
Let me untick some / None of these". "Let me untick some" asks multi-select
questions of what to **remove** (4 items per question, up to 4 questions per
call), because a question can't start with boxes ticked.

### 5. Preview

Work out the layout from `references/layouts.md`. Show the tree of every path
you'll write, each marked `create` or `skip (exists)`, plus the components to
install and the MCP servers to add. Ask "Write it (Recommended) / Change
something". On "Change something", ask what, adjust, and preview again.

### 6. Write

Fill the templates in `templates/` (see `references/layouts.md` for which go
where; `templates/claude/` is written to `.claude/`). Replace every
`{{PLACEHOLDER}}` and every `<!-- kickoff: ... -->` instruction comment with
real content from the interview; remove the comment itself. Where the user gave
no answer, write a short open question under "Open questions" instead.

- `CLAUDE.md` is the source of truth. `AGENTS.md` becomes a symlink to it in
  step 8. If only an `AGENTS.md` exists already, leave it and write a `CLAUDE.md`
  containing just `@AGENTS.md` plus any Claude-only notes.
- `.claude/settings.json`: the permissions from `references/mcp.md` for the
  types picked. No hooks unless the user asked for them.
- `.mcp.json`: the servers kept in step 4, exactly as given in
  `references/mcp.md`. Never put a secret in it - servers that need a key read
  it from an environment variable.

### 7. Shelf components

If `aistack` is on PATH, run
`aistack add --to . <name> ...` with qualified names (`skills/figma-to-code`,
`agents/website-weaver`). It records them in `.armaze-stack`. If `aistack` is
missing, write the exact command into `project-management/next-steps.md` and
say so. Don't run any component's own setup (time-tracker's setup, for
example) - list it as a next step.

### 8. Finish

Run, from the project root, with the project name and every path you wrote:

```zsh
zsh .claude/skills/project-kickoff/scripts/finish.zsh "<name>" CLAUDE.md project-management ...
```

It creates the `AGENTS.md` symlinks next to each `CLAUDE.md`, commits only what
the kickoff wrote (plus `.gitignore`, `.armaze-stack`, `.mcp.json` and
`.claude/`, never this skill or `settings.local.json`) as
`Project kickoff: <name>`, and then deletes this skill folder. If it exits 1
(usually no git name or email set), relay its message: the skill stays so the
user can fix it and say "finish the kickoff".

### 9. Report

A short summary: what was written, what was skipped, components installed,
MCP servers added (they need approving the first time Claude Code starts; run
`/mcp` to sign in to the ones that use OAuth), and the next steps from
`project-management/next-steps.md` if any. Remind the user that this project has
its own Claude login in `.claude-local/` (gitignored), used automatically by the
armaze plugin's `claude` inside the project.
