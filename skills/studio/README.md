# Unicorn Commands

The `/unicorn` commands that set up, start, stop and check the Design Unicorn team in your project.

## When to Use This Skill

- The first time you use Design Unicorn in a project
- You want to change a setup answer
- You want a task started, or a quick fix done
- You want to see what the team is doing
- You want everything to stop, or start again

## What This Skill Does

1. **Sets Up the Project**: Finds your stack and asks a few questions
2. **Installs Design Skills**: Picks the right ones for your stack
3. **Makes the Team's Folder**: Board, tasks, lessons and notes
4. **Starts Work**: A full task, or a quick fix
5. **Shows the Board**: Who is doing what, and what waits for you
6. **Stops, Resumes and Undoes**: When you need control back

## How to Use

### Basic Usage

It comes with Design Unicorn. Start the director, and setup runs by itself the first time:

```
claude --agent design-unicorn
```

### All Commands

| Command | What it does |
|---|---|
| `/unicorn` | Shows the board and this list |
| `/unicorn setup` | Sets up, or changes your answers |
| `/unicorn roll-out <task or idea>` | Starts a task, or works through the list |
| `/unicorn quick <change>` | A small change: build, check, done. No designer |
| `/unicorn board` | Who is doing what, and the hours left |
| `/unicorn stand-down` | Stops everything now |
| `/unicorn resume [id]` | Starts again, or picks up a task |
| `/unicorn rollback <id>` | Undoes a task's code and reopens it |

## Example

**You**: /unicorn setup

**Claude**: Found Expo SDK 54, React Native, TypeScript. Is this your stack?

**You**: Looks right.

**Claude**: Then asks a few quick questions: design tool, when to stop for you, git, models and where skills go.

**Claude**: Set up. Installed 7 design skills. Next: /time-tracker setup, then /reload-skills, then tell the director what to build.

## Tips

- Run `/unicorn setup` again any time. It only changes what you pick.
- Setup asks where design skills go: all your projects, or just this one.
- `/unicorn stand-down` stops the team at once. Nothing is lost.
- A quick fix is still checked by the reviewer before it is done.

## Related Use Cases

- `design-unicorn` is the team these commands drive
- `time-tracker` is set up with `/time-tracker setup`

## What Setup Asks

- **Is this your stack?** Looks right / Fix something / Not built yet
- **Design tool**: Figma, or design in code
- **Stops for you**: design only, design and each commit, or none
- **Git**: commit, commit and push, or no commits
- **Models**: quality, balanced or economy
- **Skills**: all your projects, or this project only

Your answers are saved in `project-management/design-unicorn/profile.md`.
