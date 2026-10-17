# Feedback Intake

Turns raw feedback (pasted comments, meeting notes, a FigJam board) into categorized, severity-rated, de-duplicated entries in `project-management/feedback/`, written only after you approve, with the Feedback Register kept in sync.

## When to Use This Skill

- After a design review, stakeholder session or meeting that produced feedback
- Importing notes from a FigJam board
- Structuring pasted Figma comments or notes from a linked file
- Logging one piece of feedback by hand, categorized and checked
- A roll-up across dates, such as all open Critical and High items

## What This Skill Does

1. **Splits the Input**: Breaks raw feedback into atomic items, one idea each
2. **Categorizes and Rates**: Suggests categories, a severity and the module for each item
3. **Checks for Duplicates**: Searches every dated feedback file for similar items
4. **Drafts for Review**: Shows each entry, its id and the duplicate check first
5. **Writes on Approval**: Appends to the day's file and syncs `register.md`
6. **Produces Roll-Ups**: Filters the dated files into a table on demand

## How to Use

### Basic Usage

Install it into your project once with `aistack add feedback-intake`, then ask:

```
Log this feedback from today's design review: <paste notes>
```

### From a FigJam Board

```
Import the feedback from this FigJam board: <link>
```

It reads the board's stickies and notes through the Figma MCP, and can look at screenshots and metadata to work out which screen or module a note refers to.

### From Figma Comments or a Linked File

Figma comments can't be exported automatically, so paste their text (or point at the file) and it goes through the same flow, with `Source: Figma comment` or `Source: Linked file (<path>)`.

### A Roll-Up

```
Show all open Critical and High feedback
```

```
Everything from FigJam this month
```

### Updating an Entry

A status change updates the dated entry and its register row in the same pass. When work starts on an item, its register row moves to In Progress with the work item's ID (for example `W-112`) in the Work column.

## Example

**User**: "Log this from the lobby review with Sara: the join button is hard to find, and the empty state says 'No data' which is confusing"

**Draft**:

```
Lands in: project-management/feedback/2026-10-17.feedback.md (new file)

F#01 - 2026-10-17
  Reviewer: Sara    Source: Lobby design review
  Category: UX, UI    Module / Area: Game Lobby (linked)
  Severity: High    Status: Open
  Feedback: "The join button is hard to find"
  Duplicate check: none found

F#02 - 2026-10-17
  Reviewer, Source, Module / Area: as above
  Category: Copy / Content    Severity: Medium
  Feedback: "The empty state says 'No data', which is confusing"
  Duplicate check: similar to F#04 - 2026-10-09 (Game Lobby). Same item?

Summary: 2 entries
```

**User**: "Yes, F#02 is the same one. Approved."

**Result**: F#01 is written as new. F#02 is written as `Status: Duplicate`, related to F#04 - 2026-10-09, which gets a "Raised again on 2026-10-17" note. The register is updated to match.

## Tips

- One idea per entry, so each part is rated and tracked on its own
- The Feedback field stays verbatim where possible; a paraphrase is marked
- Every tag and severity is a suggestion: change them in the draft
- It never guesses a module, feature or role; gaps are flagged
- Duplicates stay visible ("raised again") without inflating the counts

## Related Use Cases

- **changelog-generator**: rolls intake batches into reader-facing changelog summaries
- **content-research-writer**: for synthesizing longer feedback or research write-ups

## Requirements

- The project's feedback readme, `project-management/feedback/README.md`. It defines the entry format, the header template, the category table and the register's status mapping. If it and the skill ever disagree, the readme wins.
- The Figma MCP, only for importing FigJam boards.
