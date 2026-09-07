---
name: website-weaver
description: >-
  Intelligent task orchestration for website and digital product delivery.
  Takes any project brief (portfolio site, SaaS landing page, planning doc),
  evaluates task complexity, decomposes into subtasks, and automatically dispatches
  each subtask to the Claude model and effort level best suited for it using Orca's
  native orchestration primitives. Designed to be invoked from any Orca-managed
  worktree, not duplicated per-project.
---

# WebsiteWeaver

WebsiteWeaver is an Orca-native task orchestration framework for website and
digital product delivery. It bridges planning (task decomposition and evaluation)
with execution (distributed Claude sub-agents running in parallel/sequence based
on dependency analysis).

## Trigger Phrases

Use WebsiteWeaver when you need to:

- Decompose a large project brief into manageable subtasks
- Route each subtask to the optimal Claude model + effort level
- Run specialized sub-agents in parallel where safe
- Enforce quality gates between stages
- Get human approval at critical decision points

Typical triggers:
- "Use website-weaver for [project brief]"
- "weave a [brief description] with website-weaver"
- "$website-weaver: [task description]"

## How It Works

WebsiteWeaver runs in 5 stages:

1. **Draft Decomposition** (Sonnet) — parses brief, suggests task breakdown
2. **Review & Refinement** (Fable 5.1) — validates, corrects, assigns models + effort
3. **DAG Construction** — builds dependency graph from refined tasks
4. **Orchestrated Execution** (Orca native) — spawns sub-agents per task, handles parallelization
5. **Verification** (Fable 5.1) — quality gates, escalation for defects

## Key Design Principles

- **Match model to work:** Fable for judgment/strategy, Sonnet for design/architecture,
  Opus for code complexity, Haiku for high-volume structured output
- **Prepare before you spend:** Sonnet drafts, Fable reviews (cost-optimized)
- **Human gates matter:** Explicit approval required at strategy, design, and final QA stages
- **Failure is visible:** Gate failures escalate with clear reasoning, not silent retries
- **Claude-only for v1:** No multi-vendor routing yet

## Model Assignment Matrix

The skill reads `model-matrix.yaml` to decide which model to assign per task domain.
Matrix can be edited without touching skill code.

| Task Domain | Model | Effort | Reasoning |
|---|---|---|---|
| Strategy & Planning | Fable 5.1 | High | Ambiguity, long-horizon reasoning |
| Architecture (IA, flows) | Sonnet | Medium-High | Visual reasoning, iteration-friendly |
| Visual Design | Sonnet | Medium | Design system clarity |
| Frontend (React/Shadcn) | Opus | Medium | Code complexity, multi-file context |
| Content Creation | Haiku | Medium | Structured, high-volume |
| DevOps & Deployment | Sonnet | Medium | Pattern matching, config logic |
| QA & Polish | Haiku | Low | Structured checks, low ambiguity |
| Cross-stage Verification | Fable 5.1 | Medium | Judgment on "is it actually done" |

## Output

- Approved task DAG (YAML/JSON) with task IDs, specs, dependencies, assigned models, effort levels
- Human-readable summary of task breakdown
- Verification criteria per task ("done" definition)
- Flags for high-judgment decisions requiring human approval

## Files & Structure

```
~/.agents/skills/website-weaver/
├── SKILL.md                              [This file]
├── model-matrix.yaml                     [Task → model/effort config]
├── prompts/
│   ├── task-dag-schema.md                [Output format spec]
│   ├── draft-decomposition.md            [Sonnet Stage 1]
│   └── review-refine.md                  [Fable Stage 2]
└── docs/
    └── specs/                            [Design docs, implementation plan]
```

## Next Steps in Planning

- Phase 1 (current): Draft decomposition + Fable review → approved DAG
- Phase 2: Sub-agent execution (via Orca orchestration primitives)
- Phase 3: Verification gates, error handling, CLI polish

See `docs/specs/` for full design and implementation plan.
