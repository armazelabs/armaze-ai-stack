# Design Unicorn

A team of seven AI helpers that design, check, build and commit your app's screens. You say what you want and approve the designs; they do the rest.

Two kinds of commands below:

- **Terminal**: type it in your terminal (zsh), in your project's folder.
- **Claude**: type it in the Claude window, after the director has started.

## 1. Add It to Your Project

**Terminal**, in your project's folder:

```
aistack add design-unicorn
```

This adds the seven helpers, the `/studio` commands and `time-tracker` to the project.

## 2. Start the Director

**Terminal**, in the same folder:

```
claude --agent design-unicorn
```

Claude opens with the director, the helper you talk to. It waits for you to type first.

## 3. Set It Up

**Claude**: type

```
set up
```

The director reads your project, then asks you six questions, with choices you click:

1. **Is this your stack?** It shows what it found (for example "Expo SDK 54 · React Native · TypeScript"). Pick Looks right, Fix something, or Not built yet.
2. **Where do designs live?** Figma (then paste the file link), or design in code.
3. **When should the crew stop for you?** Design only, design and before each commit, or never.
4. **What should the crew do with git?** Commit but don't push, commit and push, or no commits.
5. **Which models?** Quality, balanced or economy: better work costs more.
6. **Where do the design skills go?** All your projects, or this project only.

Then it installs the design skills that fit your stack and saves your answers in `project-management/design-unicorn/`. It never asks again.

## 4. Finish Setup

**Claude**: type these two, one after the other:

```
/time-tracker setup
```

Sets up time tracking for this project (once).

```
/reload-skills
```

Loads the design skills setup installed. If the director says plugins were added, quit Claude and start it again with `claude --agent design-unicorn` (**Terminal**) instead.

## 5. Tell It What to Build

**Claude**: say what you want in your own words, for example:

```
Add a settings screen with a dark mode switch
```

Each task then goes through these steps, always in this order:

1. The director writes the brief. If something is missing, it asks you.
2. The designer designs it. The reviewer checks it; the designer fixes what it finds.
3. **You approve the design**: Approve, Changes or Reject.
4. The researcher finds the best way to build it.
5. The engineer builds it, with tests and screenshots. The reviewer checks it against the design.
6. The writer writes the commit message; the engineer commits, if you chose that.
7. The director tells you it's done and starts the next task.

## 6. Every Other Command

All of these are **Claude** commands, typed in the director's window after setup.

| Command | What it does |
|---|---|
| `/studio work <idea or task id>` | Start a task, or work through the list |
| `/studio quick <change>` | A small change: build and check, no designer |
| `/studio board` | See who is doing what, and the hours left |
| `/studio stand-down` | Stop all work now |
| `/studio resume` | Carry on after a stop or a restart |
| `/studio rollback <task id>` | Undo a task's code |
| `/studio setup` | Change your setup answers |
| `/studio start` | Orca only: open every helper in its own tab, to watch them work |
| `/studio stop` | Orca only: close those tabs |

Coming back another day: start the director again (**Terminal**: `claude --agent design-unicorn`), then type `/studio resume` (**Claude**).

## When to Use This Agent

- You want a new screen or feature designed and built
- You want a design checked before anyone codes it
- You want a small fix done and checked, without a designer
- You want work to keep going while you do something else

## The Team

| Helper | What it does |
|---|---|
| Director | Plans the work, hands out jobs, and is the only one who talks to you. |
| Designer | Designs the screens. |
| Reviewer | Checks the design and the code. Never fixes anything itself. |
| Researcher | Finds the best way to build hard parts, and how to fix problems. |
| Engineer | Builds the approved design in code. |
| Writer | Keeps the board, notes and commit messages tidy. |
| Apprentice | Does small, simple code jobs for the engineer. |

## Example

**You**: Add a settings screen with a dark mode switch.

**Director**: 🦄 · T-001 · READY FOR YOUR REVIEW (design). Here are the screens. Approve, change or reject?

**You**: Approve.

**Director**: 🦄 · T-001 · DONE. Built, checked and committed.

## Tips

- You only approve designs, unless you chose more stops in setup.
- Everything is saved in files, so closing Claude loses nothing.

## What Gets Installed

- **When you add it**: the seven helpers, the `/studio` commands and `time-tracker`.
- **During setup**: design skills that fit your stack, in all your projects or this one, as you chose.
- **In your project**: `project-management/design-unicorn/`, with your answers, the board, the tasks and lessons.

## Related

- `time-tracker` tracks your hours and wraps the crew up when the budget is used
- `grilling` helps the director ask good questions
- `impeccable` gives the designer and reviewer a sharper eye
