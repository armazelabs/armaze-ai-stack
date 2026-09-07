# WebsiteWeaver — Implementation Plan

**Date:** 2026-09-03
**Target:** Phased rollout with MVP in Phase 1
**Architecture:** Orca-native DAG execution

---

## 1. Overview

This plan breaks the WebsiteWeaver spec into three phases:
- **Phase 1 (MVP):** Sonnet decomposition + Fable review + basic Orca DAG
- **Phase 2 (Execution):** Sub-agents, context passing, full parallelization
- **Phase 3 (Polish):** Verification gates, error handling, CLI tooling

---

## 2. Phase 1: Foundations (Decomposition & Review Pipeline)

**Goal:** Get Sonnet → Fable → approved DAG working end-to-end with one test task.

**Deliverables:**
1. `skill.md` — Orca skill manifest (invocation triggers, metadata)
2. `model-matrix.yaml` — task domain → model/effort mapping
3. `prompts/draft-decomposition.md` — Sonnet Stage 1 prompt
4. `prompts/review-refine.md` — Fable Stage 2 prompt
5. `prompts/task-dag-schema.md` — schema/format for task DAG output

**Scope:**
- User provides a raw brief (e.g., "build a portfolio website")
- Sonnet produces a task decomposition (JSON/YAML)
- Fable reviews and refines it
- Output: approved task DAG (YAML), human-readable summary
- **No sub-agents execute yet** — just the planning layer

**Success Criteria:**
- Can invoke `orca weave "brief text"` from any worktree
- Sonnet produces decomposition within 60 seconds
- Fable review produces refined DAG within 120 seconds
- DAG is valid YAML, matches expected schema
- Human can read the summary and decide to proceed or revise

**Dependencies:**
- Orca 0.5+ (worktree/skill API)
- Claude API access (Sonnet + Fable models)
- jq or yq for YAML parsing/validation

**Testing:**
- Test briefs:
  - "Portfolio site for a designer" (simple)
  - "SaaS landing page + blog + admin dashboard" (medium complexity)
  - "E-commerce platform with product builder" (high complexity)
- Validate output DAG schema (all required fields present)
- Check that model assignments match matrix rules

**Build Order:**
1. `skill.md` (defines how to invoke, Orca metadata)
2. `model-matrix.yaml` (copy from spec, table format)
3. `prompts/task-dag-schema.md` (define output format)
4. `prompts/draft-decomposition.md` (Sonnet prompt, embed schema reference)
5. `prompts/review-refine.md` (Fable prompt, takes Sonnet output as input)
6. Integration test script (invoke both models, validate output)

**Estimated Effort:** 3-4 work sessions (~6-8 hours)

---

## 3. Phase 2: Execution Engine (Sub-Agents & Parallelization)

**Goal:** Spawn sub-agent worktrees, pass context between them, execute DAG nodes in parallel where safe.

**Deliverables:**
1. `sub-agents/strategy-agent.md` — system prompt for StrategyAgent
2. `sub-agents/ia-agent.md` — system prompt for IAAgent
3. `sub-agents/design-system-agent.md` — system prompt for DesignSystemAgent
4. `sub-agents/frontend-agent.md` — system prompt for FrontendAgent
5. `sub-agents/content-agent.md` — system prompt for ContentAgent
6. `sub-agents/devops-agent.md` — system prompt for DevOpsAgent
7. `sub-agents/qa-agent.md` — system prompt for QAAgent
8. `orchestration/dag-executor.sh` — Orca CLI wrapper to spawn worktrees per DAG node
9. `orchestration/context-passer.sh` — mechanism to pass artifacts between nodes

**Scope:**
- Take approved DAG from Phase 1
- For each DAG node (subtask):
  - Spawn a new Orca worktree
  - Inject sub-agent system prompt + input context
  - Run the sub-agent to completion
  - Capture output artifact
  - Move to next node (respecting dependencies)
- Parallelization: nodes with no upstream deps run concurrently
- Sequential: dependent nodes wait for upstream to complete

**Success Criteria:**
- Can spawn multiple worktrees from one DAG
- Each sub-agent produces expected output artifact
- Parallelization actually runs independent tasks concurrently (verify via logs)
- Context passes correctly between dependent nodes (e.g., Frontend receives Design System output)
- Full DAG execution completes for a test brief

**Dependencies:**
- Orca worktree API (`orca worktree spawn`, `orca task dispatch`)
- Artifact storage/retrieval mechanism (Orca's native or file-based)
- Sub-agent system prompts tuned for their specific domain

**Testing:**
- Test DAG: 3-4 subtasks with different dependency patterns
  - Sequential: Strategy → IA → Design System → Frontend
  - Parallel: Strategy + IA (concurrent) → Design System (waits for IA)
- Verify each sub-agent's output matches its contract
- Check that parallelized tasks actually run at overlapping times (not sequential)

**Build Order:**
1. Design context-passing mechanism (spike: how does context flow between worktrees? File-based, Orca artifacts, or something else?)
2. `orchestration/dag-executor.sh` — reads DAG YAML, spawns worktrees per node
3. `orchestration/context-passer.sh` — loads context for each sub-agent
4. Sub-agent prompts (start with StrategyAgent, then iterate through the rest)
5. Integration: run full DAG, validate output

**Estimated Effort:** 5-6 work sessions (~10-12 hours)

**Blocking Decision:** Context-passing mechanism (file-based vs. Orca artifact API) needs a quick spike first; this affects how prompts inject context.

---

## 4. Phase 3: Verification, Error Handling, Polish

**Goal:** Quality gates, self-healing retry loops, production-ready error messages.

**Deliverables:**
1. `prompts/verify.md` — Fable Stage 5 verification prompt
2. `orchestration/verification-gate.sh` — runs verification checks, escalates failures
3. `orchestration/error-handler.sh` — retry logic, human escalation
4. `cli/weave.sh` — user-friendly CLI wrapper (`orca weave <brief>`)
5. `docs/usage.md` — end-to-end walkthrough for users

**Scope:**
- After each stage (after DesignSystemAgent, after FrontendAgent, etc.):
  - Fable checks output against acceptance criteria
  - If pass: proceed to next node
  - If fail: escalate to human with reason, or retry with corrected context
- End-of-DAG verification: all outputs present, consistent, no missing fields
- Error messages are human-readable (not raw model output)
- CLI provides progress tracking, logs, and rollback hints

**Success Criteria:**
- Verification gates catch real defects (e.g., missing components, broken links)
- Escalation is clear and actionable
- Retry-on-failure works for simple recoverable issues
- Full DAG run produces a summary report (what succeeded, what needs human review)
- User can roll back a failed stage and re-run it

**Dependencies:**
- Phase 2 complete (all sub-agents working)
- Clear output schema per sub-agent (so verification can validate shape)

**Testing:**
- Inject intentional defects in sub-agent outputs (e.g., incomplete component list)
- Verify gates catch them
- Verify escalation message is clear
- Verify retry logic re-runs the right sub-agent

**Build Order:**
1. `prompts/verify.md` (Fable verification prompt)
2. `orchestration/verification-gate.sh` (runs verification, decides pass/fail/escalate)
3. `orchestration/error-handler.sh` (retry logic, escalation flow)
4. `cli/weave.sh` (user-friendly entry point)
5. `docs/usage.md` (walkthrough, examples)
6. Full integration test with mixed success/failure scenarios

**Estimated Effort:** 3-4 work sessions (~6-8 hours)

---

## 5. Phase Dependencies & Sequence

```
Phase 1 (Decomposition & Review)
    ├─ skill.md, model-matrix.yaml, prompts/
    ├─ [Test: Sonnet + Fable produce valid DAG]
    └─ Output: Approved task DAG for a test brief
         ↓
Phase 2 (Execution Engine)
    ├─ [Spike: context-passing mechanism]
    ├─ sub-agents/, orchestration/dag-executor.sh
    ├─ [Test: spawn worktrees, pass context, run DAG]
    └─ Output: Full DAG execution, artifacts produced per sub-agent
         ↓
Phase 3 (Verification & Polish)
    ├─ prompts/verify.md, orchestration/verification-gate.sh
    ├─ cli/weave.sh, docs/usage.md
    ├─ [Test: full end-to-end with gates, escalation, retry]
    └─ Output: Production-ready CLI, user docs
```

**Critical path:** Phase 1 → Phase 2 (spike) → Phase 2 (build) → Phase 3

---

## 6. File-by-File Delivery Order

**Phase 1 Priority:**
1. `skill.md` (enables invocation)
2. `model-matrix.yaml` (config, no code)
3. `prompts/task-dag-schema.md` (defines format)
4. `prompts/draft-decomposition.md`
5. `prompts/review-refine.md`

**Phase 2 Priority:**
1. [SPIKE] Context-passing design doc + spike test
2. `orchestration/dag-executor.sh`
3. `orchestration/context-passer.sh`
4. `sub-agents/strategy-agent.md`
5. `sub-agents/ia-agent.md`
6. `sub-agents/design-system-agent.md`
7. `sub-agents/frontend-agent.md`
8. `sub-agents/content-agent.md`
9. `sub-agents/devops-agent.md`
10. `sub-agents/qa-agent.md`

**Phase 3 Priority:**
1. `prompts/verify.md`
2. `orchestration/verification-gate.sh`
3. `orchestration/error-handler.sh`
4. `cli/weave.sh`
5. `docs/usage.md`

---

## 7. Risk & Blockers

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Orca worktree API undocumented or unstable | Medium | High | Spike early; use Claude Code worktree API as fallback if needed |
| Context passing between worktrees is lossy | Medium | High | Test with real artifacts (design files, code) early in Phase 2 |
| Sub-agent prompts need heavy iteration | High | Medium | Plan for 2-3 rounds of tuning after Phase 2 initial build |
| Fable 5.1 costs balloon if verification loops | Medium | Medium | Add cost limits to verification prompt; use Sonnet for simple checks |
| Model assignments don't match real effort | Medium | Low | Track actual time/tokens per task; update matrix after Phase 1 |

---

## 8. Success Metrics (End of Phase 3)

- ✅ CLI invocation works from any Orca worktree (`orca weave <brief>`)
- ✅ Full DAG runs for a portfolio website in <30 minutes
- ✅ All sub-agents produce expected artifacts (design tokens, React components, content, etc.)
- ✅ Verification gates catch real defects
- ✅ User receives a summary report (what succeeded, what needs review)
- ✅ Prompts can be tuned by editing YAML/markdown (no code changes needed)

---

## 9. Post-MVP Enhancements (Phase 4+)

- Mobile app sub-agent types
- Multi-vendor model routing (GPT, Gemini)
- Self-improving prompt tuning (agents refining their own sub-agent prompts)
- Batch processing (run multiple projects concurrently with resource limits)
- Web UI for orchestration/monitoring (instead of CLI-only)

---

## 10. Estimated Total Timeline

| Phase | Effort | Parallel? | Target Date |
|---|---|---|---|
| Phase 1 | 6-8 hours | No | 2026-09-05 |
| Phase 2 spike | 1-2 hours | After P1 | 2026-09-05 |
| Phase 2 build | 10-12 hours | After spike | 2026-09-08 |
| Phase 3 | 6-8 hours | After P2 | 2026-09-10 |
| **Total** | **23-30 hours** | — | **2026-09-10** |

(Estimates assume focused 4-6 hour work sessions, not calendar days; actual timeline depends on context switching and real-world interruptions.)

