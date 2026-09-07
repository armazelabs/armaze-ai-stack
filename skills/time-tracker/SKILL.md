---
name: time-tracker
description: >
  Time tracking that you switch on and off, measured from Claude Code session
  transcripts rather than a timer. Sets itself up in any project, in any
  language - no package.json or build tooling needed - inside
  <project-management>/tracking/. Use for "set up time tracking", "add a time
  tracker", "start tracking time", "stop tracking", "how many hours have I
  worked", "label my time", "updatetracking", "update tracking", "time tracking
  report", or the /time-tracker command.
---

Time is measured after the fact, from the session transcripts Claude Code
already writes. There is no timer to start and no stopwatch running - but
nothing is counted until the user turns tracking on, and it deals in whole
dates: starting today counts today in full, morning included.

## Pick the mode from what was asked

| The user wants | Mode |
| --- | --- |
| tracking set up here, installed, added | **Setup** |
| to start / resume counting | **Start** |
| to stop / pause counting | **Stop** |
| hours so far, is it on, what's tracked | **Status** |
| "updatetracking", the file brought fully up to date | **Update tracking** |
| the days named, "what did I work on" | **Label** |
| a PDF, an invoice-ready month | **Report** |

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
`tracking/` inside it, syncing the engine, writing `config.json` and a readme if
they are absent, gitignoring the cache, wiring the SessionStart hook, and adding
npm scripts **only if** the project happens to have a `package.json`.

It never requires a manifest. A docs repo, a design repo, a Python or Go or Rust
project all set up the same way - the project's name is read from whatever
manifest exists and falls back to the folder name. Node is the only dependency,
and Claude Code ships with it. If the script reports something missing, report
that, but never treat "no package.json" as a reason to stop.

Setup leaves tracking **off**. Say so, and give the start command.

## Start

```
node <engine>/track.mjs start
```

Opens a range at today's date and runs a first collection. Tell the user
tracking is on, and that today counts in full.

## Stop

```
node <engine>/track.mjs stop
```

Collects one last time and closes the range at today's date. Today still counts.

The engine will report that no PDF was written, because today is still holding
its `In progress` placeholder. That is expected - **finish the job before
reporting back**:

1. **Name today.** Read `references/labelling.md` and run the labelling pass
   over today. Stopping is the moment `In progress` stops being true.
2. **Render the PDF**: `node <engine>/report.mjs`.

Then tell the user the last counted day, what you named it, and where the PDF
landed. If no Chromium-based browser is found the hours are still recorded and
the markdown is still complete - say so rather than treating it as a failed
stop.

## Status

```
node <engine>/track.mjs status
```

Reports on/off, the tracked ranges, this month's total, today's total, and any
day still needing a name. Relay it plainly - do not go and label things unless
the user asked.

## Update tracking

The one command that leaves the timesheet fully current, without stopping the
clock. Triggered by "updatetracking", "update tracking", "update my timesheet".

1. `node <engine>/collect.mjs` - remeasure and rewrite the month.
2. **Name every unnamed day**, today included, per `references/labelling.md`.
   Unlike the SessionStart pass, this one does name today: the user asked for a
   current file, and a placeholder is not that. Later work will arrive as a new
   `In progress` row, which is correct and not a problem to chase.
3. `node <engine>/report.mjs` - render the PDF.

Report which days you named and where the PDF landed. Tracking stays **on** -
this mode never touches the switch.

## Label

Read `references/labelling.md` and follow it.

**A finished day is named without being asked.** Its evidence is complete and
will not change, the timesheet is client-facing, and leaving it blank is an
omission rather than a courtesy. The SessionStart hook asks for exactly these
days by date; do them, say briefly which ones you named, and carry on with what
the user actually asked for.

**Today is not.** `In progress` is still growing, so naming it now only gets
rewritten later. Today gets named on **Stop**, on **Update tracking**, or when
the user asks - never mid-task on a hook message.

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
cut-off, no multiplier, no timezone, no which-days-count. Those are the
contractor's own settings and they stay in `config.json`. Never add a footer or
subtitle line explaining them.

**It refuses to render a month that still has an unnamed day**, and there is no
override. The PDF is what a client sees, so `In progress` must never appear on
it - the fix is always to name the days first. Stop and Update tracking both do
that then render, so reach for this mode on its own for a *different* month.

## Rules

- **Never turn tracking on or off on your own.** Start and stop are the user's
  decisions, in both directions.
- **Never hand-write a day's hours.** They are recomputed from the transcripts
  on the next collect, so an edit to a total is lost work. Task names are the
  opposite: once a row is named, the engine keeps it.
- **The engine is generated.** Do not hand-edit `<engine>/*.mjs`; change the
  skill's templates and re-run setup instead.
- **Never commit anything this skill writes.** No `git add`, no `git commit`,
  no `git push` - not for the month markdown, the PDF, the state file or the
  config, and not as a tidy-up at the end of a labelling or stop run. The
  engine itself only ever reads git (`git log`, for commit subjects as
  labelling evidence); the skill must hold the same line. Every change lands in
  the working tree and stays there.
- **When the user commits, the timesheet is ordinary.** It goes in with
  whatever else they are committing - no separate commit, no special handling,
  no reason to keep it out of a commit that touches code. Staging it is their
  call, made by them, at a moment of their choosing.
