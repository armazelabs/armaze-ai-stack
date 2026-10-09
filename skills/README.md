# Skills

One directory per skill. A skill is a focused, instruction-driven capability an AI assistant loads on demand — "review this PR", "write a changelog", "triage this bug".

## On the shelf

| Skill | What it does | Needs |
|---|---|---|
| `changelog-generator` | Writes a user-facing changelog from git commits. | git |
| `code-to-figma` | Pushes a screen or component from the code into Figma. Writes only when asked. | Figma MCP |
| `content-research-writer` | Researched writing with citations, hooks, outlines and feedback on each section. | |
| `create-competitor-profile` | Writes a new, fully sourced competitor profile in the research tree. | |
| `feedback-intake` | Files feedback one file per date, with categories, severity and de-duplication. Imports from FigJam. | Figma MCP (optional) |
| `figma-to-code` | Implements a Figma frame or a claude.ai/design handoff as code. | Figma MCP |
| `product-teardown` | Researches a product module by module, with a screenshot of every screen and state and every element listed. | Orca |
| `project-kickoff` | One-time setup of a new project's AI layer. Started by `aistack init`; removes itself afterwards. | |
| `remove-ai-marks` | Strips AI provenance marks: invisible Unicode, watermarks, C2PA and other metadata. | |
| `research-workspace` | Sets up and looks after the research tree in `project-management/research/`. | |
| `rooter` | Builds a client-facing entry page that sends clients to the right version, deck or Figma file. | |
| `site-to-figma` | Pulls a live site's design system into Figma: variables (with light and dark modes), text and shadow styles, components, icons, and the page itself tied to those tokens. Saves W3C design tokens too. | Orca, Figma MCP |
| `time-tracker` | Timesheets measured from Claude Code sessions and commits, with manual hours, budgets and PDFs. | Node |
| `update-competitor-profile` | Proposes updates to existing competitor profiles and applies them only after approval. | |
| `ux-visualization-assistant` | Picks and builds the right UX artifact: flows, journeys, information architecture, personas. | |
| `whats-new-generator` | Sets up and maintains a changelog system and "what's new" posts in a project. | |

`aistack list` shows the same list with each skill's full description. When you add, rename or remove a skill, update this table in the same change.

## Writing a skill

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
