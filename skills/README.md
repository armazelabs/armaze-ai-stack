# Skills

One directory per skill. A skill is a focused, instruction-driven capability an AI assistant loads on demand — "review this PR", "write a changelog", "triage this bug".

```
skills/<name>/
├── SKILL.md        # required — front matter + the instructions themselves
├── references/     # optional supporting docs the instructions point to
└── scripts/        # optional helpers (zsh preferred; keep them portable)
```

`SKILL.md` starts with YAML front matter. `name` must match the directory name; `description` is one line — it is what `aistack list` shows and what an assistant reads to decide when to use the skill.

```markdown
---
name: pr-review
description: Review a pull request diff for correctness, security and style; use before requesting review from a teammate.
---

# PR review

1. ...
```

Conventions:

- Names are lowercase kebab-case (`pr-review`, not `PR_Review`).
- Directories starting with `.` or `_` are ignored by `aistack` — use `_drafts/` for work in progress.
- Keep the instructions platform-neutral. If a step only makes sense in one tool, say so in the text rather than depending on that tool's private format.
- Don't reference files outside the skill directory; the directory is copied as a unit into other repos.
- Every document a component writes - logs, feedback, decisions, time tracking, product docs, workspace guides and rules, design docs - goes under `project-management/` at the target repo's root, spelled exactly that way. Never create `project-management-log/`, `Project Management/`, `project_management/`, a root `docs/` or any other top-level folder of your own for it. Only what a tool looks for at the root stays there: `CLAUDE.md`, `AGENTS.md`, `.claude/`, `.mcp.json`, `.gitignore`, `package.json`, and the release notes in `CHANGELOG.md`. When a project already has an older root copy of a doc, keep using it rather than starting a second one.
