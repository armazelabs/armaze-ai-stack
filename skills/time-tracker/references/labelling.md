# Naming the days

The arithmetic is not your job - the collector measures the hours. Your job is
to say **what the work was**, using only evidence: a short name for each task,
and under it a few bullets saying what that time actually delivered.

Everything is per person. The files carry the id of whoever is running this -
`<month>.<id>.md`, `cache/<month>.<id>.pending.json` - and the evidence holds
only that person's own commits. `<id>` below means that suffix; the collector
prints the month it wrote, and the tracking folder shows the files.

## What the files mean

- `<tracking>/<month>.<id>.md` - the record. Human-readable, hand-correctable, and
  the input to the PDF. This is the only file you edit, and within it only the
  task rows and their bullets.
- `<tracking>/cache/<month>.<id>.pending.json` - **your evidence, and the file
  you read.** Only the days that still need work, each with its `needs`
  (`names`, `bullets`, or both), its current `tasks`, and its blocks: the
  prompts typed in them and this person's commits landed in them, each commit
  with its `subject` and, where it has one, its message `body`. Generated,
  gitignored.
- `<tracking>/cache/<month>.<id>.raw.json` - the same evidence for the *whole* month,
  settled days included. Reach for it only when re-checking a day someone has
  already named. Reading it for a routine update means reading a month to name
  a day, which is exactly what `pending.json` exists to avoid.
- `<tracking>/log.<id>.jsonl` - what previous runs did. You append to it at the end
  of an update; you do not need to read it to label.

## Procedure

1. Run `node <engine>/collect.mjs`. It rescans the transcripts and rebuilds the
   month markdown. Safe to run repeatedly. If it says there is no `trackFrom`
   in config.json, stop and tell the user - the tracker is not set up here and
   there is nothing to label.

2. Read `cache/<month>.<id>.pending.json` for the month you are labelling (the
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

   Then edit `<tracking>/<month>.<id>.md`, replacing that day's

   ```
   | Unlabelled | 5h 56m |
   ```

   row with one row per task, and add a bullet list after the table - one
   top-level item per task, spelled exactly as in its row, with its outcome
   bullets indented beneath it:

   ```
   | Legal pages and hero band | 3h 10m |
   | Design-system rail documentation | 2h 46m |

   - Legal pages and hero band
     - Privacy policy and terms pages, linked from the footer
     - New hero band on the home page with the launch message
   - Design-system rail documentation
     - Every colour, type and spacing rule documented in one place
     - Usage examples for buttons, forms and cards
   ```

   A day whose `needs` is only `bullets` is already named: add the list for
   the tasks that lack one, and leave the rows - names and times - exactly as
   they are. That is how days named before bullets existed get filled in.

4. **Do not re-run the collector to check your work.** Today is still running,
   so a collect after naming will nearly always find another minute or two and
   open a fresh `In progress` row for it - which then blocks the PDF you were
   about to render. The collector already ran in step 1; the arithmetic it
   produced is what you named against, and the month file warns on its own if
   your rows do not add up. Go straight to the report.

   The exception is a month with no today in it - last month, an old month -
   where nothing can grow and a verifying collect is free.

## Writing the bullets

The PDF is read by a client, who wants to see what their money bought. The
task name says where the time went; the bullets say **what now exists or works
because of it**.

- **Two to four bullets a task.** One is fine for a short task with one outcome.
- **Outcomes, not activity.** "Customers get a receipt email after every
  purchase", not "Worked on email templates". Say what someone can now see,
  use or rely on.
- **Plain words.** Write for someone who has never seen the code: no file paths,
  commit hashes, function or component names, branch names, or jargon a client
  would have to look up. "Checkout form" rather than `CheckoutForm.tsx`.
- **Short.** About twelve words a bullet, no full stops at the end.
- **Evidence only.** Every bullet must come from that block's commit subjects,
  commit bodies or prompts - the body usually says what the subject only names.
  Never add a feature, a number or a claim the evidence does not state. Work
  that was attempted and not finished is described as what it is ("Started the
  export to CSV"), never as delivered.
- **`Unattributed work` gets no bullets.** There is nothing on record to say
  about it.
- **Nothing personal.** No names, emails or who-did-what - the timesheet is
  already one person's.

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
  unless the user asks you to. Adding missing bullets under them is not a
  rewrite - it is the backfill `needs: bullets` asks for.
- **Only this person's work.** The evidence already holds only their own
  commits. Do not go to `git log` for more - a teammate's commit is not evidence
  of what this person did.
