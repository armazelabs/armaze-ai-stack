# WebsiteWeaver — Design Specification

**Date:** 2026-09-03
**Status:** Approved (pending implementation plan)
**Owner:** Munawar

---

## 1. Purpose

WebsiteWeaver is an Orca-native task orchestration framework for website
and digital product delivery. It takes a raw project brief, evaluates
task complexity using Claude models, decomposes the work into subtasks,
and automatically dispatches each subtask to the Claude model and
effort level best suited to it — spawning specialized sub-agents as
Orca worktrees that execute in parallel or sequence based on dependency
analysis.

It is designed to be installed once and invoked from any Orca-managed
project or worktree, rather than duplicated per-project.

---

## 2. Scope

**In scope (v1):**
- Website creation (portfolio sites, marketing sites, SaaS front-ends)
- Planning and strategy documents (site structure, IA, content strategy)
- Design system generation (tokens, component specs)
- Frontend implementation (React + Shadcn/ui)
- Content creation (copy, metadata, SEO)
- DevOps/deployment scaffolding
- QA and accessibility passes

**Out of scope (v1):**
- Mobile app development (future iteration)
- Non-Claude models (OpenAI, Gemini, etc. — Claude-only for now)
- Backend/API architecture beyond what a static/JAMstack site needs

---

## 3. Architecture Overview

```
Task Brief (from any Orca worktree)
    ↓
[Stage 1: Sonnet Draft Decomposition]
    ↓
[Stage 2: Fable 5.1 Review & Refinement]
    ↓
[Stage 3: Task DAG Builder]
    ↓
[Stage 4: Orca-Native DAG Executor]
    ↓
[Stage 5: Verification & Quality Gates]
    ↓
Delivered Artifact
```

### Stage 1 — Sonnet Draft Decomposition
Sonnet ingests the raw brief and produces a first-pass task breakdown:
- Subtasks with dependencies
- Estimated complexity and domain per subtask
- Proposed model + effort assignment (using the Model Matrix, §4)
- Proposed parallelization (which subtasks can run concurrently)

**Output:** structured YAML/JSON task tree.

### Stage 2 — Fable 5.1 Review & Refinement
Fable 5.1 reviews Sonnet's draft:
- Checks for missing or misgrouped subtasks
- Confirms or corrects model/effort assignments
- Flags high-judgment decision points for human approval
- Defines a "done" verification criterion per subtask

**Output:** refined task DAG + explicit human-approval flags.

### Stage 3 — Task DAG Builder
Converts the refined task definition into an executable Orca task DAG:
- Each subtask → one DAG node (spawns one worktree)
- Edges represent dependencies (output of A feeds into B)
- Parallel gates mark concurrency-safe branches
- Verification gates inserted between dependent stages

### Stage 4 — Orca-Native DAG Executor
Uses Orca's built-in task/decision-gate orchestration directly (no
external coordinator script):
- Spawns worktrees per DAG node
- Sequences dependent nodes, parallelizes independent ones
- Passes artifacts/context between connected nodes
- Surfaces blockers to the human operator

### Stage 5 — Verification & Quality Gates
After each major stage:
- Output shape check (matches expected structure)
- Completeness check (required fields/files present)
- Cross-agent consistency check (e.g., Frontend's component list
  matches Design System's primitives)
- Accessibility baseline check (for design/frontend outputs)

Failed gates trigger re-run of the responsible sub-agent with corrected
context, or escalate to human if repeated failure.

---

## 4. Model & Effort Assignment Matrix

| Task Domain | Complexity | Model | Effort | Rationale |
|---|---|---|---|---|
| Strategy & Planning | High | Fable 5.1 | High | Ambiguity, long-horizon reasoning |
| Architecture (IA, UX flows) | High | Sonnet | Medium-High | Visual reasoning, iteration-friendly |
| Visual Design / Design System | Medium-High | Sonnet | Medium | Design clarity, fast feedback loops |
| Frontend (React/Shadcn) | Medium-High | Opus | Medium | Code complexity, multi-file context |
| Content Creation | Medium | Haiku | Medium | High volume, well-defined output |
| DevOps & Deployment | Medium | Sonnet | Medium | Pattern matching, config logic |
| QA & Polish | Low | Haiku | Low | Structured checks, low ambiguity |
| Cross-stage Verification | — | Fable 5.1 | Medium | Judgment call on "did it actually work" |

This matrix is stored as an editable config (`model-matrix.yaml`) so it
can be tuned without touching orchestration logic.

---

## 5. Sub-Agent Types

Each sub-agent is a scoped Claude instance running in its own Orca
worktree, with a defined input contract and output contract.

| Sub-Agent | Model | Purpose | Inputs | Outputs |
|---|---|---|---|---|
| StrategyAgent | Fable 5.1 | Vision, positioning, success criteria | Brief, constraints, persona | Vision doc, positioning statement |
| IAAgent | Sonnet | Information architecture, flows | Vision, audience research | Sitemap, user flows, wireframe notes |
| DesignSystemAgent | Sonnet | Component primitives, tokens, rules | IA, brand guidelines | Design tokens, component specs |
| FrontendAgent | Opus | React/Shadcn implementation | Design system, IA | Component library, TSX files, config |
| ContentAgent | Haiku | Copy, metadata, SEO | IA, brand voice guide | Markdown content, meta.json |
| DevOpsAgent | Sonnet | Hosting, CI/CD, domain setup | Frontend code, deploy target | Dockerfile, vercel.json, DNS guide |
| QAAgent | Haiku | Cross-browser, accessibility, perf | All deliverables | QA report, blockers, sign-off |

Each agent's system prompt lives as its own file under `sub-agents/`
so prompts can be versioned and improved independently.

---

## 6. Global Installation & Invocation

WebsiteWeaver is installed once as a shared Orca skill, not duplicated
per project.

**Directory layout:**
```
~/.orca/skills/website-weaver/
├── skill.md                 (orchestration manifest, DAG structure)
├── model-matrix.yaml        (task → model/effort mapping, editable)
├── sub-agents/
│   ├── strategy-agent.md
│   ├── ia-agent.md
│   ├── design-system-agent.md
│   ├── frontend-agent.md
│   ├── content-agent.md
│   ├── devops-agent.md
│   └── qa-agent.md
├── prompts/
│   ├── draft-decomposition.md   (Sonnet Stage 1 prompt)
│   ├── review-refine.md         (Fable Stage 2 prompt)
│   └── verify.md                (Fable Stage 5 prompt)
└── docs/
    └── specs/                   (design specs, this file lives here)
```

**Invocation (illustrative):**
```bash
orca skill install website-weaver
orca weave "build a portfolio website for a design manager in Karachi"
```

Each invocation reads context from the current worktree (existing
brand assets, resume, logo files, prior content) and passes relevant
context automatically to each spawned sub-agent — no manual copy/paste
between agents.

---

## 7. Human Approval Gates

Explicit human sign-off is required at:
1. Before decomposition executes — review Sonnet's draft task tree
2. After Fable's review — resolve any flagged high-judgment decisions
3. Before DesignSystemAgent starts — confirm direction matches strategy
4. Before FrontendAgent starts — confirm design system is stable enough to code against
5. Final QA sign-off — before the artifact is declared complete

Approval gates are implemented as Orca decision gates within the DAG,
not as external prompts — the DAG pauses at each gate until resolved.

---

## 8. Design Principles

- **Match model to work, not brand** — Fable for ambiguity and judgment,
  Opus for code complexity, Sonnet for craft and iteration, Haiku for
  high-volume structured output.
- **Prepare before you spend** — Sonnet drafts cheaply; Fable reviews
  and refines rather than doing first-pass decomposition itself.
- **No context bleed** — each sub-agent receives exactly the context
  it needs; agents don't read each other's internals, only declared
  outputs.
- **Failure is visible, not silently retried** — gate failures escalate
  with a clear reason rather than looping indefinitely.
- **Claude-only for v1** — no multi-vendor model routing yet; that is
  an explicit future extension, not a current requirement.

---

## 9. Out-of-Scope / Future Extensions

- Mobile app sub-agent types (design → implementation pipeline)
- Non-Claude model routing (GPT, Gemini) for cost/capability arbitrage
- Self-improving prompt tuning (agents rewriting their own sub-agent
  prompts based on verification outcomes)
- Multi-project batch orchestration (running WebsiteWeaver across
  several client projects concurrently with shared resource limits)

---

## 10. Open Items for Implementation Planning

- Exact Orca DAG/decision-gate API calls needed for Stage 3 and 4
  (to be resolved in the implementation plan, not this spec)
- Context-passing mechanism between worktrees (file-based handoff vs.
  Orca's native artifact passing — needs a quick spike)
- Where `model-matrix.yaml` gets validated (schema check on load?)
