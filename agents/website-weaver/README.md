# Website Weaver

Turns a website or digital-product brief into a reviewed plan for a team of Claude models: each task's model, effort, dependencies and approval gates, as a YAML task DAG for Orca. Planning only, for now.

## When to Use This Agent

- You have a website or product brief and want a plan before work starts
- Matching each task to the model and effort it needs, to keep cost down
- Knowing which tasks can run side by side and which must wait
- Clear sign-off points for strategy, design direction and final QA
- Checking whether a brief is clear enough to build from

## What This Agent Does

1. **Drafts the Breakdown**: Sonnet splits the brief into tasks across eight domains
2. **Assigns Model and Effort**: Each domain's default from `model-matrix.yaml`
3. **Maps Dependencies**: What each task needs first, and what can run in parallel
4. **Sets Criteria and Gates**: Testable "done" criteria, and human approval at key points
5. **Reviews with Fable 5.1**: Catches missing work, bad sizing, cycles and wrong models
6. **Reports Its Confidence**: Changes, open questions and readiness; stops when low

## How to Use

### Basic Usage

In Claude Code, in an Orca-managed worktree:

```
Use website-weaver for a portfolio website for a UX design manager based in Karachi
```

### Other Ways to Ask

```
weave a SaaS landing page with a blog with website-weaver
$website-weaver: plan the marketing site for our new pricing page
```

### Install It

In your project's folder, in the terminal:

```
aistack add website-weaver
```

`aistack add agents/website-weaver` works too. It copies the whole folder into `.claude/agents/website-weaver/`. It needs Orca.

### Give It Context

Put brand guidelines, constraints and existing assets in the request, or point to them in the worktree. The draft uses them as context, and it doesn't invent scope the brief and context don't imply.

### Change Which Model Does What

Edit `model-matrix.yaml`. Each domain has a `model` and an `effort`, which map to Orca's `orca orchestration worker-start --model <id> --effort <level>`. Change the ids if your Orca or Claude account uses different model names. No other file needs to change.

## Example

**User**: "Use website-weaver for a portfolio website for a UX design manager based in Karachi"

**Result** (shortened):

```yaml
tasks:
  - id: strategy-01
    domain: strategy
    spec: "Define the site's positioning statement, target audience and 3-5 success criteria."
    deps: []
    model: fable-5.1
    effort: high
    parallel_safe: true
    done_criteria: "A 2-3 sentence positioning statement, a named audience, 3-5 success criteria."
    requires_human_approval: true
    approval_reason: "Positioning affects all downstream content and design decisions."

  - id: architecture-01
    domain: architecture
    spec: "Given the positioning from strategy-01, define the sitemap and navigation."
    deps: ["strategy-01"]
    model: sonnet
    effort: high
    parallel_safe: false
    done_criteria: "A sitemap of every page with its purpose, plus a navigation hierarchy."
    requires_human_approval: false

human_gates:
  - after_task: strategy-01
    question: "Does this positioning statement match your intent?"
    blocking: true
```

Then the Review Notes:

```
Changes made:
- Added a QA task for an accessibility check against WCAG AA
- Made content-01 depend on architecture-01: it needs the sitemap

Open questions for human:
- Should case studies be written from existing material, or drafted new?

Confidence: medium
```

## Tips

- Give a full brief: audience, pages, brand, limits; vague ones get questions back
- Keep it to one website-sized project, typically 5 to 15 tasks
- Answer the Review Notes' open questions before anything runs
- Keep the human gates; they catch expensive wrong turns
- Tune `model-matrix.yaml` rather than arguing each task
- Claude-only and for websites: mobile apps and backends beyond JAMstack are out of scope

## Related Use Cases

- Planning a client website before quoting it
- Splitting a site build across several Orca worktrees
- Seeing which parts of a project need the most capable model, and which a cheaper one can do

## Model Matrix

The defaults in `model-matrix.yaml`:

| Domain | Model | Effort | For |
|---|---|---|---|
| `strategy` | Fable 5.1 | High | Vision, positioning, success criteria, ambiguous scope |
| `architecture` | Sonnet | High | Information architecture, user flows, sitemaps |
| `design_system` | Sonnet | Medium | Design tokens, component primitives, visual rules |
| `frontend` | Opus | Medium | React/Shadcn components, interaction logic |
| `content` | Haiku | Medium | Copy, metadata, SEO, structured content |
| `devops` | Sonnet | Medium | Hosting, CI/CD, domain setup, deployment config |
| `qa` | Haiku | Low | Cross-browser, accessibility and performance checks |
| `verification` | Fable 5.1 | Medium | Cross-stage quality gates: is it actually done |
| fallback | Fable 5.1 | Medium | Anything unclassified, flagged for human review |

## Status

Website Weaver is designed as five stages; the first two are built.

| Stage | What it does | State |
|---|---|---|
| 1. Draft decomposition | Sonnet drafts the task plan | Built |
| 2. Review and refinement | Fable 5.1 corrects it and approves it | Built |
| 3. DAG construction | Turns the plan into Orca tasks (`orca orchestration task-create`) | Not built yet |
| 4. Orchestrated execution | Runs each task as an Orca worker, in parallel where safe | Not built yet (Phase 2) |
| 5. Verification | Fable 5.1 quality gates, with escalation on failure | Not built yet (Phase 3) |

Phase 2 adds seven sub-agents (strategy, information architecture, design system, frontend, content, devops, QA) and passing each task's output to the tasks that depend on it. Phase 3 adds the verification gates, error handling and a command-line wrapper.

## Files

| File | What it is |
|---|---|
| `SKILL.md` | The agent's instructions |
| `model-matrix.yaml` | Which model and effort each domain gets |
| `prompts/task-dag-schema.md` | The format of the plan, its field rules and the review checklist |
| `prompts/draft-decomposition.md` | The Stage 1 prompt (Sonnet) |
| `prompts/review-refine.md` | The Stage 2 prompt (Fable 5.1) |
| `PHASE1-SUMMARY.md` | What Phase 1 built, and how to test it |
| `docs/specs/` | The design, the implementation plan and the roadmap |
