# Naming the days

The arithmetic is not your job - the collector measures the hours. Your job is
to say **what the work was**, using only evidence.

## What the files mean

- `<tracking>/<month>.md` - the record. Human-readable, hand-correctable, and
  the input to the PDF. This is the only file you edit, and within it only the
  task rows.
- `<tracking>/cache/<month>.raw.json` - your evidence: every block with the
  prompts typed during it and the commits landed in it. Generated, gitignored.

## Procedure

1. Run `node <engine>/collect.mjs`. It rescans the transcripts and rebuilds the
   month markdown. Safe to run repeatedly. If it says tracking has never been
   started, stop and tell the user - there is nothing to label.

2. Read `cache/<month>.raw.json` for the month you are labelling (the current
   month unless told otherwise). Days are marked `"labelled": false` when they
   still need you.

   Two placeholder rows mean "not named yet", and they are not equivalent:

   - `Unlabelled` - a **finished** day. Its evidence is complete and will not
     change, so it is named whenever you notice it, asked or not.
   - `In progress` - **today**, still growing. Named only when the user stops
     tracking, runs Update tracking, or asks. If it is only a few minutes of
     the session you are running in, leaving it is fine.

   No PDF renders while either one is still standing, so a day left unnamed
   blocks the report until someone names it.

3. For each such day, read that day's blocks - their `prompts` and `commits` -
   and decide what was worked on. **Read every prompt in the block, not just the
   first screenful.** A long block can hold two hundred prompts covering several
   unrelated areas, and naming it from its opening minutes silently drops the
   rest of the day. Each prompt and commit carries an `at` local time: use those
   to find where topics actually change, and derive each task's minutes from the
   time span it covers rather than splitting the day proportionally.

   Then edit `<tracking>/<month>.md`, replacing that day's

   ```
   | Unlabelled | 5h 56m |
   ```

   row with one row per task:

   ```
   | Legal pages and hero band | 3h 10m |
   | Design-system rail documentation | 2h 46m |
   ```

4. Re-run `node <engine>/collect.mjs` to confirm the file reconciles cleanly,
   then tell the user which days you named and what the month now totals.

## Rules for the labels

- **Only evidence.** Every task name must be traceable to a prompt or a commit
  subject in that day's blocks. Never infer or invent product details, module
  names, or features. If the project has its own anti-invention rule, it applies
  here too.
- **Where the evidence is genuinely empty**, `Unattributed work` is the correct
  label. It is better than a confident guess.
- **The rows must add up** to the day's heading total. The collector will warn
  if they do not.
- **Two to five rows a day** is the useful range. One row for eight hours says
  nothing; fifteen rows is a transcript, not a summary.
- **Name the work, not the process.** "Checkout validation and error states"
  beats "coding" or "various fixes".
- **A day already named is finished.** Do not rewrite labels someone accepted,
  unless the user asks you to.
