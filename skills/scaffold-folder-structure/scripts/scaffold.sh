#!/usr/bin/env bash
#
# scaffold.sh - Scaffolds a product-design / documentation workspace.
#
# Builds a phase-gated product documentation structure organised around a
# single research/ tree split into external (competitor/market-facing) and
# internal (the product's own knowledge) research, plus a slim rules/ folder
# and a project-management-log/ for institutional memory.
#
# Idempotent and non-destructive:
#   - Directories are created with `mkdir -p` (safe to re-run).
#   - Every file is written ONLY if it does not already exist, so existing
#     work is never overwritten.
#
# Usage:
#   bash scaffold.sh [target-root] [project-name]
#
#   target-root   Where to build the structure. Default: current directory.
#   project-name  Display name used inside generated docs. Default: the
#                 target directory's name.
#
# Examples:
#   bash scaffold.sh
#   bash scaffold.sh ./my-new-project
#   bash scaffold.sh ./my-new-project "Acme Platform"

set -euo pipefail

ROOT="${1:-$PWD}"
mkdir -p "$ROOT"
cd "$ROOT"

ROOTNAME="$(basename "$ROOT")"
PROJECT="${2:-$ROOTNAME}"

created=0
skipped=0

# write_if_absent <relative-path> then heredoc on stdin.
# Placeholders __PROJECT__ and __ROOTNAME__ are substituted before writing.
write_if_absent() {
  local path="$1"
  mkdir -p "$(dirname "$path")"
  if [ -e "$path" ]; then
    skipped=$((skipped + 1))
    cat >/dev/null   # consume heredoc
  else
    sed -e "s|__PROJECT__|${PROJECT}|g" -e "s|__ROOTNAME__|${ROOTNAME}|g" >"$path"
    created=$((created + 1))
  fi
}

# folder_readme <relative-folder> <purpose-line> <phase>
folder_readme() {
  local dir="$1" purpose="$2" phase="$3"
  mkdir -p "$dir"
  local name
  name="$(basename "$dir")"
  # README.md keeps its conventional uppercase spelling. It is a recognised
  # ecosystem name, not a workspace file, so the lowercase kebab-case rule
  # does not apply to it. An existing lowercase readme.md is treated as the
  # same file so re-running never produces a case-duplicate pair.
  local existing="$dir/README.md"
  [ -e "$dir/readme.md" ] && existing="$dir/readme.md"

  if [ -e "$existing" ]; then
    skipped=$((skipped + 1))
  else
    {
      printf '# %s\n\n' "$name"
      printf '%s\n\n' "$purpose"
      printf '%s\n\n' "$phase"
      printf 'Read this README before adding anything here. Follow the naming rules in `rules/file-naming-rule.md` and the routing table in `README.md`.\n'
    } >"$dir/README.md"
    created=$((created + 1))
  fi
}

echo "Scaffolding workspace \"$PROJECT\" at: $ROOT"
echo ""

# ---------------------------------------------------------------------------
# Container folders (no readme - they hold a changelog or seed docs instead)
# ---------------------------------------------------------------------------
mkdir -p \
  research/external/competitor-analysis \
  research/internal/product-knowledge/modules \
  rules \
  project-management-log/feedback/date

# ---------------------------------------------------------------------------
# Folders that carry a purpose README
# ---------------------------------------------------------------------------

# Phase 2 - External research
folder_readme "research/external/competitor-analysis/profiles" "One file per competitor (direct and indirect) - overview, strengths, weaknesses, pricing, UX notes." "Phase 2 - Research. Sign-off: Product Lead + Lead Designer."

# Phase 1 - Internal product knowledge
folder_readme "research/internal/product-knowledge/overview"      "Product vision, purpose, positioning, persona hierarchy." "Phase 1 - Product Knowledge. Sign-off: Product Lead."
folder_readme "research/internal/product-knowledge/user-personas" "Persona profiles: goals, pain points, behaviours." "Phase 1 - Product Knowledge."
folder_readme "research/internal/product-knowledge/ux-research"   "Usability tests, kickoff findings, moodboard references." "Phase 2 - Research."

# Cross-phase institutional memory
folder_readme "project-management-log/meeting-notes"      "Notes from every team meeting with decisions and actions." "Cross-phase. Owner: Product Lead."
folder_readme "project-management-log/requirement-updates" "Changes to product requirements over time." "Cross-phase."

# ---------------------------------------------------------------------------
# Root README.md - structure, phases, routing, golden rules
#
# README.md is the conventional spelling and the default. An existing
# lowercase readme.md is targeted instead, so write_if_absent skips it rather
# than creating a case-duplicate pair (which breaks on case-sensitive
# filesystems). Run fix-file-casing.sh to normalise an existing lowercase one.
# ---------------------------------------------------------------------------
root_readme="README.md"
[ -e "readme.md" ] && root_readme="readme.md"
write_if_absent "$root_readme" <<'EOF'
# __PROJECT__

Product documentation and design knowledge base for **__PROJECT__**. The workspace itself is markdown documents, research files, and process templates. It lives alongside any application code in this repository - the folders below describe only the documentation tree, not the whole repo.

It is organised as a phase-gated workspace: product knowledge flows into research, and research into UX structure (information architecture and sitemap).

---

## Folder Structure

```
__ROOTNAME__/
├── feature.md                  Master feature inventory (status per feature)
├── research/
│   ├── CHANGELOG.md            Top-level research changelog
│   ├── external/               Competitor and market-facing research
│   │   ├── CHANGELOG.md
│   │   └── competitor-analysis/
│   │       ├── profiles/                One file per competitor
│   │       ├── feature-matrix.md        Side-by-side comparison
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
├── rules/                      Workspace rules
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

This tree shows only the documentation workspace. Application files (`package.json`, source folders, configs, etc.) live alongside it at the root and must never be moved into or reorganized around these folders.

---

## Phase-Gated Workflow

Work flows through three phases in order. Nothing moves to a later phase until the prior phase has sign-off, and every gate approval is logged in `project-management-log/decisionlog.md`.

```
Phase 1 - Product Knowledge    research/internal/product-knowledge/     Sign-off: Product Lead
Phase 2 - Research             research/external/ + research/internal/  Sign-off: Product Lead + Lead Designer
Phase 3 - UX Structure         research/internal/product-knowledge/     Sign-off: Product Lead + Lead Designer + Stakeholder
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

## Conventions

- Kebab-case only for workspace folders and files. Lowercase, hyphen-separated. No spaces, no underscores, no capitals. Conventional files (`README.md`, `CLAUDE.md`, `LICENSE`, etc.) keep their standard casing and are never renamed.
- No numbers in folder names - folders are named by purpose, not sequence.
- Dates on time-sensitive files: `YYYY-MM` or `YYYY-MM-DD`.
- Version numbers on revisable files: `v1`, `v2`, etc. There is no file called "Final."
- No em dashes in file content - use a regular hyphen.

Full naming rules are in `rules/file-naming-rule.md`.
EOF

# ---------------------------------------------------------------------------
# rules/ docs
# ---------------------------------------------------------------------------
write_if_absent "rules/file-naming-rule.md" <<'EOF'
# File Naming Rule

Consistent file naming keeps the project navigable as it grows. These rules apply to every file and folder created inside the workspace tree (`research/`, `rules/`, `project-management-log/`, `feature.md`).

---

## General Rules

1. **Kebab-case only.** Workspace folder and file names use lowercase words separated by hyphens. No spaces, no underscores, no PascalCase, no camelCase.
2. **No numbers in folder names.** Folders are named by purpose, not by sequence (e.g., `research/` not `01-research/`).
3. **Lowercase only.** No capital letters in workspace folder or file names.
4. **No em dashes in file content.** Use a regular hyphen (`-`) instead of an em dash in all written content.
5. **Include the date** on all time-sensitive files (research, meeting notes, competitor profiles, changelogs).
6. **Include the version number** on all files that will go through revisions.
7. **Be descriptive.** `image1.png` is not a valid file name. `competitor-homepage-2026-06.png` is.

---

## Exceptions - Conventional Files Keep Their Casing

Files whose uppercase names are established tool or ecosystem conventions are exempt from the lowercase rules: `README.md`, `CLAUDE.md`, `AGENTS.md`, `SKILL.md`, `LICENSE`, `CONTRIBUTING.md`, `CHANGELOG.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `Makefile`, `Dockerfile`, and similar. Renaming them breaks the tools that look for them.

Never rename an existing file to lowercase to satisfy these rules. They govern new files placed into the workspace tree; source code, configs, and repo-root files are out of scope.

---

## Date Format

Always use `YYYY-MM` or `YYYY-MM-DD`. Never use ambiguous formats like `06-22` or `Jun22`.

---

## File Naming by Type

| Type | Pattern | Example |
|---|---|---|
| Research file | `[topic]-[date].md` | `market-analysis-2026-06.md` |
| Competitor profile | `[competitor-name].md` | `acme.md` |
| Competitor pricing | `pricing-[competitor]-[date].md` | `pricing-acme-2026-06.md` |
| Meeting notes | `meeting-[YYYY-MM-DD]-[topic].md` | `meeting-2026-06-22-kickoff.md` |
| Template | `[type]-template.md` | `meeting-notes-template.md` |

Decision and change log entries are added directly into `decisionlog.md` and `changelog.md` - they are not separate files.

---

## Version Numbering

- Start at `v1` - never `v0`, `draft`, `final`, `new`, or `latest`.
- Increment by 1 for each round of significant changes (`v1` -> `v2`).
- Add a letter suffix for minor fixes within a version (`v2a`, `v2b`).
- Never overwrite a version - save a new file. Version numbers live in the file name, not the content.

---

## What NOT to Do

| Bad | Good |
|---|---|
| `Final.fig` | `dashboard-homepage-v3.fig` |
| `New Version 2.fig` | `settings-profile-v2.fig` |
| `Screenshot 1.png` | `competitor-homepage-2026-06.png` |
| `Research notes.md` | `user-interview-p01-2026-06.md` |
EOF

write_if_absent "rules/version-control-rule.md" <<'EOF'
# Version Control Rule

How files are versioned across the project - covering documentation and assets.

---

## Versioning Principles

1. **Never overwrite.** Save a new version rather than overwriting the previous one.
2. **Version numbers are in the file name** - not in the file content, not in a separate tracking document.
3. **Only the latest version is "current"** - earlier versions are for reference, not active use.
4. **Every new version needs a reason** - log significant version changes in `project-management-log/CHANGELOG.md`.

---

## Version Numbering System

| Format | Use case |
|---|---|
| `v1`, `v2`, `v3` | Major versions - significant rewrites or scope changes |
| `v2a`, `v2b` | Minor iterations within a version - small tweaks |

Start at `v1`. Never use `v0`, `draft`, `final`, `new`, or `latest` as version identifiers.

---

## Documentation Files

- For living documents (decision log, change log, open questions) - update in place and use git commit messages to track what changed.
- For milestone snapshots - save as `[filename]-v1.md` and create a new versioned file when major changes occur.

---

## Git

- Commit frequently - at minimum, after completing each task.
- Commit messages should be descriptive: `Add competitor profile for X` not `Update files`.
- Use branch names in the format `[type]/[description]` - e.g., `docs/module-notes`, `research/competitor-x`.

---

## What "Final" Means

There is no file called "Final." There is only the current version. If a document is approved, the approval is noted in the Decision Log, not in the file name.
EOF

write_if_absent "rules/product-decision.md" <<'EOF'
# Product Decision Rule

How product decisions get made, recorded, and changed. Complements `file-naming-rule.md` and `version-control-rule.md`.

## Principles

- Product details (module names, features, user roles, business goals) are never inferred or assumed. They come directly from what the product owner provides. If a detail is unknown, leave a placeholder and flag it in `research/internal/product-knowledge/open-questions.md`.
- Every decision is logged in `project-management-log/decisionlog.md` with date, owner, and reason.
- Phase-gate approvals are decisions and must be logged the same way.

## Decision Workflow

1. Raise the question - capture it in `open-questions.md` if not yet resolved.
2. Decide - with the accountable owner.
3. Record - add an entry to `project-management-log/decisionlog.md`.
4. Propagate - update affected docs and note the change in the relevant changelog.

## What Counts as a Product Decision

- Scope changes (in/out for a release)
- Module definitions or renames
- User role or persona changes
- Business-goal or positioning shifts
- Phase-gate sign-offs
EOF

# ---------------------------------------------------------------------------
# Seed living documents
# ---------------------------------------------------------------------------
write_if_absent "feature.md" <<'EOF'
# Feature List

A complete, maintained inventory of every feature __PROJECT__ has or plans to have. This is the authoritative reference for what is built, in progress, or on the roadmap.

## Status Key

| Status | Meaning |
|---|---|
| Live | Built and shipped |
| In Progress | Currently being designed or developed |
| Planned | Confirmed on roadmap, not started |
| Exploring | Being considered, not confirmed |
| Out of Scope | Explicitly excluded from current plans |

## Features

| Feature | Module | Status | Notes |
|---|---|---|---|
| - | - | - | - |

## Guidelines

Never mark a feature as "Planned" without a clear owner. Update statuses after every sprint or design review.
EOF

write_if_absent "research/CHANGELOG.md" <<'EOF'
# Research Changelog

A chronological record of changes across all research - both external (competitor) and internal (product knowledge). Each `external/` and `internal/` folder keeps its own scoped changelog; this file is the top-level roll-up.

> **Rule:** Log any addition, removal, or significant revision of a research file here with a date and reason.

## How to Add an Entry

```
### [R-XXX] - [Short Title]
- **Date:** YYYY-MM-DD
- **Changed by:** Name
- **Scope:** External / Internal
- **What changed:** Be specific.
- **Reason:** Why the change was made.
- **Sources:** Links or file paths, if applicable.
```

## Changelog

_No entries yet._
EOF

write_if_absent "research/external/CHANGELOG.md" <<'EOF'
# External Research Changelog

A chronological record of changes to external research - competitor profiles, pricing comparisons, feature matrices, pain points, and opportunities.

> **Rule:** Log any addition, removal, or significant revision of an external research file here with a date and source.

## How to Add an Entry

```
### [E-XXX] - [Short Title]
- **Date:** YYYY-MM-DD
- **Changed by:** Name
- **Area:** Profiles / Feature matrix / Pricing / Pain points / Opportunities
- **What changed:** Be specific.
- **Reason:** Why the change was made.
- **Sources:** Links or file paths.
```

## Changelog

_No entries yet._
EOF

write_if_absent "research/internal/CHANGELOG.md" <<'EOF'
# Internal Research Changelog

A chronological record of changes to internal research - product knowledge, modules, personas, information architecture, sitemap, and UX research.

> **Rule:** Log any addition, removal, or significant revision of an internal research file here with a date and reason.

## How to Add an Entry

```
### [I-XXX] - [Short Title]
- **Date:** YYYY-MM-DD
- **Changed by:** Name
- **Area:** Overview / Modules / Personas / IA / Sitemap / UX research / Open questions
- **What changed:** Be specific.
- **Reason:** Why the change was made.
- **Related:** Links or file paths.
```

## Changelog

_No entries yet._
EOF

write_if_absent "research/external/competitor-analysis/feature-matrix.md" <<'EOF'
# Competitor Feature Matrix

Side-by-side comparison of __PROJECT__ against direct and indirect competitors.

**Status key:** Full | Partial | None | Planned

Add a column for each competitor as its profile is completed in `profiles/`.

| Feature | __PROJECT__ | Competitor A | Competitor B |
|---|:---:|:---:|:---:|
| - | | | |

## Key Observations

*(Fill in after completing competitor profiles)*

### Where __PROJECT__ Leads
-

### Where __PROJECT__ Lags
-
EOF

write_if_absent "research/external/competitor-analysis/pricing-comparison.md" <<'EOF'
# Pricing Comparison

A structured analysis of how competitors price their products - tier structures, feature gating, trial models, and revenue streams. Informs __PROJECT__'s own monetisation decisions.

## Per-Competitor Entry

```
# Pricing - [Competitor]

## Model
Free / Freemium / Paid-only / Usage-based

## Plans
| Plan | Price | Key features | Limits |
|---|---|---|---|

## Notes
- What is kept free to drive adoption? What is gated to push upgrades?

## Last Verified
YYYY-MM-DD
```

_No entries yet._
EOF

write_if_absent "research/external/competitor-analysis/pain-points.md" <<'EOF'
# Competitor Pain Points

User and market pain points surfaced through competitor analysis - the friction, gaps, and complaints that recur across competing products. These are the problems __PROJECT__ can solve better.

## Entry Format

```
## [Pain Point]

**Where seen:** Which competitor(s) and source(s).
**Who feels it:** Persona / user type.
**Description:** What the friction is and why it hurts.
**Evidence:** Quotes or links from user feedback.
**Angle:** How __PROJECT__ could address it. Cross-reference `opportunities.md`.
**Severity:** High / Medium / Low
```

## Guidelines

- Every pain point must trace back to a real source - no assumed problems.

_No entries yet._
EOF

write_if_absent "research/external/competitor-analysis/opportunities.md" <<'EOF'
# Opportunities

Synthesised strategic opportunities identified through the full competitor analysis - where __PROJECT__ can lead, differentiate, or capture underserved ground.

## Entry Format

```
## [Opportunity Name]

**Type:** White space / Differentiation / Quick win / Long-term
**The gap:** What no competitor does well today.
**Why __PROJECT__:** Why __PROJECT__ is positioned to win here.
**Evidence:** Which competitor profiles or research support this.
**Priority:** High / Medium / Low
**Risk:** What could prevent capturing this opportunity.
```

## Guidelines

- Every opportunity must trace back to evidence - a competitor weakness, a user pain point, or a market gap.

_No entries yet._
EOF

write_if_absent "research/internal/product-knowledge/open-questions.md" <<'EOF'
# Open Questions - Master List

> Every unresolved product question lives here. Review weekly. No question should stay unanswered for more than two weeks.

## Open Questions

| # | Question | Module | Owner | Status | Raised | Due |
|---|---|---|---|---|---|---|
| - | - | - | - | - | - | - |

## Answered Questions

*(Move questions here once resolved, with the answer and a link to where the decision was documented.)*

| # | Question | Answer | Documented In | Answered By | Date |
|---|---|---|---|---|---|
| - | - | - | - | - | - |
EOF

write_if_absent "research/internal/product-knowledge/information-architecture.md" <<'EOF'
# Information Architecture

How __PROJECT__'s content, features, and navigation are structured. The IA is the skeleton everything else is built on - navigation, flows, and screen layouts all follow from it.

## What Goes Here

- Top-level navigation structure
- Content hierarchy per module
- Taxonomy (how content is categorised and labelled)
- Navigation model (global nav, contextual nav, breadcrumbs)

_To be defined once product knowledge and research are signed off (Phase 3)._
EOF

write_if_absent "research/internal/product-knowledge/sitemap.md" <<'EOF'
# Sitemap

A map of every screen in __PROJECT__ and how they connect. Useful for onboarding new team members and for catching gaps in coverage before design begins.

## What Goes Here

- Platform sitemap (all screens, all states)
- Module-level sitemaps (zoomed-in view per module)
- Version history of the sitemap as the product evolves

_To be defined once the information architecture is signed off (Phase 3)._
EOF

write_if_absent "project-management-log/decisionlog.md" <<'EOF'
# Decision Log

Every significant product or design decision made on the project, in chronological order.

> **Rule:** Any decision that affects scope, direction, a user experience, a feature, or the structure must be logged here. Undocumented decisions create confusion and rework.

## How to Add an Entry

```
### [D-XXX] - [Short Decision Title]
- **Date:** YYYY-MM-DD
- **Decided by:** Name(s)
- **Module / Area:**
- **Decision:** What was decided, in plain language.
- **Rationale:** Why this was chosen over alternatives.
- **Alternatives considered:** What else was discussed but rejected.
- **Impact:** What changes as a result of this decision.
- **Related files:** Links to meeting notes, research, or files this decision came from.
```

## Decision Log

*(Add entries here as decisions are made. Every phase-gate approval must be logged here.)*
EOF

write_if_absent "project-management-log/CHANGELOG.md" <<'EOF'
# Change Log

A chronological record of every significant change to the product or project scope.

> **Rule:** Any change to a feature, a module, or a project requirement must be logged here with a reason. "It changed" is not documentation.

## How to Add an Entry

```
### [C-XXX] - [Short Change Title]
- **Date:** YYYY-MM-DD
- **Changed by:** Name
- **Type:** Feature / Scope / Research / Requirement / Process
- **Module / Area:**
- **What changed:** Before and after - be specific.
- **Reason:** Why the change was made.
- **Impact:** What else this change affects.
- **Related decision:** Link to Decision Log entry if applicable.
```

## Change Log

*(Add entries here as changes are made.)*
EOF

write_if_absent "project-management-log/feedback/date/01.feedback.md" <<'EOF'
# Feedback - 01

> Sample feedback entry. Copy this file and increment the number (`02.feedback.md`, `03.feedback.md`, ...) for each new feedback note. Group files by date using the parent `date/` folder.

- **Date:** YYYY-MM-DD
- **From:** Name / role
- **Context:** What this feedback is about (module, document, decision).
- **Feedback:** The actual feedback, verbatim where possible.
- **Action taken:** What was changed or decided in response (or "open").
- **Related:** Links to decisions, changelog entries, or files affected.
EOF

# ---------------------------------------------------------------------------
# Modules index (lives inside product-knowledge/modules)
# ---------------------------------------------------------------------------
write_if_absent "research/internal/product-knowledge/modules/README.md" <<'EOF'
# modules

Each product module gets its own subfolder here, under `research/internal/product-knowledge/modules/`. This is where the module definition, its user flows, module-specific research, and notes live together.

## Structure per Module

```
modules/
└── [module-name]/
    ├── [module-name].md   module definition: what it does, personas, design status, changelog
    ├── userflows.md       user and task flows for the module
    ├── notes.md           open questions, decisions log, research gaps
    ├── research/          individual research files (.md) - auto-synced to master-doc.md   (when research exists)
    └── master-doc.md      auto-generated combined research document - do not edit manually  (when research exists)
```

## How to Add a Module

1. Create a subfolder named after the module in kebab-case (e.g., `onboarding`, `checkout`).
2. Add `[module-name].md` with the module definition, `userflows.md` with its flows, and `notes.md` for open items.
3. Add individual research files inside `research/` - one topic per file. If a master-doc sync skill is installed, `master-doc.md` is generated automatically when files in `research/` change. Do not edit it manually.

## Current Modules

Modules will be added here once product knowledge has been shared and confirmed.
EOF

echo ""
echo "Done. Files created: $created   |   already existed (skipped): $skipped"
echo "Structure ready at: $ROOT"
