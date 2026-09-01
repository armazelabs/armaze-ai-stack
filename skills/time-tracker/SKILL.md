---
name: time-tracker
description: >
  Sets up automatic time tracking - measured from Claude Code session
  transcripts, no starting or stopping a timer - on a Node/npm project: the
  engine library, a time-tracker labelling agent, a SessionStart hook, a
  project rule, and a project-management/ folder, then runs the first
  collection so it starts working immediately. Idempotent - re-running syncs
  the engine and leaves project-owned files alone. Use when asked to "set up
  time tracking", "add a time tracker to this project", "install time
  tracking", "track my hours on this project", or the /time-tracker command.
---

Sets up a transcript-based time-tracking system - a measurement engine at
`lib/time-tracking/`, a labelling agent at `.claude/agents/time-tracker.md`, a
project rule at `rules/time-tracking.md` and a `project-management/` folder -
in whatever project you're run from.

## Scope

This targets Node/npm-family projects: it writes `.mts` source that Node runs
directly, and needs a `package.json` at the target root. If the current
directory has no `package.json`, say so and stop rather than guessing at a
different setup.

## What it sets up

- `lib/time-tracking/*.mts` - the measurement engine (pure logic, a transcript
  collector, a PDF reporter, the SessionStart hook script). Copied verbatim;
  never hand-edited afterwards.
- `.claude/agents/time-tracker.md` - the agent that names each day's work from
  transcript evidence and commits `project-management/`.
- `project-management/config.json` and `readme.md` - per-project settings
  (timezone, start date, idle-gap, hours multiplier, working days) and docs.
- `rules/time-tracking.md` - the project rule this system depends on (hours are
  generated, only task labels are hand-written).
- A `SessionStart` hook wired into `.claude/settings.json`, merged in without
  disturbing any hooks already there.
- `time:collect` / `time:report` scripts added to `package.json` if those keys
  are free.
- `project-management/cache/` added to `.gitignore`.

## Procedure

1. Resolve this skill's own directory (the folder containing this file) and
   run its setup script from the target project's root:

   ```
   node <skill_dir>/scripts/setup.mjs
   ```

   The script is idempotent and does the actual file work - detecting the
   package manager, project name and timezone; copying and merging every file
   above; and finally running `node lib/time-tracking/collect.mts` once so
   today's session is already being measured by the time you report back.

2. Read the script's output. It states, for every file, whether it was
   created/synced or already existed and was left alone, whether the hook was
   newly wired, the result of the first collection, and - filled in with the
   detected project name, path and timezone - the two `orca automations
   create` commands for daily labelling and the monthly report.

## Report back

Tell the user, in your own words from the script's output:

- What was newly created vs. already present (a re-run on an already set-up
  project is expected to report everything as "already existed" except the
  always-synced engine files).
- Whether the `SessionStart` hook was newly wired.
- The first collection's result - hours found for today's session, if any, or
  a plain statement that no transcripts were found yet.
- Any warning the script surfaced (most likely: the local Node version can't
  run `.mts` files directly, with its suggested fix).
- The two `orca automations create` commands, verbatim, for the user to run
  themselves, once per machine this project is worked from - never run these
  for them.

If the script exited early because there's no `package.json`, say that plainly
and don't attempt a workaround.
