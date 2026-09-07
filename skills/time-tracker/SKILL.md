---
name: time-tracker
description: >
  Time tracking with no timer and no switch, measured after the fact from
  Claude Code session transcripts and named from git commits. One command
  brings the timesheet fully up to date: remeasure the hours, name every
  unnamed day, re-render the PDF. Sets itself up in any project, in any
  language - no package.json or build tooling needed - inside
  <project-management>/tracking/. Use for "set up time tracking", "add a time
  tracker", "update tracker", "update tracking", "updatetracking", "how many
  hours have I worked", "label my time", "time tracking report", or the
  /time-tracker command.
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

## Pick the mode from what was asked

| The user wants | Mode |
| --- | --- |
| tracking set up here, installed, added | **Setup** |
| "update tracker", the timesheet current, hours + labels + PDF | **Update tracker** |
| hours so far, what's tracked, is it current | **Status** |
| the days named and nothing else | **Label** |
| a PDF for some other month | **Report** |

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

Then run, from the project root:

```
node <skill_dir>/scripts/setup.mjs --multiplier <their answer>
```

Omit the flag only if they explicitly want the default of 1. On a re-run, where
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
that already exists survives intact. Say what it migrated.

Tell the user tracking counts from today onward, and give them the phrase
**"update tracker"**.

## Update tracker

The one command. Triggered by "update tracker", "update tracking",
"updatetracking", "update my timesheet". Three steps, in order, all of them:

1. **Measure.** `node <engine>/collect.mjs` - rescan the transcripts, rewrite
   the month markdown, and build the work list.
2. **Name.** Read `references/labelling.md` and name **every** unnamed day,
   today included. Commits lead; prompts fill in the blocks that have none.
   Read `cache/<month>.pending.json` for this - it holds only the days that
   still need a name. Never read `raw.json` for a routine update: it is the
   whole month, and reading twenty settled days to name one is the cost this
   is here to avoid.
3. **Render.** `node <engine>/report.mjs` - write the PDF. Go straight here
   from step 2; **do not collect again to check the naming**. Today is still
   running, so a second collect finds the minutes that passed while you were
   labelling and opens a fresh `In progress` row for them - which blocks the
   render you are about to do.
4. **Record the run.**

   ```
   node <engine>/log.mjs record --named <the days you named> --session <session id>
   ```

   Comma-separate the days. This appends one line to `<tracking>/log.jsonl`
   saying what was named, which commits were consumed, and the month total -
   and moves the commit watermark that step 1 reads next time. Do it last, once
   the naming is actually on disk, so the log never claims work that was not
   done. Pass the session id from this session's transcript path if you have
   it; omit `--session` rather than inventing one.

Then report the days you named, the month total, and where the PDF landed. If no
Chromium-based browser is found the hours are still recorded and the markdown is
still complete - say so rather than treating it as a failure.

**Today gets named like any other day.** With nothing running in the background
there is no later pass to defer to, so a day left as `In progress` would just
stay that way and block the PDF. Later work on the same day arrives as a fresh
`In progress` row beneath the names you wrote; the next update names that too.
That is the design, not a mistake to chase.

## The log and the watermark

`<tracking>/log.jsonl` is one line per update: days named, commits consumed,
session, month total. It is an audit trail for a client-facing timesheet - and
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
node <engine>/report.mjs                # current month
node <engine>/report.mjs --last-month
node <engine>/report.mjs --month 2026-08
```

Writes a PDF next to the month markdown. It needs a Chromium-based browser; if
none is found, say so - the markdown record is complete either way.

**The PDF is client-facing.** It shows the project, the month, the days, the
task names and the hours - and nothing else. No measurement method, no idle
cut-off, no multiplier, no timezone. Those are the contractor's own settings and
they stay in `config.json`. Never add a footer or subtitle line explaining them.

**It refuses to render a month that still has an unnamed day**, and there is no
override. The fix is always to name the days first. Update tracker does that
then renders, so reach for this mode on its own for a *different* month.

## Rules

- **Never move the boundary on your own.** `trackFrom` is the user's decision.
  Back-date it only when asked, and say what it will pull in.
- **Never hand-write a day's hours.** They are recomputed from the transcripts
  on the next collect, so an edit to a total is lost work. Task names are the
  opposite: once a row is named, the engine keeps it.
- **The log is append-only.** Never rewrite or prune `log.jsonl` to tidy it,
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
