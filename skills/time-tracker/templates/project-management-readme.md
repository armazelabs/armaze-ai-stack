# Time tracking

How much time went into {{PROJECT_NAME}}, on which days, and on what.

Hours are measured from Claude Code's own session transcripts, which record a
timestamp for every event. Nothing has to be started, stopped or remembered.

Tracking begins on the `startDate` in `config.json`, currently
**{{START_DATE}}**.

## Files

| File            | What it is                                       |
| --------------- | ------------------------------------------------- |
| `<YYYY-MM>.md`  | The month's timesheet. Edit this one.              |
| `<YYYY-MM>.pdf` | The month's report, if generated.                  |
| `config.json`   | Start date, timezone, idle gap, hours multiplier, working days. |
| `cache/`        | Scratch, including the labelling evidence. Gitignored. |

The month file is the whole record: a heading per day with its total, and a
table splitting that total across what was worked on. Nothing else to keep in
step.

## Commands

```
node lib/time-tracking/collect.mts                     # rescan transcripts, update the month file
node lib/time-tracking/report.mts                       # PDF for the current month
node lib/time-tracking/report.mts --month {{START_DATE_MONTH}}   # PDF for a specific month
node lib/time-tracking/report.mts --last-month           # PDF for the month just ended
```

If `time:collect` / `time:report` scripts were added to `package.json`, run
those instead through your package manager. Both are safe to run as often as
you like. `collect` recomputes everything from scratch and only writes when
something actually changed.

## How the hours are counted

- Events closer together than **{{IDLE_GAP_MINUTES}} minutes** are one
  continuous block of work. A longer gap ends the block, and the gap itself is
  not counted.
- A block never spans midnight, so every block belongs to one day.
- Only the configured `workdays` count; the rest are dropped entirely.
- Times are local to `{{TIMEZONE}}`; transcripts store UTC and are converted.
- Blocks under a minute are discarded as noise.
- The last event of a block contributes no trailing time, so the total
  **under-reports slightly rather than over-reporting**. That is deliberate.
- Once measured, the total is scaled by `hoursMultiplier` (currently
  **{{HOURS_MULTIPLIER}}**) before being recorded.

Change any of this in `config.json`.

## Working across machines

Transcripts are local to the computer that produced them, so each machine can
only measure its own days. A rebuild replaces the days it has evidence for and
leaves every other day untouched - so a day worked on another computer arrives
through git and stays put, rather than being read as a day off.

Commit and push from one machine, pull on the next, and the timesheet is whole.

## Automation

The `time-tracker` agent runs the collector, names any unlabelled days from the
prompts and commits of that day, and commits `project-management/` locally. It
never pushes and never stages code.

There is no automation configured yet. Orca's scheduler is per machine, so run
these once on each computer this project is worked from, adjusting the time and
timezone to taste:

```
orca automations create --name "{{AUTOMATION_SLUG}}-time-daily" \
  --trigger weekdays --time 23:30 --timezone {{TIMEZONE}} \
  --provider claude --workspace path:{{PROJECT_PATH}} \
  --prompt "TIME-TRACKER-AUTOMATION - use the time-tracker agent to label this month's unlabelled days and commit"

orca automations create --name "{{AUTOMATION_SLUG}}-time-monthly" \
  --trigger "0 9 1 * *" --timezone {{TIMEZONE}} \
  --provider claude --workspace path:{{PROJECT_PATH}} \
  --prompt "TIME-TRACKER-AUTOMATION - use the time-tracker agent to finish last month, then run node lib/time-tracking/report.mts --last-month"
```

`orca automations list` shows what is registered; `orca automations run <name>`
forces one immediately.

### While Claude is being used

`.claude/settings.json` wires `lib/time-tracking/session-start.mts` to the
`SessionStart` hook: it collects, then tells the session which days still carry
a placeholder so it can name them - today included, not just a finished day the
schedule missed. It never commits; the month file is simply left current in the
working tree. Naming, unlike measuring, needs to read what was worked on, so it
still happens only at session start or on the scheduled run.

### Why the prompts start with that marker

The scheduled run is itself a Claude session in this project, so without a
marker it would bill its own runtime as work. `collect` skips any session whose
prompt begins with the `sentinel` in `config.json`. **Keep that prefix on both
prompts.** Merely mentioning the marker in conversation is harmless - only a
prompt that starts with it is excluded.

## Correcting the record

Edit `<YYYY-MM>.md` directly. Rename a task, split one into two, reword anything.
Two rules:

1. The task times in a day must add up to that day's heading.
2. Leave the day headings alone - those are measured, not written.

Anything not named `In progress` or `Unlabelled` is treated as yours and is never
overwritten. To have a day relabelled from scratch, set its single task back to
`Unlabelled`.

Two placeholder names appear before a day is named:

- **`In progress`** on today only. It appears once more than the idle gap of
  work sits past the last labelling - anything shorter is folded into the task
  it continues. The session-start hook flags it and the nightly run clears it,
  so it is named like any other day rather than left to sit.
- **`Unlabelled`** on a finished day nobody has named yet. Same treatment: the
  session-start hook flags it to the next session that opens, and the nightly
  run clears it.

## When a day's evidence expires

Hours are measured from transcripts, and Claude Code deletes those after
`cleanupPeriodDays` (30 by default). A rebuild after that reads the day as a few
stray minutes. The rebuild step therefore refuses to shrink a day that carries
named work, keeping what is on record and printing a warning instead:

```
Warning: 2026-08-27 measures 3m but the timesheet records 6h 7m against named
work. Keeping the recorded day - its transcripts have most likely expired.
```

A warning means the day is safe but can no longer be re-derived - the markdown
is now its only record. Seeing one for a recent day means transcripts are being
cleaned up faster than days are being labelled; raise `cleanupPeriodDays` in
`~/.claude/settings.json`.
