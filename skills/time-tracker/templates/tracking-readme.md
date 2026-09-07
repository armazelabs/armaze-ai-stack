# Time tracking

Hours worked on {{PROJECT_NAME}}, measured from Claude Code session activity.
There is no timer to remember - the record is built from the session
transcripts this machine already keeps.

## The switch

Tracking is **off until you turn it on**, and it deals in whole dates.

```
{{CMD_START}}     # today counts, all of it
{{CMD_STOP}}      # today is the last counted day
{{CMD_STATUS}}    # on or off, ranges, this month's total
```

Starting at three in the afternoon still counts that whole day, morning
included. Days outside every started-and-stopped range are never counted, even
though their transcripts exist.

## The files

| File | What it is |
| --- | --- |
| `state.json` | The tracked date ranges. This is the on/off switch. |
| `config.json` | Timezone, idle gap, hours multiplier, which days count. |
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
`In progress`. Ask for the time-tracker skill's labelling pass and it reads
`cache/<month>.raw.json` - the prompts typed and commits landed in each block -
and replaces those rows with what was actually worked on.

## Commands

```
{{CMD_COLLECT}}              # remeasure, rewrite this month
{{CMD_REPORT}}               # PDF for the current month
{{CMD_REPORT_LAST}}  # PDF for last month
```

Say **"updatetracking"** to Claude to do all of it at once: remeasure, name
every unnamed day, and render the PDF. Stopping does the same for today.

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
