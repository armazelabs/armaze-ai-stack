# Time tracking

Hours worked on {{PROJECT_NAME}}, measured from Claude Code session activity.
There is no timer to remember - the record is built from the session
transcripts this machine already keeps.

## One timesheet per person, per computer

Everyone on the project keeps their own timesheet, side by side in this folder -
and one per computer they work on. Running the time-tracker setup registers you
under `people` in `config.json` - an id made from your `git config user.name`,
recognised by your `git config user.email` - and, the first time on a computer,
asks what to call that computer (kept in `~/.claude/time-tracker/machine.json`,
for every project). Every file a computer writes ends in both:
`2026-09.<person>.<computer>.md`, `log.<person>.<computer>.jsonl`. Nobody, and
no computer, writes to anyone else's files, so committing them never
conflicts.

Your hours come from each computer's own transcripts, and only commits you
authored are used to name your days. Each computer also commits the stretches
of time it counted, in `activity/`, so if Claude was running on two of your
computers at once, the hour is counted once: whichever computer recorded it
first keeps it. Your personal PDF adds all your computers together. If you commit under more than one email,
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
| `config.json` | Shared: first day counted, timezone, idle gap, hours multiplier, work types (`categories`), and who is who (`people`). |
| `<YYYY-MM>.<person>.<computer>.md` | One person's month on one computer: a total per day, the tasks it split into, and what each task delivered. |
| `<YYYY-MM>.<person>.pdf` | The person's month as a PDF - all their computers merged. |
| `weekly/<YYYY-MM>/<first day>.<person>.pdf` | One PDF per Monday-to-Sunday week, split at the month's edge. |
| `client/<YYYY-MM>.pdf`, `client/weekly/...` | **The ones to send.** Everyone's timesheets merged, with no names. |
| `log.<person>.<computer>.jsonl` | One line per update and per manual entry: days named, commits used, hours added by hand, month total. |
| `activity/<YYYY-MM>.<person>.<computer>.json` | The stretches of time a computer counted, so your other computers do not count them again. |
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

Subagents count without the multiplier. A background agent working while its
main session is idle adds the time it worked, at its actual length. Where it
overlaps a main session, only the main session's time counts.

All seven days count, weekends included.

The day totals are recomputed from the transcripts on every collect. The task
names are not: anything you or the labelling pass writes in place of
`Unlabelled` is kept. A day named partway through that then grows keeps its
named rows, and the extra time shows up as a new `Unlabelled` row. A named day
never shrinks.

Time spent updating the tracker is not counted and never appears on a PDF. A
session that only said "update tracker" is left out whole; in a session that
did other things too, the stretch from the request to the next unrelated
prompt is left out.

## Naming the work

A finished day with no name shows as `Unlabelled`; today's running tail shows as
`In progress`. The time-tracker skill reads `cache/<month>.<person>.<computer>.pending.json`
(your own commits and the prompts typed in each block) and replaces those rows
with what was actually worked on. Commit subjects lead, because they are your
own summary of the work; prompts name the blocks that hold no commit.

Under each task it writes a few plain-language bullets saying what that time
delivered - "Customers get a receipt email after every purchase" - taken from
the same evidence. Those bullets are what the PDF shows a client beneath each
task. You can edit them freely; they are kept on every update.

## Work types

Every task carries a work type in the Type column - Design, Development,
Research and so on, from the `categories` list in `config.json`. Edit that list
to fit the project; keep the names stable, since the PDF's "By type" table adds
time up by them. The labelling pass picks each task's type from the same
evidence it names it from, and you can correct it in the markdown like any name.

```
| Task | Type | Time |
| ---- | ---- | ---- |
| Checkout form validation | Development | 3h 30m |
| Checkout screens in Figma | Design · manual | 3h |
```

## Manual hours

Work away from Claude Code - an afternoon in Figma, a sketch on paper - leaves
no transcript, so it cannot be measured. Every update asks whether you have any;
describe them in your own words ("about three hours in Figma yesterday on the
checkout screens") and Claude turns that into a row, shows it back to you, and
records it once you confirm. Say **"log manual hours"** to add some without an
update.

Manual rows are marked `· manual` in the Type column, and tagged **Manual** on
both PDFs - on the client one too, so nobody has to ask where those hours came
from. They are recorded exactly as given, never multiplied, and no collect
ever trims or regrows them: the day's total is what was measured plus what you
logged. A day can hold only manual hours.

They are written by `{{ENGINE_REL}}/manual.mjs`, never by hand, so the row and the
day's total move together and every change leaves a line in your log with your
own description:

```
node {{ENGINE_REL}}/manual.mjs add --date 2026-10-02 --type Design --task "Checkout screens in Figma" --hours 3 \
  --bullet "Mobile and desktop checkout layouts" --note "3h in Figma yesterday on checkout"
node {{ENGINE_REL}}/manual.mjs set --date 2026-10-02 --task "Checkout screens in Figma" --hours 2.5
node {{ENGINE_REL}}/manual.mjs remove --date 2026-10-02 --task "Checkout screens in Figma"
```

Any day from `trackFrom` to today can take manual hours, including last month's
- re-render that month's PDFs afterwards (`--month <YYYY-MM> --all-weeks`).

## Commands

```
{{CMD_COLLECT}}              # remeasure, rewrite this month
{{CMD_REPORT}}               # PDFs for this month and this week
{{CMD_REPORT}} --all-weeks   # this month and every week in it
{{CMD_REPORT_LAST}}  # PDF for last month
```

Say **"update tracker"** to Claude to do all of it at once: remeasure the hours,
name and type every unnamed day including today, ask about manual hours, and
render this month's and this week's PDFs. That is the whole
interface - there is nothing else to remember.

Work that arrives after today has been named becomes a new `In progress` row
below the names. The next update names it too.

## The log

Every update appends a line to your `log.<person>.<computer>.jsonl`:

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
how many people worked - hours are summed per day, and the same task of the
same type on the same day is one row. A row that pools manual hours with
measured ones is tagged **Partly manual**. It can only merge what is in your checkout, so everyone
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

## Several computers

Each computer keeps its own timesheet, and you name each computer's days on that
computer - it is the one with the transcripts. A day still unnamed on one
computer holds back your PDF on the others until you run "update tracker" there
and push. So after an update on any computer, commit and push its timesheet and
`activity/` file, and pull before rendering on another.

A manual entry can be corrected from any of your computers. If it was logged on
another one, its file must have no uncommitted changes here: pull first, and
push straight after.

## Committing

Nothing here commits itself. The tracker reads git (for commit subjects, as
labelling evidence) and never writes to it - the timesheet and the PDF are left
in the working tree. Commit them whenever you like, alongside code or on their
own; that is your call, not the tool's.
