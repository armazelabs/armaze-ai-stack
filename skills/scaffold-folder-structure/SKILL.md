---
name: scaffold-folder-structure
description: Scaffolds and enforces a product-design / documentation workspace for any project, organised around a research/ tree split into external (competitor) and internal (product-knowledge) research. Invoke to build the full folder tree (per-folder READMEs, rules docs, and seed living documents) or to look up where a file belongs and how it must be named. Use whenever setting up a new project workspace, adding files, or checking a naming, placement, or phase rule. Works for any product; the project name is configurable.
---

# Scaffold Folder Structure

This skill is a reusable, project-agnostic **product-design and documentation workspace** scaffold. It does two things:

1. **Scaffolds** the entire folder structure automatically - every folder, its README, the root `README.md` guide, the `rules/` documents, and the seed living documents (feature inventory, changelogs, open questions, decision log, modules index).
2. **Enforces** every naming rule, routing rule, phase gate, and golden rule below whenever files are created, moved, or named **inside the workspace tree**. It never renames or moves existing files, and repo-level conventional files (`README.md`, `CLAUDE.md`, `package.json`, etc.) are out of scope - see the exceptions under the naming rules and the coexistence rule below.

The structure encodes a proven workflow: product knowledge -> research -> UX structure, with institutional-memory docs and per-module work areas alongside. All research lives under a single `research/` tree split into **external** (competitor and market-facing) and **internal** (the product's own knowledge). It is generic - drop it into any project and pass that project's name.

---

## How to Run the Scaffold

When the user asks to set up, recreate, scaffold, or repair the workspace, run the bundled script:

```bash
bash .claude/skills/scaffold-folder-structure/scripts/scaffold.sh [target-root] [project-name]
```

- `target-root` - where to build the structure. Defaults to the current directory.
- `project-name` - the display name written into generated docs. Defaults to the target directory's name.

Examples:

```bash
# Scaffold the current directory, project name = current folder name
bash .claude/skills/scaffold-folder-structure/scripts/scaffold.sh

# Scaffold a new project folder with an explicit display name
bash .claude/skills/scaffold-folder-structure/scripts/scaffold.sh ./acme-platform "Acme Platform"
```

The script is **idempotent and non-destructive**: it `mkdir -p`s every folder and writes each file **only if it does not already exist**. Re-running never overwrites existing work - it fills in anything missing and reports how many files were created versus skipped.

After running, confirm to the user which folders/files were created versus already present.

---

## Coexisting with Application Code

The scaffold is **additive-only** and describes the documentation workspace, not the whole repository. When the target root is an existing project (it has `package.json`, `Gemfile`, `src/`, or any other application files):

- **Never move, relocate, or reorganize existing files.** `package.json`, lockfiles, configs, and source folders stay exactly where developers expect them - at the repo root.
- **Never create an `app/` (or similar) wrapper folder** to separate the code from the docs. The workspace folders (`research/`, `rules/`, `project-management-log/`, `feature.md`) are simply added alongside the existing files.
- The structure diagram below shows only what the scaffold adds. An existing repo will have other files at `[root]/` - that is expected and correct.
- If the user wants the docs kept separate from the code, scaffold **into a subfolder** by passing it as `target-root` (e.g. `./docs`) - still moving nothing.

---

## The Structure

```
[root]/
├── feature.md                  Master feature inventory (status per feature)
├── research/
│   ├── CHANGELOG.md            Top-level research changelog
│   ├── external/               Competitor and market-facing research
│   │   ├── CHANGELOG.md
│   │   └── competitor-analysis/
│   │       ├── profiles/                One file per competitor
│   │       ├── feature-matrix.md
│   │       ├── pricing-comparison.md
│   │       ├── pain-points.md
│   │       └── opportunities.md
│   └── internal/               The product's own knowledge and research
│       ├── CHANGELOG.md
│       └── product-knowledge/
│           ├── overview/                Vision, persona hierarchy
│           ├── modules/                 Per-module workspace (definition, userflows, notes, research)
│           ├── user-personas/
│           ├── ux-research/             Kickoff findings, moodboard references
│           ├── open-questions.md
│           ├── information-architecture.md
│           └── sitemap.md
├── rules/
│   ├── file-naming-rule.md
│   ├── version-control-rule.md
│   └── product-decision.md
└── project-management-log/     Institutional memory
    ├── CHANGELOG.md
    ├── decisionlog.md
    ├── meeting-notes/
    ├── requirement-updates/
    └── feedback/
        └── date/
```

---

## Mandatory File Naming Rules

These apply to every file and folder created or edited **inside the workspace tree** (`research/`, `rules/`, `project-management-log/`, `feature.md`, and the folder readmes the scaffold generates).

1. **Kebab-case only.** Lowercase words separated by hyphens. No spaces, no underscores, no PascalCase, no camelCase. (e.g. `user-personas`, `feature-matrix.md`)
2. **No capital letters** in workspace folder or file names (e.g. `feature-matrix.md`, not `Feature-Matrix.md`).
3. **No numbers in folder names.** Folders are named by purpose, not sequence (`research/`, never `01-research/`).
4. **No em dashes in file content.** Use a regular hyphen (`-`) instead, everywhere.
5. **Date format** on time-sensitive files (research, meeting notes, competitor profiles, changelogs): `YYYY-MM` or `YYYY-MM-DD`. Never ambiguous formats like `06-22` or `Jun22`.
6. **Version numbers** on revisable documents: `v1`, `v2`, etc.
7. **Be descriptive.** `image1.png` is invalid; `competitor-homepage-2026-06.png` is correct.

### Conventional files stay uppercase - everywhere, not just at the root

Files whose uppercase names are established tool or ecosystem conventions keep that exact casing wherever they appear, **including inside the workspace tree**: `README.md`, `CHANGELOG.md`, `CLAUDE.md`, `AGENTS.md`, `SKILL.md`, `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `Makefile`, `Dockerfile`, and similar. Renaming them breaks the tools, hosts, and humans that look for those names.

This is not merely an exemption from rule 1 - it is the **opposite** rename. A per-folder readme must be `README.md`, never `readme.md`, and a changelog must be `CHANGELOG.md`, never `changelog.md`. Lowercasing one of these is as much a violation as capitalising an ordinary workspace file, and `fix-file-casing.sh` repairs both directions.

Note the boundary: `decisionlog.md`, `feature.md`, `open-questions.md`, `sitemap.md`, and the rest are **not** conventional names - no tool looks for them - so they follow the lowercase kebab-case rule normally.

**Never rename application files to satisfy these rules.** They govern the documentation workspace; source code, configs, and build artifacts are out of scope entirely.

### Fixing a name that is already committed

macOS and Windows use case-insensitive filesystems, and git there defaults to `core.ignorecase = true`. That creates a trap: once a file is committed as `Feature-Matrix.md`, renaming it to `feature-matrix.md` with a plain `mv` changes **nothing git can see**. `git status` stays clean, the wrong name survives in history and in every other clone, and case-sensitive Linux CI may then fail to resolve the path. Renaming the file does not solve the problem, because the problem lives in the git index, not on disk.

There are two distinct situations, and they need different repairs:

| Situation | Repair |
|---|---|
| Wrong name on disk **and** in git | Rename via a temporary third name, so git records a real delete + add: `git mv -f old.md tmp-x` then `git mv -f tmp-x new.md` |
| Right name on disk, wrong name still in git (someone already did a plain `mv`) | Re-point the index: `git rm --cached "Old-Name.md"` then `git add "old-name.md"` |

The second is invisible to any filesystem scan - the only way to detect it is to compare `git ls-files` against the real on-disk spelling.

Both are automated by the bundled script:

```bash
bash .claude/skills/scaffold-folder-structure/scripts/fix-file-casing.sh            # report only
bash .claude/skills/scaffold-folder-structure/scripts/fix-file-casing.sh . --fix    # repair
```

It scans the workspace tree only, skips the conventional uppercase filenames listed above, stages the renames, and never commits - review with `git status` and commit yourself. Run it after any bulk file creation, and before handing the repo to anyone on Linux.

Note that a rename already pushed to a remote must be pushed again after repair; teammates who pulled the old spelling may need a fresh checkout of those paths, since their local filesystem will also resist the case change.

### Naming patterns by file type

| Type | Pattern | Example |
|---|---|---|
| Research file | `[topic]-[date].md` | `market-analysis-2026-06.md` |
| Competitor profile | `[competitor-name].md` | `acme.md` |
| Competitor pricing | `pricing-[competitor]-[date].md` | `pricing-acme-2026-06.md` |
| Module definition | `[module-name].md` (inside its module folder) | `game-lobby.md` |
| Meeting notes | `meeting-[YYYY-MM-DD]-[topic].md` | `meeting-2026-06-22-kickoff.md` |
| Feedback note | `[NN].feedback.md` (inside `feedback/date/`) | `01.feedback.md` |
| Template | `[type]-template.md` | `meeting-notes-template.md` |

Decision and change log entries are added **inside** `decisionlog.md` / `CHANGELOG.md` - they are never separate files.

### Version numbering

- Start at `v1` - never `v0`, `v0.1`, `draft`, `final`, `new`, or `latest`.
- Increment by 1 for each round of significant changes (`v1` -> `v2`).
- Add a letter suffix for minor fixes within a version (`v2a`, `v2b`).
- **Never overwrite** a version - save a new file. Version numbers live in the file name, not the content.

---

## Phase-Gated Workflow

Work flows through these phases **in order**. Do not place content in a later phase's folder until the prior phase has sign-off. Log every phase-gate approval in `project-management-log/decisionlog.md`.

```
Phase 1 - Product Knowledge    research/internal/product-knowledge/          Sign-off: Product Lead
Phase 2 - Research             research/external/ + research/internal/       Sign-off: Product Lead + Lead Designer
                               (+ modules/[name]/research/)
Phase 3 - UX Structure         research/internal/product-knowledge/          Sign-off: Product Lead + Lead Designer + Stakeholder
                               (information-architecture.md, sitemap.md)
```

---

## File Routing - Where Content Goes

| Content type | Destination |
|---|---|
| Feature inventory | `feature.md` |
| Product vision or overview | `research/internal/product-knowledge/overview/` |
| Module definitions | `research/internal/product-knowledge/modules/[name]/` |
| Open product questions | `research/internal/product-knowledge/open-questions.md` |
| User personas | `research/internal/product-knowledge/user-personas/` |
| Market or industry research | `research/external/` |
| User interviews, surveys, usability tests | `research/internal/product-knowledge/ux-research/` |
| Competitor profile | `research/external/competitor-analysis/profiles/` |
| Feature comparison | `research/external/competitor-analysis/feature-matrix.md` |
| Competitor pricing | `research/external/competitor-analysis/pricing-comparison.md` |
| Competitor pain points | `research/external/competitor-analysis/pain-points.md` |
| Strategic opportunities | `research/external/competitor-analysis/opportunities.md` |
| Module-specific research | `research/internal/product-knowledge/modules/[name]/research/` |
| Information architecture | `research/internal/product-knowledge/information-architecture.md` |
| Sitemap | `research/internal/product-knowledge/sitemap.md` |
| Meeting notes | `project-management-log/meeting-notes/` |
| Requirement updates | `project-management-log/requirement-updates/` |
| Team / stakeholder feedback | `project-management-log/feedback/` |
| Any decision made | `project-management-log/decisionlog.md` |
| Any change to the project | `project-management-log/CHANGELOG.md` |
| Technical specs: design system, architecture, API contracts, implementation plans | **Not in the workspace tree.** These belong beside the code they describe (e.g. `design-system/`), because they are read by developers alongside the source and often ship with a hand-off. Log the *decision* in `decisionlog.md` and keep the *specification* with the code. |

---

## The Golden Rules

1. Read the README before adding anything to a folder.
2. Document the same day. Meetings, decisions, changes - all logged before the day ends.
3. One topic per file. No monolith documents.
4. No file called "Final." Use version numbers.
5. No phase skipping. Product knowledge before research, research before UX structure.
6. Every open question has an owner. See `research/internal/product-knowledge/open-questions.md`.
7. The module master docs are auto-generated. Never edit `master-doc.md` by hand.

---

## Product Knowledge Rule

Never infer or assume product details (module names, features, user roles, business goals). All product content must come directly from what the product owner / stakeholder provides. If product details are unknown, leave a placeholder and flag it in `research/internal/product-knowledge/open-questions.md`. The scaffold deliberately seeds module folders/indexes as empty placeholders for this reason - do not invent modules.

---

## Module Master-Doc Convention

If a master-doc sync skill is installed in the project, then after any create, edit, or delete of a `.md` file inside `research/internal/product-knowledge/modules/[name]/research/`, regenerate `research/internal/product-knowledge/modules/[name]/master-doc.md` via that skill, and never edit `master-doc.md` directly. If no such skill exists, treat `master-doc.md` as a manually maintained combined document or omit it.

---

## Ownership (RACI summary)

| Path | Primary owner |
|---|---|
| `research/internal/product-knowledge/` | Product Lead |
| `research/external/` | Researcher / Product Lead |
| `research/internal/product-knowledge/ux-research/`, IA, sitemap | Lead Designer |
| `research/internal/product-knowledge/modules/` | Product Lead |
| `project-management-log/` | Product Lead |
| `rules/` | Product Lead |

---

## What the Scaffold Produces

Running the script creates/ensures:

- **The folder tree** of the workspace, with a purpose `README.md` in each content folder (`profiles/`, `overview/`, `user-personas/`, `ux-research/`, `meeting-notes/`, `requirement-updates/`).
- **Root `README.md`** - structure, phase workflow, golden rules, naming conventions, and the routing table. If a lowercase `readme.md` already exists, that one is targeted instead and left untouched, so no case-duplicate pair is ever created; run `fix-file-casing.sh` to normalise it.
- **`rules/` docs**: `file-naming-rule.md`, `version-control-rule.md`, `product-decision.md`.
- **Seed living documents**: `feature.md`; the three `CHANGELOG.md` files (`research/`, `research/external/`, `research/internal/`); the competitor working docs (`feature-matrix.md`, `pricing-comparison.md`, `pain-points.md`, `opportunities.md`); `research/internal/product-knowledge/` `open-questions.md`, `information-architecture.md`, `sitemap.md`; `project-management-log/decisionlog.md` and `CHANGELOG.md`; a sample `feedback/date/01.feedback.md`; and the modules index at `research/internal/product-knowledge/modules/README.md`.

Generated docs use the project name passed to the script (or the directory name by default). Anything that already exists is left untouched.
