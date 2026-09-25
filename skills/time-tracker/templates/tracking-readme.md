# Time tracking

Hours worked on {{PROJECT_NAME}}, measured from Claude Code session activity.
There is no timer to remember - the record is built from the session
transcripts this machine already keeps.

## One timesheet per person

Everyone on the project keeps their own timesheet, side by side in this folder.
Running the time-tracker setup registers you under `people` in `config.json` -
an id made from your `git config user.name`, recognised by your
`git config user.email` - and every file of yours ends in that id:
`2026-09.<id>.md`, `2026-09.<id>.pdf`, `log.<id>.jsonl`. Nobody writes to
anyone else's files, so committing them never conflicts.

Your hours come from your own machine's transcripts, and only commits you
authored are used to name your days. If you commit under more than one email,
add the others to your `emails` list in `config.json`. Neither your name nor
your email ever appears on the PDF.

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
| `config.json` | Shared: first day counted, timezone, idle gap, hours multiplier, and who is who (`people`). |
| `<YYYY-MM>.<person>.md` | One person's month: a total per day, the tasks it split into, and what each task delivered. |
| `<YYYY-MM>.<person>.pdf` | The month as a PDF, rendered from the markdown. |
| `weekly/<YYYY-MM>/<first day>.<person>.pdf` | One PDF per Monday-to-Sunday week, split at the month's edge. |
| `client/<YYYY-MM>.pdf`, `client/weekly/...` | **The ones to send.** Everyone's timesheets merged, with no names. |
| `log.<person>.jsonl` | One line per update: days named, commits used, month total. |
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
`In progress`. The time-tracker skill reads `cache/<month>.<person>.pending.json`
(your own commits and the prompts typed in each block) and replaces those rows
with what was actually worked on. Commit subjects lead, because they are your
own summary of the work; prompts name the blocks that hold no commit.

Under each task it writes a few plain-language bullets saying what that time
delivered - "Customers get a receipt email after every purchase" - taken from
the same evidence. Those bullets are what the PDF shows a client beneath each
task. You can edit them freely; they are kept on every update.

## Commands

```
{{CMD_COLLECT}}              # remeasure, rewrite this month
{{CMD_REPORT}}               # PDFs for this month and this week
{{CMD_REPORT}} --all-weeks   # this month and every week in it
{{CMD_REPORT_LAST}}  # PDF for last month
```

Say **"update tracker"** to Claude to do all of it at once: remeasure the hours,
name every unnamed day including today, and render this month's and this week's PDFs. That is the whole
interface - there is nothing else to remember.

Work that arrives after today has been named becomes a new `In progress` row
below the names. The next update names it too.

## The log

Every update appends a line to your `log.<person>.jsonl`:

```
7 Sept 18:02 - named 2026-09-07 - commits 79e9f55 - 6h 6m
8 Sept 17:40 - named 2026-09-08 - commits 7718184, cfefa0d - 14h 20m
```

It is a receipt, not a source of hours - the month markdown stays the record.
Months later it answers "why is that day called that?".

It is also how an update stays quick: the last line remembers which commit was
reached, so the next run reads forward from there instead of re-reading the
month. Days are still chosen by which ones lack a name, never by the commits -
so a morning of uncommitted work is never skipped.

**The PDF will not render while any day is still unnamed**, and there is no
override - it is the document a client sees, so `In progress` must never appear
on it. Name the days first.

## The client PDF

`client/` holds the PDF that goes to the client: every timesheet in this folder
merged into one, month and weeks alike. It shows no names and nothing that says
how many people worked - hours are summed per day, and the same task on the
same day is one row. It can only merge what is in your checkout, so everyone
commits and pushes their timesheet after updating, and whoever sends it pulls
first. The terminal says whose timesheets went in and how recent each is.

## Weekly PDFs

Alongside the monthly PDF, every update writes the current week's to
`weekly/<YYYY-MM>/`. Weeks run Monday to Sunday and stop at the end of the
month - a week that crosses into October is two PDFs, one in each month's
folder - so a month's weekly PDFs always add up to its monthly one. Finished
weeks keep the PDF from their last update; run the report with `--all-weeks`
to rewrite them all, for instance after correcting an older day.

The PDF needs a Chromium-based browser on the machine; if there is none, the
hours are still recorded and the month markdown is still the complete record.
Nothing else here needs any dependency beyond Node.

## Committing

Nothing here commits itself. The tracker reads git (for commit subjects, as
labelling evidence) and never writes to it - the timesheet and the PDF are left
in the working tree. Commit them whenever you like, alongside code or on their
own; that is your call, not the tool's.
