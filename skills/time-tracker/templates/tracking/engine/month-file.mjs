// Read, write and merge the month timesheet markdown.
//
// The markdown is the whole database. A day heading carries its total and the
// table carries the split, so a month file needs no side-car data to keep in
// step and no second file to conflict in git.
//
// That also makes working across machines fall out for free. Each machine can
// only measure its own days, so a rebuild replaces the days it has evidence for
// and leaves every other day exactly as it found it.
//
// Rendering is a pure function of the data, with no generation timestamp, so
// re-running the collector on unchanged input produces a byte-identical file
// and leaves the working tree clean.

import {
  formatDuration,
  mergeBlocks,
  parseDuration,
  totalSeconds,
  weekdayOf,
} from "./blocks.mjs";

/** Placeholder for measured time on a finished day that nobody has named yet. */
export const UNLABELLED = "Unlabelled";

/**
 * Placeholder for the tail of the current day.
 *
 * Today's total grows with every session, so there is almost always a few
 * minutes that arrived after the day was last labelled. That is not an omission
 * to chase - it is work still happening - so it is named for what it is instead
 * of flagging the day as incomplete.
 */
export const IN_PROGRESS = "In progress";

const PLACEHOLDERS = new Set([UNLABELLED, IN_PROGRESS]);

/**
 * How far a re-measured day may fall below the recorded one before it is read
 * as lost evidence rather than arithmetic.
 *
 * A day heading stores whole minutes, so a rebuild of the very same transcripts
 * can land up to half a minute under what was written. A minute of slack keeps
 * that rounding from tripping the guard below.
 */
const SHRINK_TOLERANCE_SECONDS = 60;

/**
 * `formatDuration` rounds to the nearest minute, so a remainder below this
 * renders as `0m` - a row that says nothing and can only have come from
 * rounding. See the drop in `reconcileTasks`.
 */
const ZERO_ROW_SECONDS = 30;

/** Whether a task still needs a real name. */
export function isPlaceholder(name) {
  return PLACEHOLDERS.has(name);
}

const DAY_HEADING = /^##\s+(\d{4}-\d{2}-\d{2})\s+\([A-Za-z]{3}\)\s+-\s+(.+?)\s*$/;
const TABLE_ROW = /^\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$/;
const MONTH_HEADING = /^#\s+Time tracking\s+-\s+(\d{4}-\d{2})\s*$/;

/**
 * Parse a month file. Unknown lines are ignored rather than rejected so a
 * hand-written note between days does not break the pipeline - but the day
 * headings and task tables are a contract.
 */
export function parseMonthFile(markdown) {
  const lines = markdown.split("\n");
  let month = "";
  const days = [];
  let current = null;

  for (const line of lines) {
    const monthMatch = MONTH_HEADING.exec(line);
    if (monthMatch) {
      month = monthMatch[1];
      continue;
    }

    const dayMatch = DAY_HEADING.exec(line);
    if (dayMatch) {
      current = {
        date: dayMatch[1],
        seconds: parseDuration(dayMatch[2]),
        tasks: [],
      };
      days.push(current);
      continue;
    }

    if (!current) continue;

    const rowMatch = TABLE_ROW.exec(line);
    if (rowMatch) {
      const [, name, time] = rowMatch;
      // Skip the header row and its `| ---- |` separator.
      if (name === "Task" || /^-+$/.test(name)) continue;
      current.tasks.push({ name, seconds: parseDuration(time) });
    }
  }

  return { month, days };
}

/**
 * Render a month file. Deterministic: same data in, same bytes out.
 *
 * `workdays` is the config's own list, so the header only claims weekends are
 * excluded while they actually are.
 */
export function renderMonthFile(file, workdays = [0, 1, 2, 3, 4, 5, 6]) {
  const everyDay = [0, 1, 2, 3, 4, 5, 6].every((day) => workdays.includes(day));
  const count = file.days.length;
  // Sum the *displayed* per-day minutes, not raw seconds, so the header total
  // always equals the column beneath it - and matches the PDF, which can only
  // read the rounded values back out of this file.
  const total = file.days.reduce((sum, day) => sum + Math.round(day.seconds / 60) * 60, 0);
  const noun = count === 1 ? "day" : "days";

  const out = [
    `# Time tracking - ${file.month}`,
    "",
    `Total: ${formatDuration(total)} across ${count} tracked ${noun}.` +
      (everyDay ? "" : " Weekends excluded."),
    "",
  ];

  for (const day of [...file.days].sort((a, b) => a.date.localeCompare(b.date))) {
    out.push(`## ${day.date} (${weekdayOf(day.date)}) - ${formatDuration(day.seconds)}`);
    out.push("");
    out.push("| Task | Time |");
    out.push("| ---- | ---- |");
    for (const task of day.tasks) {
      out.push(`| ${task.name} | ${formatDuration(task.seconds)} |`);
    }
    out.push("");
  }

  return out.join("\n");
}

/**
 * Reconcile existing labels against freshly measured blocks.
 *
 * Labels are preserved by name; only the arithmetic is recomputed. When the
 * measured total has grown since the day was labelled - the normal case when a
 * day is re-collected while still being worked - the growth is parked under a
 * placeholder to be named, rather than being credited to work that did not earn
 * it. When it has shrunk (rare; transcripts only grow), the tail is trimmed
 * instead of discarding the labels.
 */
function reconcileTasks(existing, seconds, pending, tailSeconds) {
  const labelled = existing.filter((task) => !isPlaceholder(task.name));
  const labelledSeconds = labelled.reduce((sum, task) => sum + task.seconds, 0);
  const difference = seconds - labelledSeconds;

  if (labelled.length === 0) return [{ name: pending, seconds }];

  // A positive remainder too small to render as a minute is rounding, not
  // unrecorded work: the rows store whole minutes while a measurement is exact
  // seconds, so a fully named day re-measures a few seconds over its rows'
  // sum. Opening a placeholder for it would pin an `Unlabelled 0m` row onto
  // every finished day at every collect. Drop it, and any placeholder already
  // standing for it, so a named finished day re-measures byte-stable.
  if (difference >= 0 && difference < ZERO_ROW_SECONDS) {
    return labelled.map((task) => ({ ...task }));
  }

  // Growth belongs to a placeholder, never to a task someone named.
  //
  // Folding a short remainder into the last named task holds for one fold and
  // fails for many: collecting every few minutes makes every increment short,
  // so the last row absorbs the whole afternoon a few minutes at a time and
  // the work is filed under a name that has nothing to do with it. A
  // placeholder row that grows is honest and gets named; a named row that
  // grows silently is a lie.
  if (difference > 0) {
    const tasks = existing.map((task) => ({ ...task }));
    const tail = tasks[tasks.length - 1];
    if (tail && isPlaceholder(tail.name)) {
      // Set, never add: `difference` is measured against the named rows alone,
      // so it is already the placeholder's whole size. Adding would count the
      // placeholder's own minutes again on every collect.
      tail.seconds = difference;
      return tasks;
    }
    return [...labelled.map((task) => ({ ...task })), { name: pending, seconds: difference }];
  }

  // A shrink small enough to be rounding is arithmetic, not lost work, so it
  // still comes off the tail rather than opening a row.
  if (-difference < tailSeconds) {
    const tasks = labelled.map((task) => ({ ...task }));
    tasks[tasks.length - 1].seconds += difference;
    return tasks;
  }

  const tasks = labelled.map((task) => ({ ...task }));
  let excess = -difference;
  for (let index = tasks.length - 1; index >= 0 && excess > 0; index -= 1) {
    const take = Math.min(tasks[index].seconds, excess);
    tasks[index].seconds -= take;
    excess -= take;
  }
  return tasks.filter((task) => task.seconds > 0);
}

/**
 * Rebuild the month from what this machine measured, keeping existing labels.
 *
 * Days the caller has no evidence for are kept exactly as they were. That is
 * what makes the timesheet safe across machines: work done on another computer
 * arrives in this file through git, and a machine that never saw those sessions
 * must not read their absence as "no work happened".
 *
 * `hoursMultiplier` scales measured seconds before they are recorded - 1.5
 * means an hour of measured activity is written down as an hour and a half.
 */
export function rebuild(existing, month, measured, todayDay, idleGapMinutes, hoursMultiplier = 1) {
  const days = new Map((existing?.days ?? []).map((day) => [day.date, day]));

  for (const entry of measured) {
    const merged = mergeBlocks(entry.blocks);
    // Measured time is scaled here, once, so every downstream consumer -
    // reconciliation, the rendered markdown, the PDF - sees the same already
    // scaled seconds rather than each having to remember to apply it.
    const seconds = totalSeconds(merged) * hoursMultiplier;
    if (seconds <= 0) continue;

    const previous = days.get(entry.date);

    // A finished day whose every row is named is settled. The day has been
    // measured, it has been named, and the number a reader saw when the day
    // closed must still be there tomorrow - so a tail of transcript that
    // surfaces later (a session outliving the day's final collect, say) stays
    // in the evidence cache but no longer moves the record. A day still
    // carrying a placeholder is still being reconciled and keeps updating,
    // and today always does.
    if (
      previous &&
      entry.date < todayDay &&
      previous.tasks.length > 0 &&
      previous.tasks.every((task) => !isPlaceholder(task.name))
    ) {
      continue;
    }

    // A rebuild is only as good as the transcripts still on disk, and those
    // expire. Once a day's evidence is gone it re-measures as a few stray
    // minutes, which would silently erase hours of named work. Measured time
    // only ever grows while the evidence survives, so a drop against labelled
    // work means the evidence went missing, not that the day got shorter -
    // keep what is on record and say so.
    if (
      previous &&
      previous.seconds - seconds > SHRINK_TOLERANCE_SECONDS &&
      previous.tasks.some((task) => !isPlaceholder(task.name))
    ) {
      console.warn(
        `Warning: ${entry.date} measures ${formatDuration(seconds)} but the timesheet records ` +
          `${formatDuration(previous.seconds)} against named work. Keeping the recorded day - ` +
          `its transcripts have most likely expired.`,
      );
      continue;
    }

    days.set(entry.date, {
      date: entry.date,
      seconds,
      tasks: reconcileTasks(
        days.get(entry.date)?.tasks ?? [],
        seconds,
        entry.date === todayDay ? IN_PROGRESS : UNLABELLED,
        idleGapMinutes * 60,
      ),
    });
  }

  return {
    month,
    days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}
