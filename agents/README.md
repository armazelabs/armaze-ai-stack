# Agents

One Markdown file per agent — or, when an agent needs supporting files, one directory. An agent is a role definition — who it is, what it is for, which tools it may use, and how it should approach its class of problems.

```
agents/<name>.md            # single-file agent
agents/<name>/AGENT.md      # directory agent — entry document, plus whatever it needs alongside
```

A directory agent is discovered by its `AGENT.md` (a `SKILL.md` is accepted too, for packages that arrive written that way) and is copied as a whole folder into the target's agents directory.

Each file starts with YAML front matter. `name` must match the file name; `description` is one line and doubles as the "when to use me" hint that assistants read.

```markdown
---
name: reviewer
description: Reviews a diff for correctness and security. Use before opening a PR or when asked for a second opinion on a change.
tools: Read, Grep, Glob, Bash
model: sonnet
---

You are a meticulous code reviewer for Armaze projects. ...
```

Conventions:

- Names are lowercase kebab-case.
- Files and directories starting with `.` or `_`, and this `README.md`, are ignored by `aistack`.
- `tools` and `model` follow the Claude Code sub-agent format; other platforms ignore keys they don't know, so it's safe to keep them.
- Keep the agent self-contained — it is copied as a unit into other repos, so a directory agent must not reference anything outside its own folder.
