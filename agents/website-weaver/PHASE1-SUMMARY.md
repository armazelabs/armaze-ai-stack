# Phase 1 Build Summary

**Date:** 2026-09-03
**Status:** ✅ Complete (ready for testing)

## Files Created

| File | Lines | Purpose |
|---|---|---|
| `skill.md` | 100 | Orca skill manifest & documentation |
| `model-matrix.yaml` | 91 | Domain → model/effort assignment config |
| `prompts/task-dag-schema.md` | 116 | Output format specification |
| `prompts/draft-decomposition.md` | 79 | Sonnet Stage 1 prompt |
| `prompts/review-refine.md` | 125 | Fable 5.1 Stage 2 prompt |
| **Total** | **511** | — |

## What Phase 1 Does

### Stage 1: Sonnet Draft Decomposition
Takes any raw project brief and produces a first-pass task DAG:
- Breaks work into 5-15 subtasks
- Classifies each by domain (strategy, architecture, design_system, frontend, content, devops, qa, verification)
- Assigns default model/effort from `model-matrix.yaml`
- Identifies dependencies (what must complete before what)
- Marks parallel-safe tasks
- Drafts done_criteria per task
- Flags tasks requiring human approval

### Stage 2: Fable 5.1 Review & Refinement
Reviews Sonnet's output with high-judgment thoroughness:
- Checks for circular dependencies
- Validates model/effort assignments
- Corrects task boundaries (too broad? too granular?)
- Verifies done_criteria are testable
- Adds/confirms human approval gates
- Resolves ambiguities
- Produces final approved task DAG ready for execution

### Output
- Approved task DAG (YAML) mapping to Orca orchestration primitives:
  - task IDs, specs, dependencies
  - model + effort per task
  - verification criteria
- Human-readable summary
- Confidence level + open questions

## Files & Structure

```
~/.orca/skills/website-weaver/
├── skill.md                              [Orca invocation manifest]
├── model-matrix.yaml                     [Config: domain → model/effort]
├── prompts/
│   ├── task-dag-schema.md                [Output format spec]
│   ├── draft-decomposition.md            [Sonnet Stage 1 prompt]
│   ├── review-refine.md                  [Fable Stage 2 prompt]
│   └── verify.md                         [Fable Stage 5, TBD — Phase 3]
├── docs/
│   └── specs/
│       ├── 2026-09-03-website-weaver-design.md
│       ├── 2026-09-03-website-weaver-implementation-plan.md
│       └── IMPLEMENTATION-ROADMAP.txt
├── orchestration/                        [TBD — Phase 2]
├── sub-agents/                           [TBD — Phase 2]
└── cli/
    └── weave.sh                          [TBD — Phase 3]
```

## Next Steps

### Immediate (testing Phase 1)
1. Test Sonnet decomposition with a real brief:
   ```bash
   orca terminal create --worktree active --command "claude" --json
   # Pass the draft-decomposition.md prompt + a test brief to Sonnet
   # Validate output against task-dag-schema.md
   ```

2. Test Fable review:
   ```bash
   # Pass the Sonnet output + review-refine.md prompt to Fable
   # Validate the refined DAG
   # Check that Fable's confidence level is "high"
   ```

3. Iterate if needed:
   - If schema validation fails, fix model-matrix.yaml or prompts
   - If Fable confidence is low, clarify the brief before proceeding

### After Phase 1 Approval
- Phase 1→2 Spike: Design context-passing mechanism between sub-agents
- Phase 2: Sub-agent execution (7 agent types, DAG executor, parallelization)
- Phase 3: Verification gates, error handling, CLI wrapper

## Key Design Decisions Locked In

1. **Orca-native DAG execution** — uses real `orca orchestration` primitives
   (task-create, worker-start, gate-create, check --wait)

2. **Hybrid model routing** — Sonnet drafts, Fable refines (cheaper + better)

3. **Model matrix editable at runtime** — no code changes needed to adjust
   domain→model mappings

4. **Explicit human approval gates** — not silent retries; gates pause DAG
   execution until human decision

5. **Claude-only for v1** — no multi-vendor routing yet

## Known Unknowns (Resolved in Phase 2)

- [ ] Context-passing mechanism between worktrees (file-based vs. Orca artifacts?)
- [ ] Exact Orca terminal handle discovery from worker-start responses
- [ ] How to pass previous task outputs as context to dependent workers
- [ ] Error recovery + retry boundaries (when to auto-retry vs. escalate)

These are Phase 2 design spikes, not blocking Phase 1.

## Testing Checklist

- [ ] Sonnet decomposition runs and outputs valid YAML
- [ ] YAML matches task-dag-schema.md
- [ ] Fable review runs and produces corrected DAG
- [ ] All tasks have testable done_criteria
- [ ] No circular dependencies in output DAG
- [ ] Model assignments match model-matrix.yaml or have justification
- [ ] Human gates exist for: strategy, design direction, final QA
