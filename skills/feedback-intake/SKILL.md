---
name: feedback-intake
description: Captures and standardizes project feedback into the one-file-per-date format. Auto-categorizes (UX, UI, Product, Business, Technical, Research, Copy/Content, Accessibility, Performance), suggests severity, runs cross-file deduplication, and imports from FigJam boards (via the Figma MCP) or pasted Figma comments / linked files. Drafts every entry for review, writes only after approval, keeps the module-grouped Feedback Register (register.md) in sync, and produces on-demand roll-ups across dates.
---

# Feedback Intake

This skill is the single front door for feedback on the project. It turns raw input - a pasted comment, a meeting note, a FigJam board - into clean, categorized, deduplicated entries in the project's `project-management-log/feedback/` log, following the format defined in `project-management-log/feedback/README.md`.

It never writes blind. Every entry is prepared as a draft, shown for review, and written only after approval. This draft-then-approve gate is the backbone of the workflow, not an optional step (mirrors the `update-competitor-profile` skill).

## When to Use This Skill

- After a design review, stakeholder session, or meeting that produced feedback
- When importing notes from a FigJam board
- When pasting Figma comments or notes from a linked file that need structuring
- When adding a single piece of feedback by hand and you want it categorized, rated, and dedup-checked
- When you need a cross-date roll-up (e.g. all Open Critical/High items, or everything for one module)

## The Format (authoritative source: feedback readme)

Always follow `project-management-log/feedback/README.md`. In short:

- **One file per date:** `project-management-log/feedback/YYYY-MM-DD.feedback.md`. Create it from the header template if it does not exist; otherwise append.
- **Entry id:** `F#NN - <date>`, `NN` sequential within that date's file (the running number and the date are kept visibly distinct).
- **Fields per entry:** Time (optional), Reviewer, Source, Category (1+), Module / Area, Severity, Status, Feedback (verbatim where possible), Action taken, Related.
- **Header Summary line:** keep the count current as you add entries.

If the readme and this skill ever disagree, the readme wins.

## The Intake Workflow

This is the required order of operations.

1. **Collect the raw input.** A pasted block, a meeting note, or a FigJam board reference. For FigJam, read it via the Figma MCP (see below). Split it into discrete, atomic feedback items - one idea per entry.
2. **Categorize each item.** Apply the 9-category guide in the readme using the keyword cues. Multi-tag when an item spans domains (e.g. UX + Copy / Content). When uncertain or two categories tie, tag both and append `(needs confirmation)`.
3. **Suggest severity.** Map the language of impact/urgency to the scale: blocker/broken/"can't ship" -> Critical; major user impact -> High; "should fix" -> Medium; minor/polish -> Low; "would be nice" -> Nice-to-have.
4. **Set Module / Area, Reviewer, Source, Time.** Pull from the input. Write `Module / Area` as a markdown link to the module readme (e.g. `[Game Lobby](../../research/internal/product-knowledge/modules/game-lobby/README.md)`); use `Global` for cross-cutting items. Never infer product details - if a module or source is unclear, leave a placeholder and flag it (see Product Knowledge Rule below).
5. **Run the dedup check** across existing `*.feedback.md` files (see Deduplication).
6. **Prepare the draft.** Show, for each proposed entry: the date file it lands in, the next id, all fields filled, the dedup result, and the updated header Summary. Do not touch any file yet.
7. **Present the draft for review** and wait for explicit approval.
8. **On approval, write.** Append entries to the correct dated file (creating it from the header template if absent), assign sequential ids, and update the Summary count. Then **upsert the Feedback Register** (`register.md`): add or update each item's row under its module's `##` section using the simplified 3-state status (Open / In Progress / Closed - mapping in the readme), and update the register's Summary counts. A status change to an existing entry updates both the dated file and its register row in the same pass.
9. **Log the batch** in `project-management-log/CHANGELOG.md` as a Process entry when feedback intake is a notable project event (e.g. a full review session imported). Single ad-hoc entries do not each need a changelog row.
10. **Flag anything unverifiable** - unclear module, missing author, ambiguous severity - so a human can resolve it.

If approval is not given, nothing is written. Revise and present again.

## Importing From FigJam

Use the Figma MCP tools:

- `get_figjam` to read the board's notes, stickies, and clusters.
- `get_screenshot` / `get_metadata` for visual context or to resolve which screen/module a note refers to.

Extract each sticky or note as a candidate entry, set `Source: FigJam board "<name>" (<link>)`, then run the standard categorize -> severity -> dedup -> draft -> approve flow. This mirrors how the repo already turns FigJam boards into research findings (see the `figjam-*-findings.md` files under module research).

## Importing Figma Comments / Linked Files (manual paste)

Figma comments cannot be auto-exported by the available MCP tools. Ask for the raw text to be pasted (or read the linked file), then structure it through the same flow. Set `Source: Figma comment` or `Source: Linked file (<path>)` accordingly.

## Auto-Categorization Rules

Suggest, never dictate - every tag is editable. Keyword cues (full table in the readme):

- spacing / color / alignment / button / layout -> **UI**
- flow / confusing / can't find / navigation -> **UX**
- add / new feature / suggestion / improvement / scope / priority -> **Product**
- pricing / market / competitor / revenue -> **Business**
- bug / crash / API / integration / security -> **Technical**
- need data / assumption / validate / survey -> **Research**
- wording / label / typo / onboarding / tutorial / help -> **Copy / Content**
- contrast / screen reader / keyboard / color blind -> **Accessibility**
- slow / lag / load time / freeze -> **Performance**

Severity from urgency language: blocker/broken -> Critical; minor/polish/would-be-nice -> Low / Nice-to-have. Flag low-confidence guesses `(needs confirmation)`.

## Deduplication

Before drafting, search every `project-management-log/feedback/*.feedback.md` for the same **Module / Area** plus similar feedback text or source. On a match:

- Mark the new entry `Status: Duplicate`, `Related: Duplicate of F#NN - YYYY-MM-DD`.
- Add `Raised again on YYYY-MM-DD` under the original entry.

Recurring feedback stays visible without inflating counts. Call out near-duplicates in the draft so the reviewer can confirm whether it is truly the same item.

## The Feedback Register

`project-management-log/feedback/register.md` is the maintained, module-grouped overview of all feedback. Keep it in sync as part of every write (step 8): one row per item under its primary module's `##` section, with the simplified 3-state status and a link back to the dated entry. Cross-cutting items go under `Global`. When work begins on an item, set its register status to **In Progress** and put the `W-NNN` from the [Work Board](../../../project-management-log/work-board.md) in the `Work` column. See the readme for the full status mapping and column spec.

## Roll-Ups

The register is the standing overview. For ad-hoc slices it does not pre-group, grep the dated files and print a table on demand - for example:

- "All Open Critical and High feedback" -> filter by Severity + Status across files.
- "Everything from FigJam this month" -> filter by Source + date range.

## Product Knowledge Rule

Per `claude.md`, never infer or assume product details (module names, features, roles). If the input does not make the module, source, or author clear, use a placeholder, flag it in the draft, and - if it is an open product question - note it for `research/internal/product-knowledge/open-questions.md`.

## Tips

- One idea per entry. Split compound feedback so each item can be categorized, rated, and tracked independently.
- Keep the Feedback field verbatim where possible; paraphrase only to clarify, and mark it if you do.
- Update the header Summary every time you add entries.
- Never write without approval. The draft-then-approve gate is non-negotiable.

## Related Skills

- **content-research-writer** - for synthesizing longer-form feedback or research write-ups.
- **changelog-generator** - for rolling intake batches into reader-facing changelog summaries.

This skill is invoked manually whenever feedback needs to be captured, imported, deduplicated, or rolled up.
