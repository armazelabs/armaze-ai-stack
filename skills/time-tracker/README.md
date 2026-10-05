# time-tracker

Track the hours you spend on a project without running a timer.

Claude Code already keeps a record of every session you work in. This skill
reads those records afterwards, works out how long you worked each day, names
the work from your git commits, and turns it into a timesheet and a PDF you can
send to a client.

Nothing runs in the background. The timesheet updates only when you ask.

## Install

```
aistack add time-tracker
```

Then, inside your project, tell Claude:

> set up time tracking

It asks two things the first time:

- **The hours multiplier.** `1` records exactly what was measured. `2` counts
  each measured hour as two, for work Claude's activity undercounts.
- **A name for this computer**, such as `laptop` or `studio`. You're asked once
  per computer.

Tracking counts from that day onward.

## Use it

Say **"update tracker"**. That one phrase does everything:

1. Measures your hours from Claude Code's session records.
2. Names each day's work from your commits and prompts, with a work type
   (Design, Development, Research…) and a few plain-language bullets on what
   was delivered.
3. Asks whether you did any work by hand, away from Claude Code, and adds it.
4. Writes this month's and this week's PDFs.

Other things you can say:

| Say | What happens |
| --- | --- |
| "update tracker" | Everything above |
| "log 2h of design yesterday" | Adds manual hours without a full update |
| "how many hours have I worked" | Shows the totals so far |
| "time tracking report for August" | Writes the PDF for another month |

## What you get

Everything lives in `project-management/tracking/`:

- **`2026-10.<you>.<computer>.md`**: your timesheet for the month. You can read
  and edit it like any document.
- **`2026-10.<you>.pdf`**: your month as a PDF, plus weekly ones in `weekly/`.
- **`client/2026-10.pdf`**: **the one to send.** Everyone's timesheets merged
  into one, with no names on it.

Each task on the PDF shows its type, its hours and what it delivered:

```
Checkout screens in Figma   DESIGN  MANUAL ........ 3h
  • Mobile and desktop checkout layouts
```

## Manual hours

Work done away from Claude Code, like a Figma session or a sketch on paper,
leaves no record to measure. Every update asks whether you have any. Describe
it in your own words ("about 3 hours in Figma yesterday on the checkout
screens"), check what Claude understood, and confirm.

Manual hours are recorded exactly as you give them and are tagged **Manual** on
every PDF, including the client one.

## Teams and several computers

- **Teams:** everyone keeps their own timesheet in the same folder. The client
  PDF adds them all together.
- **Several computers:** each computer keeps its own timesheet, so they never
  conflict in git. Your PDF adds them together, and an hour when Claude was
  running on two of your computers at once is counted only once.

After an update, commit and push the `tracking/` folder so teammates and your
other computers get it. Pull before making the client PDF.

## Good to know

- **It never commits for you.** Files stay in your working tree until you
  commit them.
- **Unnamed days block the PDF.** A client should never see "In progress", so
  run "update tracker" first.
- **Updating the tracker isn't billed.** Time spent asking for updates is left
  out of your hours.
- **It needs a Chromium browser for PDFs** (Chrome, Edge, Brave). Without one
  your hours are still recorded in the markdown.

For how it works in detail, see [`SKILL.md`](SKILL.md).
