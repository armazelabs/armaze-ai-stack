# time-tracking

The timesheet under `project-management/` is generated. Do not hand-write hours
or day headings. Run `node lib/time-tracking/collect.mts` (or the `time:collect`
package.json script) and let it write them.

The one part of `<YYYY-MM>.md` a human or agent edits is the task rows: the name
of a task, and the split of a day's time between tasks. Any task not named
`Unlabelled` is treated as deliberate and is never overwritten. Task times in a
day must add up to that day's heading.

Task names must be traceable to a prompt or a commit from that day. If this
project has its own product-knowledge or anti-invention rule, it applies here as
everywhere: never infer module names, features, or product detail to make a
label read better. Where the evidence is genuinely empty, `Unattributed work` is
the correct label.

A finished day whose rows are all named is settled: transcript time that
surfaces after the day closed (a session outliving its final collect) stays in
the evidence cache but never changes the recorded day again. Only days still
carrying a placeholder row, and today, keep updating.

Never commit `project-management/` together with code. The `time-tracker` agent
commits it alone, with a pathspec, and never pushes.

**Why:** The hours are measured from session transcripts, so the numbers are
evidence rather than recollection - editing them by hand turns a record into a
guess, and the next collect would overwrite the edit anyway. The labels are the
opposite: no script can know that three hours of prompts amounted to "checkout
form validation", so those are written once and then protected. Keeping the
timesheet out of code commits means nightly automation never clutters the
history a reviewer reads.

**Example:**

- Bad: editing `## 2026-08-21 (Fri) - 5h 56m` to read `7h` because it felt longer.
- Bad: labelling a day "Backend integration" when nothing in that day's prompts or
  commits mentions a backend.
- Good: replacing `| Unlabelled | 5h 56m |` with `| Checkout form validation |
3h 10m |` and `| Component library docs | 2h 46m |`, both traceable to
  that day's prompts, and adding up to 5h 56m.
