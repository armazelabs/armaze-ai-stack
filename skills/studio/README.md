# Studio Commands

The `/studio` commands that set up, run, check and stop the Design Unicorn team in your project.

Two kinds of commands below:

- **Terminal**: type it in your terminal (zsh), in your project's folder.
- **Claude**: type it in the Claude window, after the director has started.

## 1. Add It to Your Project

The `/studio` commands come with Design Unicorn. **Terminal**, in your project's folder:

```
aistack add design-unicorn
```

This adds the team, these commands and `time-tracker`.

## 2. Start the Director

**Terminal**, in the same folder:

```
claude --agent design-unicorn
```

Claude opens with the director, the helper you talk to. It waits for you to type first.

## 3. Set It Up

**Claude**: type

```
/studio setup
```

(Typing `set up` does the same.) The director reads your project, then asks you six questions, with choices you click:

1. **Is this your stack?** It shows what it found (for example "Expo SDK 54 · React Native · TypeScript"). Pick Looks right, Fix something, or Not built yet.
2. **Where do designs live?** Figma (then paste the file link), or design in code.
3. **When should the crew stop for you?** Design only, design and before each commit, or never.
4. **What should the crew do with git?** Commit but don't push, commit and push, or no commits.
5. **Which models?** Quality, balanced or economy: better work costs more.
6. **Where do the design skills go?** All your projects, or this project only.

Then it installs the design skills that fit your stack and saves your answers in `project-management/design-unicorn/profile.md`.

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

## 5. Every Command

All of these are **Claude** commands, typed in the director's window after setup.

### `/studio work <idea or task id>`

Starts work. Give it an idea ("a settings screen with a dark mode switch") to make a new task, or a task id (`T-003`) to carry one on. With nothing after it, the team takes the next task on the board, then the next, until the list is empty or something waits for you.

### `/studio quick <change>`

A small change with no new design, such as a copy fix or a spacing tweak. The engineer builds it and the reviewer checks it; no designer, no design approval. Then it is committed the way you chose in setup.

### `/studio board`

Shows the board: each task in progress, who is on it, what waits for you, the hours left, and the latest activity.

### `/studio stand-down`

Stops all work now. Each helper finishes its current step, writes down where it stopped, and waits. Nothing is undone.

### `/studio resume [task id]`

Carries on after a stand-down, or when you come back another day. With a task id, it picks that task up; without one, it lists the unfinished tasks and asks which comes first.

### `/studio rollback <task id>`

Undoes a task's code. Not committed yet: it shows the files and discards the changes only after you say yes. Already committed: it reverts that commit, after you say yes. The task goes back on the board.

### `/studio setup`

Changes your setup answers. It asks which part to change (stack, design tool, stops and git, models and skills) and keeps everything else.

### `/studio start`

Orca only. Opens every helper in its own Orca tab, so you can watch them all work. Running it again reopens only tabs you closed.

### `/studio stop`

Orca only. Closes those tabs. Work in progress is kept; `/studio start` and `/studio resume` pick it up.

### `/studio`

On its own, it shows the board and this list of commands.

## Example

**You** (**Terminal**): `claude --agent design-unicorn`

**You** (**Claude**): `/studio setup`

**Director**: Found Expo SDK 54, React Native, TypeScript. Is this your stack?

**You**: Looks right.

**Director**: (five more questions, then) Set up. Installed 7 design skills. Next: /time-tracker setup, then /reload-skills, then tell me what to build.

## Tips

- Run `/studio setup` again any time. It only changes what you pick.
- `/studio stand-down` stops the team at once. Nothing is lost.
- A quick change is still checked by the reviewer before it is done.

## Related

- `design-unicorn` is the team these commands drive
- `time-tracker` is set up with `/time-tracker setup`
