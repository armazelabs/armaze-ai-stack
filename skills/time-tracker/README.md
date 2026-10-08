# time-tracker

Track the hours you spend on a project without running a timer.

Claude Code already keeps a record of every session you work in. This skill
reads those records afterwards, works out how long you worked each day, names
the work from your git commits, and turns it into a timesheet and a PDF you can
send to a client.

Each project has a monthly hours budget, a quarter of it per week. Every
Claude Code session checks in when it starts and ends, and once the week's or
month's hours are used up, new prompts are stopped.

## New setup

1. In your project's folder, in the terminal:

   ```
   aistack add time-tracker
   ```

2. Open Claude Code in that project and say:

   > set up time tracking

3. Answer two questions:

   - **The project's hours per month**, such as `160`. The whole team shares
     them, and a week gets a quarter: 160 a month is 40 a week.
   - **A name for this computer**, such as `laptop` or `studio`. You're asked
     once per computer.

4. It checks itself when it's done. You should see a list of ✔ lines ending in
   **"All good - time tracking is working."**
5. Commit `.claude/settings.json` and the `project-management/tracking/`
   folder, so teammates get the same setup.

Measured hours count at **1.5×**, and time a subagent works on its own at
**1.2×**. Both can be changed in `config.json`. Tracking counts from that day
onward. The session checks start with your next Claude Code session.

## Updating to a new version

When a new version of time-tracker comes out:

1. In your project's folder, in the terminal:

   ```
   aistack update
   ```

   That pulls the latest version and refreshes this project's copy of the
   skill.

2. Open Claude Code in the project and say:

   > update time tracker setup

   It updates the project to the new version and checks everything. If the
   new version needs something it doesn't know yet, like the project's monthly
   hours, it asks.

3. Look for **"All good - time tracking is working."** at the end.
4. Commit what changed (`.claude/settings.json` and the `tracking/` folder) so
   teammates get it too. Each teammate runs steps 1-3 on their own computer.

Do this once in every project that uses time-tracker.

## Is it working?

Say **"check time tracker"** any time. It checks that:

- the project has the newest version,
- the monthly hours and multipliers are set, and you and this computer are
  registered,
- the session hooks are installed and actually run,
- hours can be measured, the budget shows, and a browser for PDFs is found.

Anything it can fix, it fixes on the spot; anything it can't, it explains.
Checking doesn't count as work time, and it works even when your hours have run
out.

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
| "check time tracker" | Checks everything works, and fixes what it can |
| "update time tracker setup" | After `aistack update`: moves the project to the new version |
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

## The hour budget

- **Session start:** your hours are re-measured and you see how much of this
  week and this month is used and left.
- **Session end:** your hours are re-measured, so the timesheet stays current.
- **Every prompt:** if this week or this month is used up, the prompt is
  stopped until the next week (or month). "update tracker" and "check time
  tracker" still work.
- **Need to work anyway?** Start Claude Code with `TIME_TRACKER_OVERRIDE=1`.
- **Hours past the limit are never hidden.** If a session runs over before it's
  stopped, the real hours are recorded and you get a warning.

Weeks run Monday to Sunday. The month is a hard ceiling too, so in a month with
five weeks the last one gets whatever is left.

## Manual hours

Work done away from Claude Code, like a Figma session or a sketch on paper,
leaves no record to measure. Every update asks whether you have any. Describe
it in your own words ("about 3 hours in Figma yesterday on the checkout
screens"), check what Claude understood, and confirm.

Manual hours are recorded exactly as you give them and are tagged **Manual** on
every PDF, including the client one. They count toward the budget: an entry
that would go over the week or month is refused, and you're told how much is
left.

## Teams and several computers

- **Teams:** everyone keeps their own timesheet in the same folder. The client
  PDF adds them all together.
- **Shared budget:** the monthly hours are for the whole team. Your copy only
  counts teammates' hours they've pushed, so pull often.
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
