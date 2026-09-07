# Naming the days

The arithmetic is not your job - the collector measures the hours. Your job is
to say **what the work was**, using only evidence.

## What the files mean

- `<tracking>/<month>.md` - the record. Human-readable, hand-correctable, and
  the input to the PDF. This is the only file you edit, and within it only the
  task rows.
- `<tracking>/cache/<month>.pending.json` - **your evidence, and the file you
  read.** Only the days that still need a name, each with its blocks, the
  prompts typed in them and the commits landed in them. Generated, gitignored.
- `<tracking>/cache/<month>.raw.json` - the same evidence for the *whole* month,
  settled days included. Reach for it only when re-checking a day someone has
  already named. Reading it for a routine update means reading a month to name
  a day, which is exactly what `pending.json` exists to avoid.
- `<tracking>/log.jsonl` - what previous runs did. You append to it at the end
  of an update; you do not need to read it to label.

## Procedure

1. Run `node <engine>/collect.mjs`. It rescans the transcripts and rebuilds the
   month markdown. Safe to run repeatedly. If it says there is no `trackFrom`
   in config.json, stop and tell the user - the tracker is not set up here and
   there is nothing to label.

2. Read `cache/<month>.pending.json` for the month you are labelling (the
   current month unless told otherwise). Every day in it needs you - that is
   what the file is. An empty `days` array means there is nothing to name, and
   the honest answer is to say so rather than to go looking in `raw.json`.

   Two placeholder rows mean "not named yet". They read differently but they
   are named the same way, now:

   - `Unlabelled` - a **finished** day. Its evidence is complete and will not
     change.
   - `In progress` - **today**, still growing. Nothing runs in the background
     to name it later, so it is named on this pass like any other day. Work
     that arrives after you name it becomes a new `In progress` row underneath
     yours, which the next update names in turn. That is expected.

   No PDF renders while either one is still standing, so a day left unnamed
   blocks the report until someone names it.

3. For each such day, read that day's blocks - their `commits` and `prompts` -
   and decide what was worked on.

   **Commits lead.** A commit subject is the user's own summary of finished
   work, written deliberately, and it is the best name a block can have. Where a
   block contains commits, name it from them - one row per commit, or one row
   per group of commits that clearly belong to the same piece of work.

   A commit marked `"new": true` was not seen by any previous run - a useful
   place to start reading. It is a hint and nothing more: the commits without
   it are still the evidence for the hours around them, and a block with no
   commits at all is named the same as any other.

   **Prompts fill the gaps.** Most of a day has no commit in it: work in
   progress, work abandoned, work discussed. For those blocks, name from the
   prompts. **Read every prompt in the block, not just the first screenful.**
   A long block can hold two hundred prompts covering several unrelated areas, and naming it from its opening minutes silently drops the
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

4. **Do not re-run the collector to check your work.** Today is still running,
   so a collect after naming will nearly always find another minute or two and
   open a fresh `In progress` row for it - which then blocks the PDF you were
   about to render. The collector already ran in step 1; the arithmetic it
   produced is what you named against, and the month file warns on its own if
   your rows do not add up. Go straight to the report.

   The exception is a month with no today in it - last month, an old month -
   where nothing can grow and a verifying collect is free.

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
