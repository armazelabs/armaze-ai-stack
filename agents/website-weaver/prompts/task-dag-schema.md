# Task DAG Output Schema

This is the required output format for both the Draft Decomposition (Sonnet)
and Review & Refinement (Fable) stages. The schema is designed to map cleanly
onto Orca's real orchestration primitives:

- Each `task` node becomes one `orca orchestration task-create --spec <text> --deps <json_array>`
- `model` + `effort` map directly to `orca orchestration worker-start --model <id> --effort <level>`
- `domain` is used to look up defaults from `model-matrix.yaml` (can be overridden per-task)

## Schema (YAML)

```yaml
project:
  brief: "<original raw task brief, verbatim>"
  summary: "<one-paragraph restatement of what's being built>"

tasks:
  - id: "<short unique id, e.g. strategy-01>"
    domain: "<one of: strategy | architecture | design_system | frontend | content | devops | qa | verification>"
    spec: "<precise, self-contained task description — this is what the sub-agent receives>"
    deps: ["<task id>", "..."]   # empty list if no dependencies
    model: "<fable-5.1 | sonnet | opus | haiku>"   # from model-matrix.yaml, may be overridden
    effort: "<high | medium | low>"
    parallel_safe: true|false    # can this run concurrently with sibling tasks?
    done_criteria: "<explicit, testable definition of 'done' for this task>"
    requires_human_approval: true|false
    approval_reason: "<if true, why this needs human sign-off before proceeding>"

human_gates:
  - after_task: "<task id>"
    question: "<what the human needs to confirm/decide>"
    blocking: true|false   # does execution pause until resolved?

risks:
  - description: "<anything ambiguous, high-cost, or likely to need iteration>"
    mitigation: "<how the DAG accounts for this risk>"
```

## Field Rules

- **`id`** — must be unique, lowercase, hyphenated, prefixed by domain (e.g. `frontend-03`)
- **`spec`** — must be self-contained. A sub-agent should be able to execute it
  with zero additional context beyond what's declared in `deps` outputs.
- **`deps`** — list of task `id`s whose output this task requires before starting.
  Empty list means this task is immediately `ready` (no blockers).
- **`model` / `effort`** — default from `model-matrix.yaml` based on `domain`,
  but Fable (Stage 2) may override if the task is unusually simple/complex
  for its domain.
- **`parallel_safe`** — true only if this task does not need to read another
  in-flight task's output and won't conflict on shared files/resources.
- **`done_criteria`** — must be objectively checkable, not vague. Bad:
  "design looks good." Good: "design tokens file exports color, type, and
  spacing scales; component specs cover default/hover/disabled states."
- **`requires_human_approval`** — true for: strategy decisions, anything
  affecting scope/budget, first-time direction-setting (e.g. initial design
  direction), and final QA sign-off. False for routine execution once
  direction is confirmed.

## Example (abbreviated)

```yaml
project:
  brief: "Build a portfolio website for a UX design manager based in Karachi"
  summary: "A restrained, typographic personal portfolio site showcasing
    design work, with case studies, a resume page, and contact section."

tasks:
  - id: strategy-01
    domain: strategy
    spec: "Define the site's positioning statement, target audience, and
      the 3-5 success criteria for the finished portfolio."
    deps: []
    model: fable-5.1
    effort: high
    parallel_safe: true
    done_criteria: "A written positioning statement (2-3 sentences), a
      named target audience, and a bulleted list of 3-5 success criteria."
    requires_human_approval: true
    approval_reason: "Positioning affects all downstream content and design decisions."

  - id: architecture-01
    domain: architecture
    spec: "Given the positioning statement from strategy-01, define the
      sitemap and primary navigation structure."
    deps: ["strategy-01"]
    model: sonnet
    effort: high
    parallel_safe: false
    done_criteria: "A sitemap listing all pages/sections with one-line
      purpose each, plus a navigation hierarchy diagram (text-based ok)."
    requires_human_approval: false

human_gates:
  - after_task: strategy-01
    question: "Does this positioning statement match your intent?"
    blocking: true

risks:
  - description: "Positioning may need revision after seeing initial design direction."
    mitigation: "Design system stage includes a checkpoint to re-confirm
      positioning before frontend work begins."
```

## Validation Checklist (for Stage 2 review)

Before a DAG is considered approved, Fable must confirm:

- [ ] No circular dependencies
- [ ] Every task has a non-empty `done_criteria`
- [ ] Model/effort assignments match `model-matrix.yaml` domain defaults,
      or have explicit justification for deviation
- [ ] All `parallel_safe: true` tasks genuinely have no shared-resource conflicts
- [ ] High-judgment/ambiguous decisions are flagged with `requires_human_approval: true`
- [ ] `human_gates` cover at least: initial strategy, initial design direction,
      final QA sign-off
