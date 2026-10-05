---
name: time-tracker
description: >
  Time tracking with no timer and no switch, measured after the fact from
  Claude Code session transcripts and named from the person's own git commits,
  with a work type (design, development, research...) and plain-language
  outcome bullets under every task, plus manual hours for work done away from
  Claude Code, tagged as manual. One timesheet per person per computer, so it
  works for teams and for one person on several computers. One command brings it fully up to date: remeasure the hours, name and
  type every unnamed day, ask about manual hours, re-render the monthly and
  weekly PDFs - personal ones, and one merged, anonymous client PDF for the
  whole team. Sets itself up in any project, in any language - no package.json or build tooling needed - inside
  <project-management>/tracking/. Use for "set up time tracking", "add a time
  tracker", "update tracker", "update tracking", "updatetracking", "how many
  hours have I worked", "label my time", "time tracking report", "log manual
  hours", "add 2h of design yesterday", or the /time-tracker command.
---

Time is measured after the fact, from the session transcripts Claude Code
already writes, and each day is named from the commits and prompts that landed
in it. There is no timer, no stopwatch and no on/off switch.

**Nothing here runs in the background.** No hook, no automatic collection. The
timesheet moves only when the user asks it to, which is what **Update tracker**
does. Between asks it sits still and slightly stale, and that is correct.

The one boundary is `trackFrom` in `<tracking>/config.json` - the day the
tracker was installed. Every day from then on counts; days before it are
ignored even though their transcripts exist.

**Every timesheet belongs to one person on one computer.** Setup registers
whoever runs it under `people` in `config.json`: an id slugged from
`git config user.name`, recognised by `git config user.email`. It also names
the computer, once, in `~/.claude/time-tracker/machine.json` - a short name
plus four random characters, like `studio-3f9a`. Together they make the
**file id**, `<person>.<computer>`, which suffixes every file the computer
writes - `<month>.<fileid>.md`, `log.<fileid>.jsonl`,
`activity/<month>.<fileid>.json`, `cache/<month>.<fileid>.pending.json` - so
neither teammates nor one person's two computers ever write the same file, and
nothing conflicts in git. Below, `<fileid>` means that suffix and `<id>` the
person alone. Hours come from this computer's own transcripts, and only
commits authored under the person's own emails are evidence. A second address
for the same person goes in their `emails` list by hand. If the engine says the
current email is not registered, or this computer has no name, run Setup - it
adds them without touching anyone else's files.

**A person's computers add up.** Each computer commits the stretches of time
it counted (`activity/`), and a collect leaves out any stretch another of the
same person's computers already counted, so an hour with Claude running on two
computers is billed once. Whoever recorded a stretch first keeps it; if both
did before pulling, the computer whose name sorts first keeps it. That only
ever comes out of unnamed time - on a day already named, the collector keeps
the rows as they are and prints a note naming the day, the minutes and the
other computer; relay it, since only the person can say which rows to trim.
The personal PDF merges all the person's computers. Teammates' time is never
subtracted - two people are two people.

## Pick the mode from what was asked

| The user wants | Mode |
| --- | --- |
| tracking set up here, installed, added | **Setup** |
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

**Ask about the multiplier first**, before running anything - but only on a
first install (no `<tracking>/config.json` yet). The multiplier scales measured
hours before they are recorded: `2` writes an hour of measured activity down as
two. Ask with AskUserQuestion, offering `1` (record exactly what is measured),
`1.5`, `2` (an hour of measured activity counts as two), and let them type their
own. Do not guess it and do not skip the question - it is the one setting nobody
can infer, and changing it later does not retroactively rescale days already
recorded.

**Name the computer** if it has no name yet - when
`~/.claude/time-tracker/machine.json` does not exist. Ask with AskUserQuestion,
"What should this computer be called?", offering the hostname slugged
(`hostname`, lowercased, `.local` dropped, anything but letters and digits
turned to `-`) first and letting them type their own (`studio`, `laptop`). It
is asked once per computer, for every project; never ask when the file exists.

Then run, from the project root:

```
node <skill_dir>/scripts/setup.mjs --multiplier <their answer> --machine <their name>
```

Without a name and without `--machine`, setup stops with exit code 2 and
prints the name it suggests - ask, then run it again. It also stops if the
checkout has no `git config user.name` or `user.email` and prints the commands
to set them; relay those. Omit the flag only if they
explicitly want the default of 1. On a re-run, where
`config.json` already exists, skip the question entirely - the file owns the
value, and `--multiplier` is ignored. To change it later, edit `hoursMultiplier`
in `<tracking>/config.json`.

`<skill_dir>` is the folder holding this file. The script is idempotent and does
all the file work: finding or creating the project-management folder, creating
`tracking/` inside it, syncing the engine, writing `config.json` with today as
`trackFrom`, writing a readme if absent, gitignoring the cache, and adding npm
scripts **only if** the project happens to have a `package.json`.

It never requires a manifest. A docs repo, a design repo, a Python or Go or Rust
project all set up the same way - the project's name is read from whatever
manifest exists and falls back to the folder name. Node is the only dependency,
and Claude Code ships with it. If the script reports something missing, report
that, but never treat "no package.json" as a reason to stop.

**Re-running setup migrates an older install.** It removes the SessionStart
hook, deletes `state.json`, prunes the engine files that are gone, and backfills
`trackFrom` from the earliest day the old switch ever tracked - so a timesheet
that already exists survives intact. An install from before per-person files
has one shared `<month>.md` and `log.jsonl`; the first person to re-run setup
has them renamed to their id. An install from before per-computer files has
`<month>.<id>.md` and `log.<id>.jsonl`; the first of the person's computers
to re-run setup takes them, renamed to its file id. A later computer finds
another computer's files already there and leaves the old ones alone - two
computers each claiming the same history would count it twice. So with
several computers: upgrade one, commit and push, then pull on the others
before running setup there. Say what it migrated.

When a teammate runs setup on a project that already has the tracker, they are
registered under their own id and start their own timesheet. Nobody's files are
claimed but the first person's, and only from a single-person install. The same
person on a new computer is already registered: setup only names the computer,
and its timesheet starts beside the others.

Tell the user tracking counts from today onward, and give them the phrase
**"update tracker"**.

## Update tracker

The one command. Triggered by "update tracker", "update tracking",
"updatetracking", "update my timesheet". Five steps, in order, all of them:

1. **Measure.** `node <engine>/collect.mjs` - rescan the transcripts, rewrite
   the month markdown, and build the work list.
2. **Name.** Read `references/labelling.md` and name **every** unnamed day,
   today included, giving each task a work type from `categories` in
   `config.json` and writing 2-4 plain-language outcome bullets under it.
   Commits lead; prompts fill in the blocks that have none. Read
   `cache/<month>.<fileid>.pending.json` for this - it holds only the days that
   still need work, each with its `needs`: `names`, `bullets` and `types` for
   an unnamed day; `bullets` or `types` alone for a day named before those
   existed, which keeps its names and gets what it lacks added. Never read `raw.json` for a
   routine update: it is the whole month, and reading twenty settled days to
   name one is the cost this is here to avoid.
3. **Manual hours.** Always ask - people forget work they did away from
   Claude Code, which is the point of asking every time. Follow **Log manual
   hours** below, opening with AskUserQuestion: "Any manual hours to add since
   the last update?", options **No** first, then **Yes, add some**. On No, go
   straight on. Note every date an entry lands on for the next step.
4. **Render.** `node <engine>/report.mjs` - write this month's PDF and this
   week's. When the current week began last month (an update on Thursday
   1 October, say), it also writes last month's PDF and last month's share of
   the week, so the final days of a month still reach a PDF - which means any
   of last month's days still unnamed (its own `pending.json`) must be named in
   step 2 too. If step 3 added hours to a day outside the current week, add
   `--all-weeks`; for a day in an earlier month, also run
   `node <engine>/report.mjs --month <that month> --all-weeks`. Go straight
   here from steps 2 and 3 - `manual.mjs` writes the month file itself;
   **do not collect again to check the naming**. Today is still
   running, so a second collect finds the minutes that passed while you were
   labelling and opens a fresh `In progress` row for them - which blocks the
   render you are about to do.
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

Then report the days you named, any manual hours added, the month total, where the PDFs landed - the
client PDF first, since it is the one that gets sent - and whose timesheets it
merged. If no
Chromium-based browser is found the hours are still recorded and the markdown is
still complete - say so rather than treating it as a failure.

**Time spent updating the tracker is not work.** The collector leaves out a
session that only asked for an update, and in a mixed session the stretch from
"update tracker" to the next unrelated prompt. Never write a task row for
timesheet work ("Timesheet update", "Hours recorded and named" or similar) -
the PDF drops such rows anyway, so one only makes the day's rows stop adding
up. Subagent time is counted at its actual length, without the multiplier,
wherever no main session covered it.

**Today gets named like any other day.** With nothing running in the background
there is no later pass to defer to, so a day left as `In progress` would just
stay that way and block the PDF. Later work on the same day arrives as a fresh
`In progress` row beneath the names you wrote; the next update names that too.
That is the design, not a mistake to chase.

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
   (resolve "yesterday", "Friday" against today in the config's timezone),
   type from `categories`, a task name, hours, and 1-3 outcome bullets. The
   description is the evidence: the bullets follow the same rules as in
   `references/labelling.md` - plain words, outcomes, nothing it does not
   say. Do not take hours from a guess. If a date, a length ("a few hours",
   "most of the afternoon") or a type is unclear, ask - AskUserQuestion with
   the likely readings as options.
3. **Confirm.** Show a table - date · type · task · hours · bullets - and
   ask with AskUserQuestion: **Looks right** / **Change something**. Write
   nothing until they confirm.
4. **Write each entry**, one call per entry:

   ```
   node <engine>/manual.mjs add --date <YYYY-MM-DD> --type <category> --task "<name>" --hours <h> \
     --bullet "<outcome>" [--bullet "<outcome>"] --note "<their description, verbatim>" [--session <id>]
   ```

   It refuses a day before `trackFrom`, a future day, a type not in
   `categories`, or a second manual row of the same name on that day - relay
   the reason and adjust with the person rather than working around it.
   Corrections go through the same tool: `set` (`--hours`, `--type`,
   `--rename`, `--bullet`) and `remove`, each with `--date` and `--task`, and
   a `--note` saying why. They find the row on whichever of the person's
   computers logged it. When that is another computer's file, the tool
   refuses while the file has uncommitted changes here - tell the person to
   pull first - and after the edit, tell them to commit and push it before
   that computer collects again.
5. **Render.** Inside an update, step 4 does it. On its own, run the command
   `manual.mjs` prints - `report.mjs`, with `--month <M> --all-weeks` when the
   day is outside the current week. A day elsewhere in the month may still be
   unnamed and block the month PDF; say so rather than naming it unasked.

Manual hours are recorded exactly as given: the multiplier never applies, and
nothing checks them against measured time - the person's word is the record.
They show as `<Type> · manual` in the month file and carry a **Manual** tag on
both PDFs, client one included. No collect ever trims or regrows them.

## The log and the watermark

`<tracking>/log.<fileid>.jsonl` is one line per update: days named, commits consumed,
session, month total - and one line, `"kind": "manual"`, per manual entry added,
changed or removed, with the person's own description as its `note`. It is an audit trail for a client-facing timesheet - and
the last line's `throughCommit` is the watermark the next run reads, so there is
no separate state file.

**The watermark narrows reading, never naming.** `pending.json` is built from
which days still carry a placeholder, not from which commits are new, because a
day can hold six hours and no commits at all - most work is uncommitted at the
moment it is measured. A commit-driven work list would silently drop those days
and then block the PDF. Never reach for the log to decide what to skip.

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
node <engine>/report.mjs --all-weeks              # this month + every week in it
node <engine>/report.mjs --last-month --all-weeks
node <engine>/report.mjs --month 2026-08          # that month only
```

Each run writes two sets of PDFs over the same ranges.

**Personal**, one person's own timesheet - every one of their computers merged
the way the client PDF merges people (the same task of the same type on the
same day is one row). A day still unnamed on another of their computers blocks
it, naming the day and the computer: only that computer has the transcripts to
name it, so the fix is "update tracker" there, then commit, push and pull. The
terminal lists each computer's timesheet and when it was last updated:

- **Monthly** - `<tracking>/<month>.<id>.pdf`, the whole month.
- **Weekly** - `<tracking>/weekly/<month>/<first day>.<id>.pdf`. Weeks run
  Monday to Sunday and are **split at the month's edge**: Mon 28 Sep - Sun 4 Oct
  is `weekly/2026-09/2026-09-28` (28-30 Sep) and `weekly/2026-10/2026-10-01`
  (1-4 Oct). So a month's weekly PDFs always add up to exactly its monthly one.
  A week with no tracked days gets no PDF.

Every PDF shows each task's work type and, for hours logged by hand, a
**Manual** tag after its name, and a **By type** table - time per type and
how much of it was manual - above the By task one.

**Client** - the one to send. Every person's timesheet found in the tracking
folder, merged into one: `<tracking>/client/<month>.pdf` and
`<tracking>/client/weekly/<month>/<first day>.pdf`. It looks exactly like a
personal PDF and shows **no names and nothing that reveals how many people
worked**: days are unioned and their hours summed, the same task of the same
type on the same day is one row with its time summed and bullets pooled
(tagged **Partly manual** when it pools manual with measured hours), and tasks are ordered
by time, not by person. It includes only the timesheets in this checkout, so
teammates commit and push theirs after their own update, and the sender pulls
before rendering. The terminal (never the PDF) lists whose timesheets were
merged and when each was last updated - relay that, and flag anyone stale. A
teammate's unnamed day blocks the client PDF for its range and is reported by
name: only they can name it, from their own evidence, and leaving their hours
out would under-bill silently. A merged day over 12 hours prints a note, since
a reader may take it as more than one person; the hours are never trimmed to
hide it - tell the user and let them decide.

A routine update writes only the current week; finished weeks keep the PDF from
their last update. After correcting an older day, re-run with `--all-weeks` so
its week's PDF catches up. It needs a Chromium-based browser; if none is found,
say so - the markdown record is complete either way.

**The PDF is client-facing.** It shows the project, the month, the days, the
task names, their work types and Manual tags, their outcome bullets and the
hours - and nothing else. No person
name and no email: who the timesheet belongs to shows only in its file name.
No measurement method, no idle cut-off, no multiplier, no timezone. Those are the contractor's own settings and
they stay in `config.json`. Never add a footer or subtitle line explaining them.

**It refuses to render a PDF whose range still has an unnamed day**, and there is
no override. Each PDF is judged on its own days, so an unnamed day in one week
blocks that week and the month but not the other weeks. A named task without
bullets or without a type only warns - an old month still renders. The fix is always to name the
days first. Update tracker does that
then renders, so reach for this mode on its own for a *different* month.

## Rules

- **Never move the boundary on your own.** `trackFrom` is the user's decision.
  Back-date it only when asked, and say what it will pull in.
- **Never put a person on the PDF.** No name, no email, no who-did-what, and on
  the client PDF nothing that counts heads - not in the header, the task names
  or the bullets. The emails in `config.json` exist
  to pick the person and filter commits, nothing else.
- **Never name a day from someone else's commits.** The evidence is already
  filtered to the person's own; do not widen it with a raw `git log`.
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
- **Never wire this to a hook or an automation on your own.** It runs when
  asked, and putting it back in the background undoes the point of the design.
- **Never commit anything this skill writes.** No `git add`, no `git commit`,
  no `git push` - not for the month markdown, the PDF or the config, and not as
  a tidy-up at the end of an update. The engine itself only ever reads git
  (`git log`, for commit subjects as labelling evidence); the skill must hold
  the same line. Every change lands in the working tree and stays there.
- **When the user commits, the timesheet is ordinary.** It goes in with
  whatever else they are committing - no separate commit, no special handling.
  Staging it is their call, made by them, at a moment of their choosing.
