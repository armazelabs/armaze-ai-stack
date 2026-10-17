# Design Unicorn

A team of seven AI helpers that design, check, build and commit your app's screens, while you only approve.

## When to Use This Agent

- You want a new screen or feature designed and built
- You want a design checked before anyone codes it
- You want a small fix done and checked, without a designer
- You want work to keep going while you do something else

## What This Agent Does

1. **Learns Your Project**: Reads your code and asks a few questions once
2. **Writes the Brief**: Turns your words into a clear task
3. **Designs It**: In Figma or in code, through your design system
4. **Checks Everything**: A reviewer checks the design, then the build
5. **Builds It**: From the approved design, with tests and screenshots
6. **Commits**: Only if you said so, with plain messages

## How to Use

### Basic Usage

1. Add it to your project:

```
aistack add design-unicorn
```

2. Start the director:

```
claude --agent design-unicorn
```

3. Answer the setup questions. It asks once.
4. Tell it what to build.

### Commands

| Command | What it does |
|---|---|
| `/unicorn setup` | Change your setup answers |
| `/unicorn roll-out` | Start a task, or work through the list |
| `/unicorn quick <change>` | A small change, no designer |
| `/unicorn board` | See who is doing what |
| `/unicorn stand-down` | Stop everything now |
| `/unicorn resume` | Start again after a stop |
| `/unicorn rollback <id>` | Undo a task's code |

## Example

**You**: Add a settings screen with a dark mode switch.

**Director**: 🦄 · T-001 · READY FOR YOUR REVIEW (design). Here are the screens. Approve, change or reject?

**You**: Approve.

**Director**: 🦄 · T-001 · DONE. Built, checked and committed.

## Tips

- Say what you want in your own words. If something is missing, the director asks with choices you click.
- You only approve designs, unless you chose more stops in setup.
- Run `/unicorn board` any time to see where things are.
- Run `/time-tracker setup` once, so your hours are tracked.
- Everything is saved in files, so you can close Claude and come back.

## Related Use Cases

- `time-tracker` keeps track of hours and stops work when the budget is used
- `grilling` helps the director ask good questions
- `impeccable` gives the designer and reviewer a sharper eye

## The Team

| Role | What it does |
|---|---|
| Director | Plans the work, hands out jobs, and is the only one who talks to you. |
| Designer | Designs the screens. |
| Reviewer | Checks the design and the code. Never fixes anything itself. |
| Engineer | Builds the approved design in code. |
| Researcher | Finds out how to build hard parts and how to fix problems. |
| Writer | Keeps the board, notes and commit messages tidy. |
| Apprentice | Does small, simple code jobs for the engineer. |

## What Gets Installed

- **Always**: this team, the `/unicorn` commands and `time-tracker`.
- **Design skills**: chosen for your stack during setup. You pick where they go: all your projects, or this project only.
- **Your project files**: in `project-management/design-unicorn/` (board, tasks, lessons, notes).
