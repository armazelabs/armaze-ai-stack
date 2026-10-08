# Naming the days

The arithmetic is not your job - the collector measures the hours. Your job is
to say **what the work was**, using only evidence: a short name for each task,
its work type, when it happened and in which session, and under it a few
bullets saying what that time actually delivered.

Everything is per computer. The files carry this computer's name as their file
id - `<month>.<fileid>.md`, `cache/<month>.<fileid>.pending.json`, where
`<fileid>` is like `studio-3f9a` - and the evidence holds only the commits
made on this computer and its own sessions. The collector prints the month it wrote, and
the tracking folder shows the files. Never edit another computer's month file
to name its days: it holds time this computer has no evidence for, and only
that computer can name it.

## What the files mean

- `<tracking>/<month>.<fileid>.md` - the record. Human-readable, hand-correctable, and
  the input to the PDF. This is the only file you edit, and within it only the
  task rows' Task, Type, When and Session cells and their bullets. Never the
  Time cells, never a row marked `· manual` - those belong to `manual.mjs`
  (see the skill's Manual hours step) - and never the `> Sessions` legend
  under a day, which the collector writes.
- `<tracking>/cache/<month>.<fileid>.pending.json` - **your evidence, and the file
  you read.** Only the days that still need work, each with its `needs`
  (`names`, `bullets`, `types`, `times`, or any mix), its current `tasks`, its
  `sessions` legend (each session's ref and opening prompt), and its blocks:
  for each block its `range`, the `sessions` working in it with their own
  ranges, the prompts typed in it (each with its `session`), and the commits
  made on this computer that landed in it, each with its `subject` and, where
  it has one, its message `body`. Generated, gitignored.
- `<tracking>/cache/<month>.<fileid>.raw.json` - the same evidence for the *whole* month,
  settled days included. Reach for it only when re-checking a day someone has
  already named. Reading it for a routine update means reading a month to name
  a day, which is exactly what `pending.json` exists to avoid.
- `<tracking>/log.<fileid>.jsonl` - what previous runs did. You append to it at the end
  of an update; you do not need to read it to label.

## Procedure

1. Run `node <engine>/collect.mjs`. It rescans the transcripts and rebuilds the
   month markdown. Safe to run repeatedly. If it says there is no `trackFrom`
   in config.json, stop and tell the user - the tracker is not set up here and
   there is nothing to label.

2. Read `cache/<month>.<fileid>.pending.json` for the month you are labelling (the
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

   A day left unnamed still renders - as "Research & exploration", typed
   Research, with no bullets. That is a fallback for a client to read, not a
   name: name every one you can.

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

   Then edit `<tracking>/<month>.<fileid>.md`, replacing that day's

   ```
   | Unlabelled | - | 09:05-12:10, 13:30-16:20 | 4c11d0a2, 9be0f113 | 5h 56m |
   ```

   row with one row per task - its name, its work type, when it happened, its
   sessions, its time - and add a bullet list after the table - one top-level
   item per task, spelled exactly as in its row, with its outcome bullets
   indented beneath it:

   ```
   | Legal pages and hero band | Development | 09:05-12:10 | 4c11d0a2 | 3h 10m |
   | Design-system rail documentation | Content | 13:30-16:20 | 9be0f113 | 2h 46m |

   - Legal pages and hero band
     - Privacy policy and terms pages, linked from the footer
     - New hero band on the home page with the launch message
   - Design-system rail documentation
     - Every colour, type and spacing rule documented in one place
     - Usage examples for buttons, forms and cards
   ```

   **When** is the local clock time the task happened, `HH:MM-HH:MM`, several
   ranges separated by `, ` when it was worked in pieces. Read it from the
   evidence: the block `range`s, the sessions' own ranges inside them, and the
   `at` of the prompts and commits that belong to the task. The placeholder's
   When is the unnamed part of the day - split it between your rows, and do
   not reach outside it. **Session** is the ref of each session the task was
   done in (the prompts carry their `session`), separated by `, `; the day's
   `sessions` legend says which ref is which. Use `-` only where the evidence
   truly gives no time.

   **When is not Time.** Time is what is recorded - the hours multiplier is
   already in it - so a task worked 09:00-11:00 may read `3h`. Split the
   placeholder's Time between your rows in proportion to how long each was
   worked, and keep them adding up to it.

   A day whose `needs` is only some of `bullets`, `types` and `times` is
   already named: add the bullets the tasks lack (two at least on each measured
   task), write a type into each `-` Type cell, fill each `-` When and Session
   cell from the evidence, and leave the names and Time cells exactly as they
   are. That is how days named before bullets, types or times existed get
   filled in.

   A row whose Type reads `Research · manual, 2h given` or `Design · manual`
   was logged by hand. Its hours are not in the blocks and not yours to split
   - leave it exactly as it is, When and Session `-` included, and name only
   the measured rows around it. The rows still add up to the day's total with
   it included.

4. **Do not re-run the collector to check your work.** Today is still running,
   so a collect after naming will nearly always find another minute or two and
   open a fresh `In progress` row for it - which then reaches the PDF you were
   about to render as "Research & exploration". The collector already ran in
   step 1; the arithmetic it produced is what you named against, and the next
   collect warns if your rows do not add up or a When or Session does not
   match the measured time. Go straight to the report.

   The exception is a month with no today in it - last month, an old month -
   where nothing can grow and a verifying collect is free.

## Writing the bullets

The PDF is read by a client, who wants to see what their money bought. The
task name says where the time went; the bullets say **what now exists or works
because of it**.

- **Two to four bullets a task.** Every measured task needs at least two - the
  report warns on one. Manual rows may have none.
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
- **Nothing personal.** No names, emails or who-did-what - and nothing that
  says which computer or session; the timesheet already records that.

## Picking the work type

Every named task gets exactly one type from `categories` in
`<tracking>/config.json`, spelled exactly as listed there - a type the list
does not hold splits the PDF's "By type" table and the collector warns about
it. The default list is Design, Development, Research, Content, QA/Testing,
Meetings, Project management, Other; a project may have trimmed or extended it.

Read the type off the same evidence as the name:

- **Design** - layouts, screens, visual style, Figma, mockups, icons, colour and
  type decisions, UI polish where the prompts are about how it looks.
- **Development** - code: features, fixes, refactors, builds, deploys,
  integrations. Most commits land here.
- **Research** - reading, comparing options, investigating a problem before
  changing anything, spikes.
- **Content** - copy, docs, help text, marketing pages' words.
- **QA/Testing** - writing tests, running them, reproducing and verifying bugs.
- **Meetings**, **Project management** - planning, specs, scoping, tickets.
- **Other** - only when nothing above fits.

A task that mixes two kinds of work takes the one most of its time went to;
if the split is real and large, it is two tasks. `Unattributed work` needs no
type - leave its cell `-`.

## Rules for the labels

- **Only evidence.** Every task name must be traceable to a prompt or a commit
  subject in that day's blocks. Never infer or invent product details, module
  names, or features. If the project has its own anti-invention rule, it applies
  here too.
- **Where the evidence is genuinely empty**, `Unattributed work` is the correct
  label. It is better than a confident guess.
- **Never write a row for timesheet work.** No "Timesheet update", "Hours
  recorded and named", "Timesheet corrected", "Tracker fixes" or anything of
  the kind. The collector already leaves the time spent on "update tracker"
  out of the day's total and out of the evidence, so there is nothing to
  account for; a block whose prompts were nothing but tracker requests gets no
  row. The PDF drops any such row it finds, so writing one only makes the
  rows stop adding up.
- **The rows must add up** to the day's heading total. The collector will warn
  if they do not.
- **Two to five rows a day** is the useful range. One row for eight hours says
  nothing; fifteen rows is a transcript, not a summary.
- **Name the work, not the process.** "Checkout validation and error states"
  beats "coding" or "various fixes".
- **A day already named is finished.** Do not rewrite labels someone accepted,
  unless the user asks you to. Adding missing bullets under them is not a
  rewrite - it is the backfill `needs: bullets` asks for.
- **Only this computer's work.** The evidence already holds only the commits
  made on it. Do not go to `git log` for more - a commit pulled in from another
  computer is not evidence of what this one did.
