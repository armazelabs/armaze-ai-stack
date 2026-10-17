---
name: studio
description: Commands for the design-unicorn crew (the design-to-code agents started with `claude --agent design-unicorn`). Use for "/studio setup" (first run, or to change the answers), "start" (open every member's Orca tab) and "stop", "work" on a task or the backlog, a "quick fix" with no designer, the "board", "stand down", "resume" and "rollback".
argument-hint: "[setup | start | stop | work <id or brief> | quick <change> | board | stand-down | resume [id] | rollback <id>]"
---

# /studio

The control panel for the design-unicorn crew. The crew's files live in
`project-management/design-unicorn/` (call it `<crew>` below). The director's
own file, `.claude/agents/design-unicorn/AGENT.md`, holds the method: stations,
lanes, gates, dispatch, rescue loop. These commands start, stop and steer it.

Every message to the owner starts with `🦄 ·` (then the task id when there is
one), uses plain words, and is at most 5 lines unless a shape below says
otherwise.

**Every question to the owner is a clickable question** (the AskUserQuestion
tool), never typed out as text, a numbered list or "Q1 / Q2", in plan mode or
not. At most 4 questions per call, 2 to 4 options each: a short label plus one
plain sentence, your recommended option first with "(Recommended)" at the end
of its label. One decision per question. When the answer is free text (a link,
a name), still ask it this way: offer the likely answers ("Paste it in Other",
"None yet") and let the owner type the rest through "Other".

## Pick the subcommand

| Argument | Do |
|---|---|
| `setup` | **Setup**, below |
| `start` | **Start** |
| `stop` | **Stop** |
| `work <id, brief or empty>` | **Work** |
| `quick <change>` | **Quick** |
| `board` | **Board** |
| `stand-down` | **Stand down** |
| `resume [id]` | **Resume** |
| `rollback <id>` | **Rollback** |
| nothing | **Board**, then this list of subcommands, one line each |

Every subcommand except `setup` first checks that `<crew>/profile.md` exists.
If it does not, say: "This project has no design-unicorn setup yet. Run
`/studio setup` (or start the director with `claude --agent design-unicorn`)."
and stop.

`<skill>` below means the folder this file is in (`.claude/skills/studio/` in
the project, or `~/.claude/skills/studio/`).

## Setup

Sets the crew up in this project, or changes the answers. Safe to run again:
it never overwrites the board, lessons, questions or tasks.

**Re-run.** If `<crew>/profile.md` already exists, show its Stack, Design and
Way of working sections as a short summary and ask with AskUserQuestion,
multiSelect, "What do you want to change?": Stack and folders / Design tool /
Gates and git / Models and skills. Re-ask only the parts picked, keep every
other line as it is, then run steps c, d and e. Nothing picked: run c, d and e
only (that repairs missing files and skills).

### a. Detect the stack

Read what exists at the project root (the git top level, else the current
folder). Look, do not guess:

- `package.json`: dependencies and devDependencies (expo, react-native, next,
  astro, vite, react, vue, svelte, tailwindcss, typescript...) and `scripts`.
- `app.json` / `app.config.*` (Expo: SDK version, platforms), `next.config.*`,
  `astro.config.*`, `vite.config.*`, `tsconfig.json`.
- `pubspec.yaml` (Flutter), `Package.swift` or `*.xcodeproj` (Swift),
  `build.gradle*` (Android / Kotlin), `pyproject.toml`, `Cargo.toml`, `go.mod`.
- The lockfile for the package manager: `package-lock.json` npm,
  `pnpm-lock.yaml` pnpm, `yarn.lock` yarn, `bun.lockb` / `bun.lock` bun.

Fill the profile from it (the shape is `<skill>/templates/profile.md`):

- **Stack.** `summary` is one line with versions ("Expo SDK 54 · React Native
  0.81 · TypeScript · Expo Router"). `kind`, `platforms`, `framework`,
  `language`, `package manager`. `docs`: the versioned docs for that framework
  and version (for example the Expo docs for that SDK, the Next.js docs for that
  major version).
- **Commands** from `package.json` scripts, run through the package manager
  (`pnpm lint`, `npm run typecheck`). A command with no script is `none`. Other
  stacks: the usual one when its tool is there (`flutter test`, `cargo test`).
- **Folders** from what exists: screens (`app/`, `src/app/`, `src/pages/`,
  `src/screens/`), features, ui components (`components/ui/`,
  `src/components/`), theme (`theme/`, `src/theme/`, `tailwind.config.*`,
  tokens). `off limits`: generated files, database and migrations, anything
  that looks like money or auth logic; leave `none` if nothing fits.
- **Design.** `target device` from the kind: a phone app gets a current phone
  (for example "iPhone 16 Pro 402x874"), a website gets "desktop 1440 and phone
  390".
- `owner` is `git config user.name` (else the login name). `set up` is today.

Show it in at most 8 lines (stack summary, commands, folders, target device),
then AskUserQuestion "Is this your stack?":

- **Looks right (Recommended)**
- **Fix something**: ask what to change, in their words, and change only that
- **Not built yet - I'll describe it**: as for an empty project, below

**Empty project** (nothing above found): ask with AskUserQuestion what it will
be (Mobile app / Website / Web app / Something else), then the framework with
options for that kind, recommended first: mobile Expo / React Native CLI /
Flutter / Swift; website Next.js / Astro / Vite + React; web app Next.js /
Vite + React / Remix. Commands and folders are `none` until the code exists;
the director fills them in after the first build (by re-running this setup's
step a).

### b. How the crew works

One AskUserQuestion call with these four questions, recommended option first:

1. **Design tool.** "Where do designs live?" Figma (Recommended) / Design in
   code (no Figma: the designer works in the code and shows screenshots). If
   Figma: after the call, ask for the Figma file link with AskUserQuestion
   too: "Paste the link in Other" / "No file yet" (the owner types the link
   through "Other").
2. **Approval gates.** "When should the crew stop for you?" Design only
   (Recommended): you approve each design before it is built / Design and
   before each commit / None: the crew decides after its own review.
3. **Git.** "What should the crew do with git?" Commit, don't push
   (Recommended) / Commit and push / No commits: you commit yourself.
4. **Models.** "Which models?" Quality (Recommended): Opus designs, reviews and
   builds, costs the most / Balanced: Opus directs, Sonnet does the work, costs
   less / Economy: Sonnet and Haiku, cheapest, expect more rework.

Then one more AskUserQuestion:

5. **Skills scope.** "Install the design skills for…" All my projects, global
   (Recommended) / This project only.

Map the answers: gates `design` | `design, release` | `none`; git `commit` |
`commit-push` | `none`; models `quality` | `balanced` | `economy`; skills scope
`global` | `project`.

Check for Orca without asking: `command -v orca`. Found: `dispatch: orca`, and
say "Orca found: each crew member gets its own tab you can watch." Missing:
`dispatch: subagents`, and say "No Orca: crew members run as subagents in this
session."

### c. Install the supporting skills

Read `<skill>/references/stack-skills.md`. Take the core set, plus every row
that matches the confirmed stack and design tool. Run `aistack list --names`
and drop any name it does not show (as `skills/<name>` or `plugins/<name>`).
Then install, passing plain names:

- scope global: `aistack add --global <names>`
- scope project: `aistack add --to <project root> <names>`

aistack skips what is already installed. If `aistack` is not on PATH, list
the names and the command for the owner, and carry on. If the install fails
for one name, say which in one line and carry on.

### d. Write the crew folder

Create `project-management/design-unicorn/` if missing. From `<skill>/templates/`:

- `profile.md`: written with the answers. This is the only file a re-run
  rewrites, and it keeps every line that was not re-asked.
- `board.md`, `lessons.md`, `questions.md`: copied only if missing.
- `task.md` is **not** copied; it stays in `<skill>/templates/` and the
  director copies it for each new task.

Also create, if missing: `tasks/`, `tasks/done/`, `research/index.md` (a
`# Research library` heading and one line: "Proven fixes and notes, newest
first. The researcher checks here first."), `summaries/`. For `tool: figma`
also create `design-catch-up.md` with a `# Design catch-up` heading and one
line: "Code changes the Figma file has not caught up with yet, one per line."

Append to the project's `.gitignore` each of these lines that is missing:

```
project-management/design-unicorn/spikes/
project-management/design-unicorn/log/
project-management/design-unicorn/HALT
```

### e. Finish

At most 5 lines: what was set up (stack, gates, git, models, dispatch, skills
installed or listed), then the next steps:

- `/time-tracker setup`, if `project-management/tracking/config.json` is missing
- `/reload-skills` to load the new skills (restart Claude instead if plugins
  were added)
- "Then tell the director what to build."

## Start

Opens every member's tab in Orca at once, each running its own agent on the
model the profile's preset gives it, so you can watch the whole crew work.
Needs Orca; without it, say: "Opening tabs needs Orca. Without it the
director runs the members inside its own session, so there's nothing to open:
just talk to the director." and stop.

1. If the profile says `dispatch: subagents`, change that one line to
   `dispatch: orca`, so the director hands jobs to the tabs.
2. Run the launcher from the project root:
   - you are the director (running as `design-unicorn`):
     `zsh <skill>/scripts/tabs.zsh open --members-only` (you already are the
     director's tab, so it opens the other six);
   - otherwise: `zsh <skill>/scripts/tabs.zsh open` (all seven, the director's
     tab gets the focus).
3. Reply with its lines as they are, then one line: "Talk to the director in
   its tab." (or, as the director, "Ready: tell me what to build.").

Running it again reopens only the tabs that were closed. The director finds
the tabs through `<crew>/log/tabs.json`.

## Stop

Closes every tab Start opened: `zsh <skill>/scripts/tabs.zsh close`. Work in
progress stays in the task files; Start opens the tabs again and **Resume**
picks the work up. To halt work without closing anything, use **Stand down**.
Reply with the script's lines as they are.

## Work

Starts the crew on a task or the backlog. Input: `$ARGUMENTS` after
`work`.

1. If you are not running as the director, read
   `.claude/agents/design-unicorn/AGENT.md` and act as it says.
2. `<crew>/HALT` exists: say `🦄 · STAND DOWN in effect. Run /studio resume.`
   and stop.
3. Check the hours as the director's **Time** section says.
4. Input is an existing id under `<crew>/tasks/`: carry on from its Status.
   Input is a brief: new task, station 0 INTAKE. Input is empty: the top
   backlog row of `<crew>/board.md`; an empty backlog: say so and ask what to
   build.
5. Work the task station by station as the director's file says, then the
   next backlog task, until the backlog is empty, a gate waits for the owner,
   or the hours run out.

## Quick

The QUICK lane: the owner's own direct change, with no designer. Change:
`$ARGUMENTS` after `quick`.

1. `<crew>/HALT` exists: say so and stop. Check the hours (director's
   **Time**).
2. New task: next free id `T-###`, copy `<skill>/templates/task.md` to
   `<crew>/tasks/<id>.md` with `Lane: QUICK`, `Status: BUILD`, the change word
   for word under `## Brief`. Add the board row. Ask nothing unless it cannot
   be built without an answer; then ask once with AskUserQuestion.
3. Station 5 BUILD: the engineer, `<id> · QUICK build`. STUCK: the rescue loop
   from the director's file.
4. Station 6 BUILD QA: the reviewer, `mode: PARTIAL · scope: brief +
   engineer's files`. A 🔴 goes back to the engineer with the finding ids, then
   the reviewer checks again.
5. Passed: tell the owner in at most 5 lines what changed, what the review
   found and where the screenshots are. The owner's later notes are rework:
   give them word for word to the engineer, then back to step 4.
6. Commit as the profile's `git` and `approval gates` say (director's
   **Gates and git**). With `tool: figma`, the writer adds one line to
   `<crew>/design-catch-up.md`. Then the director's finish steps (board DONE,
   time-tracker update, lessons).

## Board

Read `<crew>/board.md`. Check whether `<crew>/HALT` exists. Run
`tail -n 25 <crew>/log/activity.log` (skip if missing). With `dispatch: orca`
and a `<crew>/log/run-id`, also `orca orchestration worker-list --run <id>
--json`. With `project-management/tracking/engine/budget.mjs` present, run
`node project-management/tracking/engine/budget.mjs` for the hours line.

Reply in this shape only:

```
🦄 · BOARD · <time>
Status: WORKING | STAND DOWN
| id | title | station | member on it | since | tokens | last note |   (In progress and Waiting on owner rows)
Tabs: <member: busy on <id> | idle>          (orca only)
Hours: <budget line, or "time tracking not set up">
Waiting on you: <id: what> (or none)
Live feed (last 25):
<lines>
```

## Stand down

Stops the whole crew. Run:

```
mkdir -p project-management/design-unicorn/log
date -u +%Y-%m-%dT%H:%M:%SZ > project-management/design-unicorn/HALT
printf '%s · STAND DOWN by the owner\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> project-management/design-unicorn/log/activity.log
```

With `dispatch: orca`, send each busy member one message: "STAND DOWN. Write
where you are into the task Log and stop." Do not dispatch, revert or close
anything. Reply only:

```
🦄 · STAND DOWN
Halted at <time>. Members stop at their next step and note where they are.
In flight:
| id | station | who | last note |
Nothing moves until /studio resume.
```

## Resume

Lifts a stand-down, or picks work back up after `/clear` or a new session.

1. `rm -f project-management/design-unicorn/HALT` and log `RESUME by the
   owner` to `<crew>/log/activity.log`.
2. Read only `<crew>/board.md` and the task file(s) involved, never their
   `history.md`. Check the hours (director's **Time**).
3. **An id given:** say its lane, station, open finding ids and next action in
   3 lines and carry on from there. At a gate, post the gate message again and
   wait.
4. **No id:** list every task that is not DONE with its station and who was on
   it. Ask one question (AskUserQuestion): which task first, or all in board
   order. Do not dispatch until the owner answers; then dispatch that task's
   current station again with the note "the previous run was interrupted; the
   task Log says where it stopped".

## Rollback

Undoes a task's code changes and reopens it. Task: the id after `rollback`.

Read `<crew>/tasks/<id>.md` (look in `tasks/done/` too): the Build section's
`Files touched` and the `## Commit` hash. Tell the owner which case applies
before doing anything:

- **Not committed** (no hash): `git checkout -- <files>` for tracked files and
  `git clean -f -- <files>` for new ones among them. Show the exact list and
  ask "Discard these?" (Yes / No). Only on yes, run it.
- **Committed**: `git revert --no-edit <hash>` on the current branch. Ask
  "Revert <hash>?" first. Push only when the profile says `git: commit-push`
  (never force).

Never `git reset --hard`, never touch files not on the list, never create a
branch. Then move the task file back from `tasks/done/` if it is there, set
Status to DESIGN QA (the design still stands) or DESIGN if the owner says the
design is rejected too, update the board, and log `ROLLBACK · <what was
undone>` in the task Log and `<crew>/log/activity.log`. Reply with what was
undone and where the task now sits.
