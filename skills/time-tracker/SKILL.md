---
name: time-tracker
description: >
  Time tracking with no timer and no switch, measured after the fact from
  Claude Code session transcripts and named from the commits made on that
  computer, with a work type (design, development, research...), clock times,
  the session and plain-language outcome bullets under every task, plus manual
  hours for work done away from Claude Code, tagged as manual research. One
  timesheet per computer, each counted in full. Each project has a monthly
  hours budget, a quarter of it per week: every session start and end
  re-measures and reports it, and prompts stop once the week or month is used
  up. One command brings it fully up to date: remeasure the hours, name and
  type every unnamed day, ask about manual hours, re-render the monthly and
  whole-week PDFs with hours done, left and total - the computer's own, and
  one merged, anonymous client PDF with a week-by-week breakdown. Sets itself up in any project, in any language - no package.json or build tooling needed - inside
  <project-management>/tracking/. Use for "set up time tracking", "add a time
  tracker", "update tracker", "update tracking", "updatetracking", "how many
  hours have I worked", "label my time", "time tracking report", "log manual
  hours", "add 2h of design yesterday", "check time tracker", "update time
  tracker setup", "is time tracking working", or the /time-tracker command.
---

Time is measured after the fact, from the session transcripts Claude Code
already writes, and each day is named from the commits and prompts that landed
in it. There is no timer, no stopwatch and no on/off switch.

**Hooks measure, people name.** Setup installs three Claude Code hooks in the
project's `.claude/settings.json`, all running `<engine>/hooks.mjs`: SessionStart
and SessionEnd re-measure the hours (a plain collect) and SessionStart shows the
hour budget; UserPromptSubmit refuses prompts once the budget is used up (see
**The hour budget**). Naming days, manual hours and PDFs need Claude, so they
still move only when the user asks - which is what **Update tracker** does.
Between asks, the hours are current and the names slightly behind, and that is
correct.

The one boundary is `trackFrom` in `<tracking>/config.json` - the day the
tracker was installed. Every day from then on counts; days before it are
ignored even though their transcripts exist.

**Every timesheet belongs to one computer.** Setup names the computer, once,
in `~/.claude/time-tracker/machine.json` - a short name plus four random
characters, like `studio-3f9a`. That name is the **file id**, which suffixes
every file the computer writes - `<month>.<fileid>.md`, `log.<fileid>.jsonl`,
`cache/<month>.<fileid>.pending.json` - so no two computers ever write the
same file, and nothing conflicts in git. No git identity is involved: hours
come from this computer's own transcripts, and only commits **made on this
computer** - its git reflog - are evidence. If the engine says this computer
has no name, run Setup.

**Every computer counts in full.** A computer is a worker: two computers
running at the same time are two people's hours, or one person's two streams
of work, and both are billed. The client PDF and the budget add every
computer's timesheet together. An install upgraded from the per-person version
carries `fullCountFrom` in `config.json` - the Monday of the month's first week
at the upgrade - and days before it keep the hours already recorded, since
those had time shared between a person's computers taken off and were already
reported.

**Each task says when and where.** The collector knows which Claude Code
sessions every stretch of time came from. The month file records each task's
clock times (`When`) and sessions (`Session`, by the first eight characters of
the session id), and under each day a legend naming every session by its
opening prompt. The computer's own PDF prints that under each task -
`09:10-11:20 · studio · "fix checkout validation bug"`; the client PDF never
does.

## Pick the mode from what was asked

| The user wants | Mode |
| --- | --- |
| tracking set up here, installed, added | **Setup** |
| "check time tracker", "update time tracker setup", is it working, after installing a new version | **Check** |
| "update tracker", the timesheet current, hours + labels + PDF | **Update tracker** |
| hours so far, what's tracked, is it current | **Status** |
| the days named and nothing else | **Label** |
| a PDF for some other month, or every week of one | **Report** |
| hours done by hand added, changed or removed - "log 2h design yesterday" | **Log manual hours** |

**Update tracker is the main mode.** Almost every request that is not a first
install is one - reach for the narrower modes only when the user asked for that
piece specifically.

Everything lives in one folder. Find it before doing anything but Setup:
`<project-management>/tracking/`, where the project-management folder may be
spelled `project-management`, `Project Management` or `project_management`. The
engine is `<tracking>/engine/*.mjs`; below, `<engine>` means that path.

## Setup

**Ask for the project's monthly hours first**, before running anything - on a
first install (no `<tracking>/config.json` yet), and on a re-run whose config has
no `monthlyHours` (setup says so). Ask with AskUserQuestion: "How many hours a
month does this project have?", offering `160` (40 a week), `120` (30 a week),
`80` (20 a week), and let them type their own. It is the whole team's budget,
not each person's; a week gets a quarter of it. Do not guess it - it is the one
setting nobody can infer.

The multipliers are not asked. Measured hours are recorded at
`hoursMultiplier` **1.5**, and subagent time no main session covered at
`subagentMultiplier` **1.2**. To change either, edit `<tracking>/config.json`;
a change does not retroactively rescale days already named.

**Name the computer** if it has no name yet - when
`~/.claude/time-tracker/machine.json` does not exist. Ask with AskUserQuestion,
"What should this computer be called?", offering the hostname slugged
(`hostname`, lowercased, `.local` dropped, anything but letters and digits
turned to `-`) first and letting them type their own (`studio`, `laptop`). It
is asked once per computer, for every project; never ask when the file exists.

Then run, from the project root:

```
node <skill_dir>/scripts/setup.mjs --monthly-hours <their answer> --machine <their name>
```

Without a name and without `--machine`, setup stops with exit code 2 and
prints the name it suggests - ask, then run it again. On a first install
without `--monthly-hours` it stops the same way. No git name or email is
needed. On a re-run, where `config.json` already exists,
`--monthly-hours` sets the budget only when given - pass it when the config has
none or the person asked to change it.

`<skill_dir>` is the folder holding this file. The script is idempotent and does
all the file work: finding or creating the project-management folder, creating
`tracking/` inside it, syncing the engine, writing `config.json` with today as
`trackFrom`, writing a readme if absent, gitignoring the cache, installing the
hooks in `.claude/settings.json` (keeping any hooks the project already has),
and adding npm scripts **only if** the project happens to have a `package.json`.

It never requires a manifest. A docs repo, a design repo, a Python or Go or Rust
project all set up the same way - the project's name is read from whatever
manifest exists and falls back to the folder name. Node is the only dependency,
and Claude Code ships with it. If the script reports something missing, report
that, but never treat "no package.json" as a reason to stop.

**Re-running setup migrates an older install.** It replaces the old
SessionStart hook with the current three, adds `subagentMultiplier`, deletes
`state.json`, prunes the engine files that are gone, and backfills
`trackFrom` from the earliest day the old switch ever tracked - so a timesheet
that already exists survives intact.

An install from the **per-person** version (`<month>.<person>.<computer>.md`)
becomes per-computer: this computer's files are renamed to
`<month>.<computer>.md` and `log.<computer>.jsonl`, its `activity/` overlap
records are deleted (nothing reads them now), and `fullCountFrom` is written
(see above). Older files from before computers had names, or the one shared
`<month>.md`, go to this computer when no other computer has taken that
history. Two people who shared one computer both map to the same new file -
setup leaves both and says so; merge them by hand. `people` in `config.json`
is left for computers still on the older version and can be deleted once every
computer has upgraded. Old weekly PDF folders (`weekly/<YYYY-MM>/`) are listed
as safe to delete. **Upgrade every computer on the project the same day**: a
computer on the older version cannot read the new month files. Say what it
migrated.

When someone runs setup on a new computer for a project that already has the
tracker, setup only names the computer, and its timesheet starts beside the
others.

**Then always run the check** - **Check** below, from step 2 - so a new setup
ends by proving it works.

Tell the user tracking counts from today onward, the weekly and monthly hours,
that prompts stop when they run out, and give them the phrases
**"update tracker"** and **"check time tracker"**. Mention that
`.claude/settings.json` changed - the hooks reach teammates once it is
committed.

## Check

"check time tracker", "update time tracker setup", "is time tracking
working" - and the step a member takes after `aistack update` brings in a new
version of this skill. It checks the project and fixes what it can, without
asking: the fix is setup run again.

1. From the project root:

   ```
   node <skill_dir>/scripts/check.mjs --fix
   ```

2. **Exit 2** means it needs an answer first, one `needs:` line each:
   `needs: monthly-hours` - ask as in **Setup** (160 / 120 / 80 / their own);
   `needs: machine <suggested>` - ask the computer's name, offering the
   suggestion first. Then run it again with `--monthly-hours <n>` and/or
   `--machine <name>` added. This also installs the tracker in a project that
   has none.
3. **Relay the result** in plain words: what was fixed, each line that is
   still `✘` or `!` and what it means, and the budget line. Exit 0 is "all
   good". Exit 1 means something setup cannot fix - a config.json or
   .claude/settings.json that will not parse - say what to do
   and do not edit those by hand unasked. A `!` about PDFs is a warning: hours
   are still recorded. A `!` naming computers not upgraded yet means their
   timesheets still use the older names - they count, but each should run the
   update on that computer.
4. If it installed the hooks, say they start with the next Claude Code session,
   and that `.claude/settings.json` and the `tracking/` folder need committing
   for teammates to get them.

The check runs the hooks, a collect and the budget - it does not name days or
render PDFs. Like an update, the time spent on it is not billed, and it still
works when prompts are blocked.

## Update tracker

The one command. Triggered by "update tracker", "update tracking",
"updatetracking", "update my timesheet". If `config.json` has no
`monthlyHours`, ask for it first (as in **Setup**) and re-run setup with
`--monthly-hours`. Then five steps, in order, all of them:

1. **Measure.** `node <engine>/collect.mjs` - rescan the transcripts, rewrite
   the month markdown, and build the work list.
2. **Name.** Read `references/labelling.md` and name **every** unnamed day,
   today included, giving each task a work type from `categories` in
   `config.json`, its clock times and sessions, and 2-4 plain-language
   outcome bullets under it. Commits lead; prompts fill in the blocks that
   have none. Read `cache/<month>.<fileid>.pending.json` for this - it holds
   only the days that still need work, each with its `needs`: `names`,
   `bullets`, `types` and `times` for an unnamed day; any of `bullets`,
   `types` or `times` alone for a day named before those existed, which keeps
   its names and gets what it lacks added. Never read `raw.json` for a
   routine update: it is the whole month, and reading twenty settled days to
   name one is the cost this is here to avoid.
3. **Manual hours.** Always ask - people forget work they did away from
   Claude Code, which is the point of asking every time. Follow **Log manual
   hours** below, opening with AskUserQuestion: "Any manual hours to add since
   the last update?", options **No** first, then **Yes, add some**. On No, go
   straight on. Note every date an entry lands on for the next step.
4. **Render.** `node <engine>/report.mjs` - write this month's PDF and this
   week's, whole Monday to Sunday. When the current week began last month (an
   update on Thursday 1 October, say), it also writes last month's PDF, so the
   final days of a month still reach one - which means any of last month's
   days still unnamed (its own `pending.json`) should be named in step 2 too.
   If step 3 added hours to a day outside the current week, add
   `--all-weeks`; for a day in an earlier month, also run
   `node <engine>/report.mjs --month <that month> --all-weeks`. Go straight
   here from steps 2 and 3 - `manual.mjs` writes the month file itself;
   **do not collect again to check the naming**. Today is still running, so a
   second collect finds the minutes that passed while you were labelling and
   opens a fresh `In progress` row for them, which would reach the PDF as
   "Research & exploration" instead of the names you just wrote.
5. **Record the run.**

   ```
   node <engine>/log.mjs record --named <the days you named> --session <session id>
   ```

   Comma-separate the days. This appends one line to `<tracking>/log.<fileid>.jsonl`
   saying what was named, which commits were consumed, and the month total -
   and moves the commit watermark that step 1 reads next time. Manual hours
   are not passed here - `manual.mjs` already logged each one. Do it last, once
   the naming is actually on disk, so the log never claims work that was not
   done. Pass the session id from this session's transcript path if you have
   it; omit `--session` rather than inventing one.

Then report the days you named, any manual hours added, the month total, the
hour budget (`node <engine>/budget.mjs` - used and left this week and this
month, and say plainly if either is over), where the PDFs landed - the
client PDF first, since it is the one that gets sent - and whose timesheets it
merged. If the collector or the report printed **Unnamed** days, say so
plainly: their hours are on the PDFs as "Research & exploration", which a
client reads as less than a named task. If no
Chromium-based browser is found the hours are still recorded and the markdown is
still complete - say so rather than treating it as a failure.

**Time spent updating the tracker is not work.** The collector leaves out a
session that only asked for an update, and in a mixed session the stretch from
"update tracker" to the next unrelated prompt. Never write a task row for
timesheet work ("Timesheet update", "Hours recorded and named" or similar) -
the PDF drops such rows anyway, so one only makes the day's rows stop adding
up. Subagent time is counted at `subagentMultiplier` (1.2), not the main
multiplier, wherever no main session covered it. A main-session turn started
by an agent's task notification rather than a prompt is agent time as well.

**Today gets named like any other day.** With nothing running in the background
there is no later pass to defer to, so a day left as `In progress` would just
stay that way and reach the PDF as "Research & exploration". Later work on the
same day arrives as a fresh `In progress` row beneath the names you wrote; the
next update names that too. That is the design, not a mistake to chase.

## Log manual hours

Work done away from Claude Code - an afternoon in Figma, a sketch on paper, a
call - leaves no transcript, so no collect can measure it. The person says it
happened, and that is the record. This mode is step 3 of every update, and it
also runs on its own whenever they ask ("log 2h design yesterday", "add manual
hours", "that Friday sketch was 2h, not 1.5h").

1. **Get the description.** If they have not given it yet, ask with
   AskUserQuestion - a free-text answer through "Other" - for what they did,
   on which days, for how long, in their own words. Collect it there rather
   than as a chat reply: an answer is not a prompt, so the time stays out of
   the work measured, like the rest of an update.
2. **Turn it into entries.** One entry per day per piece of work: date
   (resolve "yesterday", "Friday" against today in the config's timezone), a
   task name, the hours given and, if the description says what came of it,
   up to three outcome bullets - optional for manual hours. The type is
   always **Research**; do not ask for one. The description is the evidence:
   any bullets follow the same rules as in `references/labelling.md` - plain
   words, outcomes, nothing it does not say. Do not take hours from a guess.
   If a date or a length ("a few hours", "most of the afternoon") is unclear,
   ask - AskUserQuestion with the likely readings as options.
3. **Confirm.** Show a table - date · task · hours given · hours recorded
   (given × `hoursMultiplier`, 1.5 unless the config says otherwise) ·
   bullets - and ask with AskUserQuestion: **Looks right** / **Change
   something**. Write nothing until they confirm.
4. **Write each entry**, one call per entry:

   ```
   node <engine>/manual.mjs add --date <YYYY-MM-DD> --task "<name>" --hours <h given> \
     [--bullet "<outcome>"]... --note "<their description, verbatim>" [--session <id>]
   ```

   It refuses a day before `trackFrom`, a future day, or a second manual row
   of the same name on that day - relay the reason and adjust with the person
   rather than working around it. Corrections go through the same tool: `set`
   (`--hours`, `--rename`, `--bullet`) and `remove`, each with `--date` and
   `--task`, and a `--note` saying why. They look in this computer's
   timesheet. A row on another computer's says whose it is; to change it from
   here add `--computer <id>`, which refuses while that file has uncommitted
   changes here - tell the person to pull first - and after the edit, tell
   them to commit and push it before that computer collects again.
5. **Render.** Inside an update, step 4 does it. On its own, run the command
   `manual.mjs` prints - `report.mjs`, with `--month <M> --all-weeks` when the
   day is outside the current week.

Manual hours are **Research**, and they are scaled like measured time: the
hours given times `hoursMultiplier`, so 2h given at 1.5 is recorded as 3h. The
month file keeps both - `Research · manual, 2h given` in the Type cell, 3h in
Time. Entries from before this was so read `<Type> · manual` with nothing
given; they stay as recorded, and a `set --hours` on one re-times it scaled.
Nothing checks manual hours against measured time - the person's word is the
record. They count against the hour budget at their recorded size:
`manual.mjs` refuses an `add`, or a `set` that lengthens a row, when it would
take that day's week or month past it, and says how much is left. Relay that
and ask how they want to adjust - never split an entry across days or shave
it to squeeze it in unasked. They carry a **Manual** tag on both PDFs, client
one included. No collect ever trims or regrows them.

## The hour budget

`monthlyHours` in `config.json` is the project's budget for a month, shared by
everyone on it. A Monday-to-Sunday week - even one that crosses into the next
month - may use a quarter of it; the month never more than all of it. It counts
recorded hours: every computer's timesheet in the checkout, measured and
manual, after the multipliers, less timesheet-upkeep rows - the same hours the
client PDF shows, and the done / left / total the PDFs print.
`node <engine>/budget.mjs` prints where this week and month stand.

- **SessionStart** re-measures and tells the session (and the person) the
  week's and month's hours used and left.
- **UserPromptSubmit** re-measures in memory and refuses the prompt once the
  week or the month is used up, until the week or the month reopens. Tracker
  requests ("update tracker", "log manual hours", "check time tracker",
  "update time tracker setup", `/time-tracker`) still go through, and `TIME_TRACKER_OVERRIDE=1` in the environment lets everything
  through.
- **SessionEnd** re-measures so the record is current.
- **Over budget is recorded, not trimmed.** A collect that finds the week or
  month over prints a warning and logs one `"kind": "over-budget"` line per
  week or month that crossed. Report it; never trim rows to fit.

**Exceptions.** `budgetExceptions` in `config.json` changes the budget for a
stretch of days the person chose - a list of
`{ "from", "to", "weeklyHours", "monthlyHours", "note" }`. A week starting
inside it gets `weeklyHours`; a day inside it is held to `monthlyHours` for
its month, and `"monthlyHours": null` lifts the month cap for those days.
Leave either out to keep the usual figure. The `note` is the person's own
words, printed under the heading of every PDF, client and personal, whose span
touches the exception's months - say what changed and why, the way they want
the client to read it. Add or change one only when the person asks, with the
dates and the note in their words.

If the session context says the budget is used up, tell the person before
starting any work. Never set `TIME_TRACKER_OVERRIDE`, edit `monthlyHours` or
`budgetExceptions`, or touch the hooks to get past a block - those are the
person's call.

## The log and the watermark

`<tracking>/log.<fileid>.jsonl` is one line per update: days named, commits consumed,
session, month total - and one line, `"kind": "manual"`, per manual entry added,
changed or removed, with the hours given and recorded and the person's own
description as its `note`. It is an audit trail for a client-facing timesheet - and
the last line's `throughCommit` is the watermark the next run reads, so there is
no separate state file.

**The watermark narrows reading, never naming.** `pending.json` is built from
which days still carry a placeholder, not from which commits are new, because a
day can hold six hours and no commits at all - most work is uncommitted at the
moment it is measured. A commit-driven work list would silently drop those days.
Never reach for the log to decide what to skip.

Nothing in the log ever feeds a number back into the timesheet. The month
markdown is the record; the log only says what happened.

## Status

There is no status command. Run `node <engine>/collect.mjs` and read the month
file back: it holds the per-day totals, the task names, and any row still
carrying a placeholder. Relay it plainly - do not go on to label or render
unless the user asked for an update.

## Label

Read `references/labelling.md` and follow it. Use this mode only when the user
asked for names and nothing else; otherwise it is step 2 of Update tracker.

## Report

```
node <engine>/report.mjs                          # this month + this week
node <engine>/report.mjs --all-weeks              # this month + every week begun in it
node <engine>/report.mjs --last-month --all-weeks
node <engine>/report.mjs --month 2026-08          # that month only
```

Each run writes two sets of PDFs over the same spans. **Weeks are whole,
Monday to Sunday**: the week of Mon 28 Sep - Sun 4 Oct is one PDF,
`weekly/2026-09-28.<fileid>.pdf`, with days from both months. A week with no
tracked days gets no PDF.

**This computer's own** - its timesheet alone:

- **Monthly** - `<tracking>/<month>.<fileid>.pdf`.
- **Weekly** - `<tracking>/weekly/<first day>.<fileid>.pdf`.

Its boxes put this computer's hours beside the project's: this computer, the
project's hours done of the cap, and what is left. Under every task sits a
line saying when it happened, on which computer and in which session -
`09:10-11:20 · studio · "fix checkout validation bug"`, or `studio · manual,
2h given` for hours logged by hand.

**Client** - the one to send. Every computer's timesheet found in the tracking
folder, merged into one: `<tracking>/client/<month>.pdf` and
`<tracking>/client/weekly/<first day>.pdf`. It shows **no names, no computers,
no sessions, no clock times, and nothing that reveals how many people worked**:
days are unioned and their hours summed, the same task of the same type on the
same day is one row with its time summed and bullets pooled (tagged **Partly
manual** when it pools manual with measured hours). It includes only the
timesheets in this checkout, so each computer commits and pushes its own after
its update, and the sender pulls before rendering. The terminal (never the
PDF) lists whose timesheets were merged and when each was last updated - relay
that, and flag anyone stale or not upgraded. A merged day over 12 hours prints
a note, since a reader may take it as more than one person; the hours are
never trimmed to hide it - tell the user and let them decide.

What every PDF shows:

- **The budget for its span.** A weekly PDF: hours done this week, remaining,
  and the week's total (`monthlyHours / 4`). A monthly PDF: hours done so far,
  remaining, and the month's total (`monthlyHours`). Over budget reads "Over
  budget by", never a negative. With no `monthlyHours`, the boxes are total,
  tracked days and average day.
- **Monthly PDFs: a week-by-week table** - every week touching the month,
  upcoming ones included with 0h done and their whole cap left. Each row counts
  its whole Monday-to-Sunday week, days in the next or previous month too, so
  it matches the budget; the rows need not add up to the month total, and a
  note under the table says so. The days below are then grouped under each
  week's heading with the month's share as subtotal, and a week that starts in
  the previous month notes how much of it is on that month's timesheet.
- **Tasks grouped by work type** within each day, in `categories` order, each
  type with its subtotal; under each task its outcome bullets and, for hours
  logged by hand, a **Manual** tag. Then **By type** and **By task** tables.
- **Unnamed time as "Research & exploration"** - typed Research, no bullets,
  hours counted. A PDF is never refused for an unnamed day; the report prints
  a note listing them (and, for the client PDF, whose they are), so they can
  be named with "update tracker" on that computer.

A routine update writes only the current week; finished weeks keep the PDF from
their last update. After correcting an older day, re-run with `--all-weeks` so
its week's PDF catches up. It needs a Chromium-based browser; if none is found,
say so - the markdown record is complete either way.

**The PDF is client-facing.** It shows the project, the span, the hour budget,
the days, the task names, their work types and Manual tags, their outcome
bullets and the hours - plus, on a computer's own PDF only, the computer's
name and each task's times and session. No person name and no email anywhere.
No measurement method, no idle cut-off, no multiplier, no timezone. Those are
the contractor's own settings and they stay in `config.json`. Never add a
footer or subtitle line explaining them. The one note a PDF carries is a
budget exception's `note`, written by the person (see **The hour budget**).

## Rules

- **Never move the boundary on your own.** `trackFrom` is the user's decision.
  Back-date it only when asked, and say what it will pull in.
- **Never put a person on the PDF.** No name, no email, no who-did-what, and on
  the client PDF nothing that counts heads - no computer, no session, no clock
  times - not in the header, the task names or the bullets.
- **Never name a day from another computer's commits.** The evidence is
  already only the commits made on this one (its reflog); do not widen it with
  a raw `git log`.
- **Never hand-write a day's hours.** They are recomputed from the transcripts
  on the next collect, so an edit to a total is lost work. Task names are the
  opposite: once a row is named, the engine keeps it. Manual hours go through
  `manual.mjs` and nothing else - never a hand-typed `· manual` row - so the
  row, the day total and the log move together.
- **The log is append-only.** Never rewrite or prune a `log.<fileid>.jsonl` to tidy it,
  and never add a line for a run that did not happen. An audit trail that is
  edited is not one.
- **The engine is generated.** Do not hand-edit `<engine>/*.mjs`; change the
  skill's templates and re-run setup instead.
- **The hooks are setup's, not yours.** Setup installs the three hooks; never
  add others, remove them, or wire naming or rendering to a hook or an
  automation on your own - naming needs a person's evidence read deliberately.
- **Never commit anything this skill writes.** No `git add`, no `git commit`,
  no `git push` - not for the month markdown, the PDF or the config, and not as
  a tidy-up at the end of an update. The engine itself only ever reads git
  (`git log -g`, for commit subjects as labelling evidence); the skill must hold
  the same line. Every change lands in the working tree and stays there.
- **When the user commits, the timesheet is ordinary.** It goes in with
  whatever else they are committing - no separate commit, no special handling.
  Staging it is their call, made by them, at a moment of their choosing.
