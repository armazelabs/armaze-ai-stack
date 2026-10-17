# Skills

One directory per skill. A skill is a focused, instruction-driven capability an AI assistant loads on demand — "review this PR", "write a changelog", "triage this bug".

## On the shelf

| Skill | What it does | Needs |
|---|---|---|
| `better-ui` | Exact values for radius, optical alignment, shadows, icon states and motion when polishing UI. From jakubkrehel/skills on GitHub. | |
| `changelog-generator` | Writes a user-facing changelog from git commits. Composio's, from GitHub. | git |
| `code-to-figma` | Pushes a screen or component from the code into Figma. Writes only when asked. | Figma MCP |
| `content-research-writer` | Researched writing with citations, hooks, outlines and feedback on each section. Composio's, from GitHub. | |
| `create-competitor-profile` | Writes a new, fully sourced competitor profile in the research tree. | |
| `design-taste-frontend` | Art direction for landing pages and public web pages, against the generic AI look. From Leonxlnx/taste-skill on GitHub. | |
| `emil-design-eng` | Emil Kowalski's approach to UI polish, component design and animation decisions. From emilkowalski/skills on GitHub. | |
| `expo-animation` | Animations in Expo and React Native apps. From expo/skills on GitHub. | Expo |
| `expo-native-ui` | Native-feeling UI in Expo apps: controls, icons, effects, media, storage. From expo/skills on GitHub. | Expo |
| `feedback-intake` | Files feedback one file per date, with categories, severity and de-duplication. Imports from FigJam. | Figma MCP (optional) |
| `figma-to-code` | Implements a Figma frame or a claude.ai/design handoff as code. | Figma MCP |
| `grill-me` | Starts a relentless interview to sharpen a plan or design. It runs `grilling`, so adding it adds that too. From mattpocock/skills on GitHub. | |
| `grilling` | Questions you round by round about a plan, decision or idea, with a recommended answer for each, until you agree on every branch. From mattpocock/skills on GitHub. | |
| `module-docs` | One living page per product module: what is built, what is next, and a dated history of what changed, why, how it was planned and what was decided. Asks after each task; can commit and push only the docs. | Node, git |
| `product-teardown` | Researches a product module by module, with a screenshot of every screen and state and every element listed. | Orca |
| `project-kickoff` | One-time setup of a new project's AI layer. Started by `aistack init`; removes itself afterwards. | |
| `remove-ai-marks` | Strips AI provenance marks: invisible Unicode, watermarks, C2PA and other metadata. From watermarks-remover on GitHub. | |
| `research-workspace` | Sets up and looks after the research tree in `project-management/research/`. | |
| `rooter` | Builds a client-facing entry page that sends clients to the right version, deck or Figma file. | |
| `site-to-figma` | Pulls a live site's design system into Figma: variables (with light and dark modes), text and shadow styles, components, icons, and the page itself tied to those tokens. Saves W3C design tokens too. | Orca, Figma MCP |
| `sync-repo` | Syncs pushed commits into a cleaned copy of the repo for the client, one commit each with the same dates: no AI files, internal docs or Figma references, comments checked to be the only change. Optional Playwright comparison of both apps; pushes only on a yes. | Node, git |
| `time-tracker` | Timesheets measured from Claude Code sessions and commits, with manual hours, budgets and PDFs. | Node |
| `update-competitor-profile` | Proposes updates to existing competitor profiles and applies them only after approval. | |
| `unicorn` | The `/unicorn` command for the design-unicorn crew: setup (checks your stack, installs the skills it uses), roll-out, quick fix, board, stand-down, resume, rollback. Comes with `agents/design-unicorn`. | |
| `ux-visualization-assistant` | Picks and builds the right UX artifact: flows, journeys, information architecture, personas. | |
| `whats-new-generator` | Sets up and maintains a changelog system and "what's new" posts in a project. | |

`aistack list` shows the same list with each skill's full description. When you add, rename or remove a skill, update this table in the same change.

## Skills from other repos

Some skills are used as their authors publish them on GitHub. The stack keeps a copy, so members install it like any other skill, and an `UPSTREAM` file beside it records where it comes from:

```
url: https://github.com/OWNER/REPO/tree/BRANCH/PATH
commit: <the upstream commit this copy matches>
```

The copy only changes when the stack's maintainer takes a new version. In your checkout of the stack, `aistack upstream` (or `aistack upstream NAME`) fetches each one, shows what changed upstream (the commits, a compare link, and the files that would change), and replaces the copy only when you answer `y`. Review it with `git diff`, add a CHANGELOG line, commit and push; members get it with `aistack update`. Without a terminal it only reports.

- A skill that only works with another one adds a `needs: <skill>` line (grill-me has `needs: grilling`). Adding it, in the app or with `aistack add`, then adds that skill too, unless the project or your global skills have it.
- To add one, copy the folder in, then write its `UPSTREAM` file. `aistack upstream NAME` should then say "same as upstream".
- Don't edit these copies here. Change them upstream, or turn one into a skill of our own by deleting its `UPSTREAM` file.

## Writing a skill

```
skills/<name>/
├── SKILL.md        # required — front matter + the instructions themselves
├── README.md       # required — the page for people, in the README standard below
├── references/     # optional supporting docs the instructions point to
└── scripts/        # optional helpers (zsh preferred; keep them portable)
```

`SKILL.md` starts with YAML front matter. `name` must match the directory name; `description` is one line — it is what `aistack list` shows and what an assistant reads to decide when to use the skill. A skill (or agent) that can't work without other skills lists them in a `needs:` line, space-separated (`needs: unicorn time-tracker`); `aistack add` and the app then add them too, unless the project or your global skills have them.

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

## README standard

Every skill and agent of our own has a `README.md`: the page people read. The `aistack` app shows it beside the list, and its `#` heading is the component's title there. `SKILL.md` stays the instructions an assistant follows, and is never rewritten to fit this page. The shape comes from changelog-generator's doc, but it's written out here so it doesn't change when that upstream copy does.

```markdown
# <Title in Title Case>

<A TL;DR: one or two sentences, what it does and what you end up with.>

## When to Use This Skill

- <a situation, one per bullet>

## What This Skill Does

1. **<Bold lead>**: <a few words>

## How to Use

### Basic Usage

<the phrase, slash command or `aistack` line a person types>

### <A variant>

<another phrase, an option, or a setup step: one ### per variant>

## Example

<a realistic request and the result: a short exchange or output block>

## Tips

- <practical advice>

## Related Use Cases

- <other shelf components or tasks it pairs with>
```

- All eight parts, in this order. Leave out Example or Related Use Cases only when there is truly nothing to put there.
- Keep it short, like changelog-generator's. The intro is a TL;DR of one or two sentences (about 35 words at most), with no detail the sections below give. What This Skill Does has 3 to 6 steps, each a bold lead and a few words on one line. Bullets elsewhere are one line each.
- Agents say "This Agent" in place of "This Skill".
- Reference material that fits none of them (setup, files, configuration) goes in extra `##` sections after Related Use Cases, never between the standard ones.
- The title is in Title Case: Module Docs, Project Kickoff, What's New Generator.
- Write it from the component's own `SKILL.md` and references only: no feature, option or command the component doesn't have. Keep to about 50–100 lines, plus any extra sections, in English, with no YAML front matter (`aistack list` keeps reading the description from `SKILL.md`).
- Change the README in the same change as anything in `SKILL.md` that it describes.
- A skill with an `UPSTREAM` file keeps its authors' docs as they are: it gets no README of ours and is never normalized.

When asked to normalize the READMEs, rewrite every in-house skill's and agent's `README.md` to this standard and change nothing else.
