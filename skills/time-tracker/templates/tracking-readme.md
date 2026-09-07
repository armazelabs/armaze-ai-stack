# Time tracking

Hours worked on {{PROJECT_NAME}}, measured from Claude Code session activity.
There is no timer to remember - the record is built from the session
transcripts this machine already keeps.

## The boundary

There is no on/off switch. `trackFrom` in `config.json` is the first day that
counts - the day this was installed - and every day from then on is counted.
Days before it are ignored even though their transcripts exist. To count earlier
work, back-date that one line.

Nothing runs in the background: no hook, no scheduled collection. The timesheet
moves only when you ask for it.

## The files

| File | What it is |
| --- | --- |
| `config.json` | First day counted, timezone, idle gap, hours multiplier. |
| `<YYYY-MM>.md` | The month's record: a total per day, and the tasks it split into. |
| `<YYYY-MM>.pdf` | The printable version, rendered from the markdown. |
| `cache/` | Evidence for labelling - prompts and commits per block. Gitignored. |
| `engine/` | The measurement code. Generated; re-synced by the skill. |

## How a day is measured

Every session event carries a timestamp. Events closer together than the idle
gap (default 20 minutes) form one block; a longer gap ends it. A block never
crosses midnight, and the gaps between blocks are not counted - so the number
errs low rather than high.

Measured hours are multiplied by **{{HOURS_MULTIPLIER}}** before being
recorded - that is `hoursMultiplier` in `config.json`. Changing it applies to
days measured from then on; days already recorded keep the number they were
written with.

All seven days count, weekends included.

The day totals are recomputed from the transcripts on every collect. The task
names are not: anything you or the labelling pass writes in place of
`Unlabelled` is kept.

## Naming the work

A finished day with no name shows as `Unlabelled`; today's running tail shows as
`In progress`. The time-tracker skill reads `cache/<month>.raw.json` - the
commits landed and prompts typed in each block - and replaces those rows with
what was actually worked on. Commit subjects lead, because they are your own
summary of the work; prompts name the blocks that hold no commit.

## Commands

```
{{CMD_COLLECT}}              # remeasure, rewrite this month
{{CMD_REPORT}}               # PDF for the current month
{{CMD_REPORT_LAST}}  # PDF for last month
```

Say **"update tracker"** to Claude to do all of it at once: remeasure the hours,
name every unnamed day including today, and render the PDF. That is the whole
interface - there is nothing else to remember.

Work that arrives after today has been named becomes a new `In progress` row
below the names. The next update names it too.

**The PDF will not render while any day is still unnamed**, and there is no
override - it is the document a client sees, so `In progress` must never appear
on it. Name the days first.

The PDF needs a Chromium-based browser on the machine; if there is none, the
hours are still recorded and the month markdown is still the complete record.
Nothing else here needs any dependency beyond Node.

## Committing

Nothing here commits itself. The tracker reads git (for commit subjects, as
labelling evidence) and never writes to it - the timesheet and the PDF are left
in the working tree. Commit them whenever you like, alongside code or on their
own; that is your call, not the tool's.
