# Time Tracker

Keeps a project's timesheet without a timer: it measures hours from Claude Code's session records, names the work from commits, and writes client-ready weekly and monthly PDFs. Prompts stop once the hours budget is spent.

## When to Use This Skill

- Billing a client by the hour without running a timer
- Keeping a team inside a monthly hours budget
- Sending a weekly or monthly timesheet PDF with an invoice
- Counting work done away from Claude Code (Figma, paper, a call)
- Adding up hours across several computers or teammates
- Moving a project to a new version after `aistack update`

## What This Skill Does

1. **Measures Hours Afterwards**: Reads Claude Code's session records; no timer or switch
2. **Names the Work**: A type and plain bullets per task, from commits and prompts
3. **Adds Manual Hours**: Asks at each update about work away from Claude Code
4. **Holds the Budget**: Weekly and daily shares of the monthly hours; stops prompts past them
5. **Writes Client PDFs**: This week's and month's, every computer merged, no names
6. **Checks Itself**: "check time tracker" tests the setup and fixes what it can

## How to Use

### Basic Usage

In Claude Code, in a project that has it set up:

```
update tracker
```

That one phrase does everything: it measures your hours, names each day's work, asks whether you did any work by hand, and writes this month's and this week's PDFs.

### Set It Up

In your project's folder, in the terminal:

```
aistack add time-tracker
```

Then in Claude Code say `set up time tracking` and answer two questions: the project's monthly hours and a name for this computer. The full steps are under **New Setup** below.

### Log Manual Hours

```
log 2h in Figma yesterday
```

### Check It Works

```
check time tracker
```

### After a New Version

Run `aistack update` in the terminal, then say `update time tracker setup` in Claude Code. See **Updating to a New Version** below.

### Other Things You Can Say

| Say | What happens |
| --- | --- |
| "update tracker" | Everything: measure, name, manual hours, PDFs |
| "check time tracker" | Checks everything works, and fixes what it can |
| "update time tracker setup" | After `aistack update`: moves the project to the new version |
| "log 2h in Figma yesterday" | Adds manual hours without a full update |
| "how many hours have I worked" | Shows the totals so far |
| "label my time" | Names the days and nothing else |
| "time tracking report for August" | Writes the PDF for another month |

The `/time-tracker` command works too.

## Example

**User**: "update tracker"

**Claude** measures the hours, names Monday's work from its commits and prompts, then asks: "Any manual hours to add since the last update?"

**User**: "Yes - about an hour this morning comparing payment providers, on paper."

**Claude** shows the entry before writing anything:

```
Date        Task                          Given   Recorded
2026-10-05  Payment provider comparison   1h      1h 30m
```

**User**: "Looks right"

**Result**: Claude reports that Mon 5 Oct is named (Checkout form validation and two more tasks), the manual entry is added as Research, today stands at 7h 15m of 8h, this week at 7h 15m of 40h and October at 19h 45m of 160h. The PDFs are in `project-management/tracking/reports/2026-10.pdf` and `reports/weekly/2026-10-05.pdf`, merged from the timesheets of `laptop-7c2e` and `studio-3f9a`.

## Tips

- Run "update tracker" before sending a PDF; unnamed time shows as "Research & exploration"
- It never commits: commit and push `project-management/tracking/`, and pull before PDFs
- Move every computer on a project to a new version on the same day
- Updates and checks aren't billed, and work even when your hours run out
- PDFs need a Chromium browser (Chrome, Edge, Brave); hours are recorded without one
- A merged day over 12 hours gets a terminal note; hours are never trimmed

## Related Use Cases

- `sync-repo`: the client's copy of the repo never gets the tracker. `project-management/` is left out, and its `package.json` keeps no `time:*` scripts.
- Projects started with `aistack init`, which keep their own Claude login in `.claude-local/`: the tracker reads sessions from there as well as from `~/.claude`.
- Sending a client a weekly or monthly timesheet with an invoice
- Keeping a team inside a fixed monthly retainer

## New Setup

1. In your project's folder, in the terminal, run `aistack add time-tracker`.
2. Open Claude Code in that project and say **"set up time tracking"**.
3. Answer two questions:
   - **The project's hours per month**, such as `160`. The whole team shares them, and a week gets a quarter: 160 a month is 40 a week.
   - **A name for this computer**, such as `laptop` or `studio`. You're asked once per computer, for every project; it is kept in `~/.claude/time-tracker/machine.json` with four random characters added (like `studio-3f9a`), and the timesheet is filed under it. No git name or email is needed.
4. It checks itself when it's done. You should see a list of ✔ lines ending in **"All good - time tracking is working."**
5. Commit `.claude/settings.json` and the `project-management/tracking/` folder, so teammates get the same setup.

Tracking counts from the day of setup onward, and the session checks start with your next Claude Code session. It sets up the same way in any project, in any language: Node is the only thing it needs, and Claude Code ships with it. On a new computer for a project that already has the tracker, it usually only asks what to call the computer.

## Updating to a New Version

1. In your project's folder, in the terminal, run `aistack update`. That pulls the latest version and refreshes this project's copy of the skill.
2. Open Claude Code in the project and say **"update time tracker setup"**. It moves the project to the new version and checks everything. If the new version needs something it doesn't know yet, like the project's monthly hours, it asks.
3. Look for **"All good - time tracking is working."** at the end.
4. Commit what changed (`.claude/settings.json` and the `tracking/` folder) so teammates get it too. Each teammate runs steps 1-3 on their own computer, **the same day**.

Do this once in every project that uses time-tracker.

## What the Check Covers

"check time tracker" checks that:

- the project has the newest version,
- the monthly hours and multipliers are set, and this computer is named and its timesheet on the current file names,
- the session hooks are installed and actually run,
- hours can be measured, the budget shows, and a browser for PDFs is found.

Anything it can fix, it fixes on the spot; anything it can't, it explains. If it needs an answer first (the monthly hours, or this computer's name), it asks. Run in a project without the tracker, it installs it.

## What You Get

Everything lives in `project-management/tracking/`:

| File | What it is |
| --- | --- |
| `reports/2026-10.pdf` | The month's PDF: **the one to read and send.** Every computer's timesheet merged into one, with no names, computers or sessions on it. |
| `reports/weekly/2026-10-05.pdf` | One PDF per whole week, named by its Monday (this one is 5-11 October) |
| `computers/<computer>/2026-10.md` | Each computer's timesheet for the month, with each task's clock times and sessions |
| `computers/<computer>/log.jsonl` | That computer's log: one line per update and per manual entry. It is an audit trail, never edited. |
| `config.json` | The settings (see **Settings** below) |
| `engine/` | The scripts the hooks run. Generated by setup; don't edit them. |

Setup also adds three session hooks to `.claude/settings.json`, keeping any hooks the project already has, and `time:collect` / `time:report` scripts to `package.json` only if the project has one.

You can read a timesheet like any document and correct its task names, types and bullets. Its hours are re-measured every time, so an edited total is lost; change manual rows by asking Claude ("that Friday sketch was 2h, not 1.5h").

Every PDF opens with the hour budget for its span. For a week: hours done this week, remaining, and the week's total. For a month: hours done so far, remaining, and the month's total. A monthly PDF then has a week-by-week table (each row counts its whole Monday-to-Sunday week, so the rows need not add up to the month) and the days grouped under each week. Each weekday shows its cap after its total (`6h of 8h`). Within a day, tasks are grouped by type, each with its hours and what it delivered:

```
WEEK 2 · 5 - 11 OCT ............................... 26h 30m
Mon 5 Oct ......................................... 7h 15m
  DEVELOPMENT                                       4h 45m
    Checkout form validation ...................... 3h 15m
      • Every checkout field shows a clear error before payment
      • Card number and postcode are checked as they are typed
  RESEARCH                                          2h 30m
    Payment provider comparison  MANUAL ........... 1h 30m
    Research & exploration ........................ 1h
```

A PDF never shows clock times, sessions, multipliers or anything that counts heads.

## The Hour Budget

- **Session start:** your hours are re-measured and you see how much of today, this week and this month is used and left.
- **Session end:** your hours are re-measured, so the timesheet stays current.
- **Every prompt:** if today, this week or this month is used up, the prompt is stopped until the next day (or week, or month). Tracker requests ("update tracker", "check time tracker", "log manual hours", "update time tracker setup") still work.
- **Need to work anyway?** Start Claude Code with `TIME_TRACKER_OVERRIDE=1`.
- **Hours past the limit are never hidden.** If a session runs over before it's stopped, the real hours are recorded and you get a warning.

Weeks run Monday to Sunday. The month is a hard ceiling too, so in a month with five weeks the last one gets whatever is left. Monday to Friday each get the same fifth of the week; a short day does not make the next one longer. Weekends have no day cap, only the week's. Manual hours are held to the week and month, not the day.

For a stretch of days with different hours, ask Claude for a budget exception: it sets the week's and month's hours for those dates, and your note, in your own words, is printed on the PDFs that cover them.

## Manual Hours

Work done away from Claude Code, like a Figma session or a sketch on paper, leaves no record to measure. Every update asks whether you have any. Describe it in your own words ("about 3 hours in Figma yesterday on the checkout screens"), check what Claude understood, and confirm.

Manual hours are always **Research**, and count like measured hours: what you give times the hours multiplier in force that day (2h given at 1.5× is recorded as 3h; the timesheet keeps both). They're tagged **Manual** on every PDF, including the client one. They count toward the budget: an entry that would go over the week or month is refused, and you're told how much is left. A day before tracking began, or in the future, is refused too.

## Teams and Several Computers

- **One timesheet per computer.** Each computer keeps its own in its own folder under `computers/`, so they never conflict in git. The PDFs add them all together.
- **Every computer counts in full.** Two computers working at the same time are two lots of hours.
- **Shared budget:** the monthly hours are for the whole project. Your copy only counts the hours other computers have pushed, so pull often.
- **Only this computer's commits name its days.** No computer names another's time.

## Settings

`project-management/tracking/config.json` holds:

- `monthlyHours`: the project's hours per month, shared by the team.
- `hoursMultiplier` (**1.5**) and `subagentMultiplier` (**1.2**): measured hours count at 1.5×, and time a subagent works on its own at 1.2×. A change counts from the start of the day you make it, and earlier days keep the multipliers they were recorded at. To backdate one, edit its date in `multiplierHistory`.
- `dailyHours`: a fixed weekday cap in place of a fifth of the week (`null` keeps the fifth).
- `trackFrom`: the first day that counts, the day of setup. Back-date it to count earlier work.
- `categories`: the work types tasks are given.
- `budgetExceptions`: the stretches with different hours, added when you ask.

For how it works in detail, see [`SKILL.md`](SKILL.md).
