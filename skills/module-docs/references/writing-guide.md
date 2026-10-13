# Writing a module page

Who reads it: the client, who wants to know what they are getting and why,
and a developer, who wants to know where it lives in the code. One page serves
both. Write for the client first, then point the developer at the code.

## The voice

- Plain sentences anyone can follow. Say what a person can now do, see or
  rely on - not which functions changed.
- After a plain sentence, the code pointers a developer would open, in
  backticks: `app/profile/page.tsx`, `components/profile-card.tsx`. A pointer
  follows the plain sentence; it never replaces it.
- Outcomes, not activity. "A banner can be uploaded to the profile page", not
  "Worked on banner upload". The entry's `title` is one such sentence.
- Present tense for what is built ("The header shows..."), past tense for
  what changed ("The header gained...").
- No marketing words, no exclamation marks, no "simply" or "just".
- A plain hyphen (`-`), never an em dash.

## What never appears

- **Hours, durations, budgets, rates, billing.** Time is the timesheet's
  business.
- **Who did it.** No names, initials, emails, usernames or computers, and no
  "I" or "we did". The work happened; nobody is credited or blamed.
- **The tools.** No Claude, AI, model, skill, agent, prompt, plan mode, hook
  or session - not even "planned with". A plan is "the plan".
- **Internal references.** No requirement or decision IDs (name them by
  title), no commit SHAs, no `project-management/` or `.claude/` paths.

## The four parts of an entry

**What changed.** What a reader can do or see now that they could not before,
and what was removed or replaced. Then the files. Two to five sentences, or
bullets for several separate changes.

**Why and the plan.** The goal behind the work - the problem it solves, for
whom - and how it was planned before it was built: the approach agreed, its
shape, its order. From the approved plan and the person's own requests in the
evidence. When the work delivers a requirement, name it by its title: "This
delivers the agreed banner upload." Never invent a reason the evidence does
not give; if there is none, say what the work was for in the person's words.

**Decisions made.** One bullet per choice made along the way: what was
chosen, and what was considered and dropped, with the reason when the evidence
gives one. The evidence's `questions` list every option, with `chosen` marked
- the dropped options are the ones not chosen. A typed answer (`typed`) is a
choice in the person's own words. "None." when nothing was decided.

> - The banner is cropped in the browser before upload, not on the server, so
>   no uncropped image is ever stored.

**Open follow-ups.** What the work left open: known gaps, questions still
unanswered, the next step it set up. One bullet each. "None." when there are
none. These roll up into the overview's "Open follow-ups"; when a later entry
resolves one, it comes off the overview (the old entry keeps it, as history).

## The overview

**What it is.** One or two sentences from the person's own product docs - the
module's purpose, in their words. Never written from the code. Unknown means
`[To confirm: what the module is for]`, and the person is told.

**What's built now.** The module as it stands today, rewritten on every update
- not a list of changes (that is the history). A short paragraph or a few
bullets per part, each with its code pointers. Empty when nothing is built.

**Open follow-ups.** Every follow-up still open, from all the entries,
deduplicated. Empty when there are none.

## Backfill entries

Rebuilt from commits alone, so they say less, and say so by saying less:

- `kind: backfill`, a "What changed" section, and "Why and the plan" only when
  a commit body states a reason.
- One entry per module per day, summing up that day's commits for the module.
- Commit subjects and bodies are the only source. Never infer a plan, a
  decision or a follow-up the commits do not state.

## Good and bad

Bad:

> Sam spent 3h refactoring ProfileHeader with Claude. Fixed bugs (R-014).

Good:

> The profile header now shows the person's banner across the full width on
> every screen size, and falls back to a plain colour when there is none
> (`components/profile-header.tsx`). This delivers the agreed banner display.
