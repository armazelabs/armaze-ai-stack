# Time tracking

Hours worked on {{PROJECT_NAME}}, measured from Claude Code session activity.
There is no timer to remember - the record is built from the session
transcripts this machine already keeps.

## Getting started

**New on this project?** Install the skill and set yourself up - once per
computer:

1. In the project's folder, in the terminal: `aistack add time-tracker`
2. In Claude Code, say **"set up time tracking"** and answer its questions
   (the monthly hours are already set for this project, so usually it only
   asks what to call your computer).
3. It checks itself at the end. Look for **"All good - time tracking is
   working."**

**A new version came out?** On every computer, the same day (a computer on an
older version cannot read the newer timesheets):

1. In the project's folder, in the terminal: `aistack update`
2. In Claude Code, say **"update time tracker setup"**. It moves this project
   to the new version, asks for anything new it needs, and checks everything.
3. Look for **"All good - time tracking is working."**, then commit what
   changed (`.claude/settings.json` and this folder) so teammates get it.

**Not sure it's working?** Say **"check time tracker"**. It checks the
version, the settings, that the session hooks are installed and run, that
hours measure and the budget shows, and that PDFs can be made - and fixes
what it can on the spot. Checking is not counted as work, and it works even
when the hours have run out.

## One timesheet per computer

Every computer working on the project keeps its own timesheet, side by side in
this folder. The first time on a computer, the time-tracker setup asks what to
call it (kept in `~/.claude/time-tracker/machine.json`, for every project), and
every file that computer writes ends in that name: `2026-09.<computer>.md`,
`log.<computer>.jsonl`. No computer writes to another's files, so committing
them never conflicts. No git name or email is involved.

A computer's hours come from its own transcripts, and only commits made on
that computer (its git reflog) are used to name its days. **Every computer
counts in full**: two computers working at the same time are two lots of
hours, and the client PDF and the budget add them all together. No name or
email ever appears on a PDF.

## The boundary

There is no on/off switch. `trackFrom` in `config.json` is the first day that
counts - the day this was installed - and every day from then on is counted.
Days before it are ignored even though their transcripts exist. To count earlier
work, back-date that one line.

## The hour budget

`monthlyHours` in `config.json` is the project's hours for a month - shared by
every computer on it. A week (Monday to Sunday, even where it crosses
into the next month) may use a quarter of it - **{{WEEKLY_HOURS}}** hours - and
the month never more than all of it. In a five-week month, the last week gets
whatever the month has left.

What counts is what the timesheets record: every computer's, measured and
manual, after the multipliers - the hours the client PDF shows, and the
done / remaining / total every PDF prints. Only the timesheets in your
checkout count, so another computer's hours count once it pushes and you pull.

- **Every session checks in.** When a Claude Code session starts, the hours
  are re-measured and you see how much of the week and the month is used and
  left. When it ends, they are re-measured again, so the timesheet is current.
- **Prompts stop when the budget is used up.** Each prompt re-measures the
  hours first; once this week or this month is used up, the prompt is refused
  until the week (or the month) opens again. "update tracker" and "check time
  tracker" still work, so the days can be named, the PDFs sent and the
  tracker repaired. To work anyway, start Claude Code
  with `TIME_TRACKER_OVERRIDE=1`.
- **Nothing is trimmed.** If a session runs past the budget before it is
  stopped, the hours are recorded as measured, a collect warns, and the log
  notes it once for that week or month.
- **Manual hours that would go over are refused**, with how much is left.

Check where you stand at any time with `node {{ENGINE_REL}}/budget.mjs`.

The hooks live in the project's `.claude/settings.json` and run
`{{ENGINE_REL}}/hooks.mjs`. They only measure and check - naming the days and
rendering the PDFs is still "update tracker".

## The files

| File | What it is |
| --- | --- |
| `config.json` | Shared: first day counted, timezone, idle gap, hours and subagent multipliers, monthly hours budget, work types (`categories`). |
| `<YYYY-MM>.<computer>.md` | One computer's month: a total per day, the tasks it split into, when and in which session each happened, and what each delivered. |
| `<YYYY-MM>.<computer>.pdf` | That month as a PDF, with this computer's hours beside the project's and each task's times and session. |
| `weekly/<first day>.<computer>.pdf` | One PDF per whole Monday-to-Sunday week - the week of 28 Sep is one PDF across both months. |
| `client/<YYYY-MM>.pdf`, `client/weekly/<first day>.pdf` | **The ones to send.** Every computer's timesheet merged, with no names, computers, sessions or clock times. |
| `log.<computer>.jsonl` | One line per update and per manual entry: days named, commits used, hours added by hand, month total. |
| `cache/` | Evidence for labelling - prompts, sessions and commits per block. Gitignored. |
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

Subagents count at their own multiplier, `subagentMultiplier` (1.2 by
default). A background agent working while its main session is idle adds the
time it worked, times 1.2. Where it overlaps a main session, only the main
session's time counts. When an agent reports back and the main session
picks the result up on its own, with no prompt from you, that turn counts as
agent time too: it is not you working, even though it shows up in the main
session.

All seven days count, weekends included.

The day totals are recomputed from the transcripts on every collect. The task
names are not: anything you or the labelling pass writes in place of
`Unlabelled` is kept. A day named partway through that then grows keeps its
named rows, and the extra time shows up as a new `Unlabelled` row. A named day
never shrinks. If `config.json` has a `fullCountFrom` - written when the
project moved to one timesheet per computer - days before it are never
re-measured at all.

Time spent updating the tracker is not counted and never appears on a PDF. A
session that only said "update tracker" is left out whole; in a session that
did other things too, the stretch from the request to the next unrelated
prompt is left out.

## Naming the work

A finished day with no name shows as `Unlabelled`; today's running tail shows as
`In progress`. The time-tracker skill reads `cache/<month>.<computer>.pending.json`
(this computer's commits, its sessions and the prompts typed in each block) and
replaces those rows with what was actually worked on. Commit subjects lead,
because they are your own summary of the work; prompts name the blocks that
hold no commit.

Under each task it writes two to four plain-language bullets saying what that
time delivered - "Customers get a receipt email after every purchase" - taken
from the same evidence. Those bullets are what the PDF shows a client beneath
each task. You can edit them freely; they are kept on every update.

Each task also records **when** it happened and **in which session** - the
first eight characters of the Claude Code session id - and under each day a
legend names every session by its opening prompt. Your own PDF prints them
under each task (`09:10-11:20 · studio · "fix checkout validation bug"`); the
client's never does.

Unnamed time still goes on the PDFs - as **Research & exploration**, typed
Research, with no bullets - so no PDF is ever held back. A named task reads
better to a client, so "update tracker" names them.

## Work types

Every task carries a work type in the Type column - Design, Development,
Research and so on, from the `categories` list in `config.json`. Edit that list
to fit the project; keep the names stable, since the PDF groups each day's tasks
by them and its "By type" table adds time up by them. The labelling pass picks
each task's type from the same evidence it names it from, and you can correct it
in the markdown like any name.

```
| Task | Type | When | Session | Time |
| ---- | ---- | ---- | ------- | ---- |
| Checkout form validation | Development | 09:10-11:20 | 4c11d0a2 | 3h 30m |
| Checkout screens in Figma | Research · manual, 2h given | - | - | 3h |

> Sessions
> 4c11d0a2 · fix checkout validation bug
```

## Manual hours

Work away from Claude Code - an afternoon in Figma, a sketch on paper - leaves
no transcript, so it cannot be measured. Every update asks whether you have any;
describe them in your own words ("about three hours in Figma yesterday on the
checkout screens") and Claude turns that into a row, shows it back to you, and
records it once you confirm. Say **"log manual hours"** to add some without an
update.

Manual hours are always **Research**. They are scaled like measured time -
hours given times **{{HOURS_MULTIPLIER}}** - and the row keeps both:
`Research · manual, 2h given` in the Type column, the recorded hours in Time.
They are tagged **Manual** on both PDFs - on the client one too, so nobody has
to ask where those hours came from - and no collect ever trims or regrows
them: the day's total is what was measured plus what you logged. A day can
hold only manual hours. They count against the hour budget at their recorded
size, and an entry that would take its week or month over it is refused.
Bullets are optional for manual hours.

They are written by `{{ENGINE_REL}}/manual.mjs`, never by hand, so the row and the
day's total move together and every change leaves a line in your log with your
own description:

```
node {{ENGINE_REL}}/manual.mjs add --date 2026-10-02 --task "Checkout screens in Figma" --hours 2 \
  --bullet "Mobile and desktop checkout layouts" --note "2h in Figma yesterday on checkout"
node {{ENGINE_REL}}/manual.mjs set --date 2026-10-02 --task "Checkout screens in Figma" --hours 2.5
node {{ENGINE_REL}}/manual.mjs remove --date 2026-10-02 --task "Checkout screens in Figma"
```

Any day from `trackFrom` to today can take manual hours, including last month's
- re-render that month's PDFs afterwards (`--month <YYYY-MM> --all-weeks`).

## Commands

```
{{CMD_COLLECT}}              # remeasure, rewrite this month
{{CMD_REPORT}}               # PDFs for this month and this week
{{CMD_REPORT}} --all-weeks   # this month and every week begun in it
{{CMD_REPORT_LAST}}  # PDF for last month
```

Say **"update tracker"** to Claude to do all of it at once: remeasure the hours,
name and type every unnamed day including today, ask about manual hours, and
render this month's and this week's PDFs. That is the whole
interface - there is nothing else to remember.

Work that arrives after today has been named becomes a new `In progress` row
below the names. The next update names it too.

## The log

Every update appends a line to this computer's `log.<computer>.jsonl`:

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

## The client PDF

`client/` holds the PDFs that go to the client: every computer's timesheet in
this folder merged into one, month and weeks alike. They show no names, no
computers, no sessions, no clock times, and nothing that says how many people
worked - hours are summed per day, and the same task of the same type on the
same day is one row. A row that pools manual hours with measured ones is tagged
**Partly manual**. They can only merge what is in your checkout, so every
computer commits and pushes its timesheet after updating, and whoever sends
them pulls first. The terminal says whose timesheets went in and how recent
each is.

## What the PDFs show

- **The hour budget.** A weekly PDF: hours done this week, remaining, and the
  week's total. A monthly PDF: hours done so far, remaining, and the month's
  total. Your own PDFs put this computer's hours beside the project's.
- **Week by week** on monthly PDFs: a table of every week touching the month,
  upcoming ones included, each counting its whole Monday-to-Sunday week, then
  the days grouped under each week.
- **Tasks grouped by work type** within each day, with subtotals, bullets
  under each task, and a Manual tag on hours logged by hand.

## Weekly PDFs

Alongside the monthly PDF, every update writes the current week's to
`weekly/<first day>.<computer>.pdf` (and the client's to
`client/weekly/<first day>.pdf`). Weeks run Monday to Sunday, whole - a week
that crosses into October is one PDF holding days from both months. Finished
weeks keep the PDF from their last update; run the report with `--all-weeks`
to rewrite them all, for instance after correcting an older day.

The PDF needs a Chromium-based browser on the machine; if there is none, the
hours are still recorded and the month markdown is still the complete record.
Nothing else here needs any dependency beyond Node.

## Several computers

Each computer keeps its own timesheet, and each computer's days are named on
that computer - it is the one with the transcripts. A day still unnamed on one
computer shows on the client PDF as "Research & exploration" until it is named
there and pushed. So after an update on any computer, commit and push its
timesheet, and pull before sending the client PDF.

A manual entry logged on another computer can be corrected from this one with
`--computer <name>`; its file must have no uncommitted changes here: pull
first, and push straight after.

## Committing

Nothing here commits itself. The tracker reads git (for commit subjects, as
labelling evidence) and never writes to it - the timesheet and the PDF are left
in the working tree. Commit them whenever you like, alongside code or on their
own; that is your call, not the tool's.
