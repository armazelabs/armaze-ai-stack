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
//
// A day is a heading, a table, the outcome bullets and a legend of the
// sessions that worked on it:
//
//   ## 2026-10-05 (Mon) - 4h 45m
//
//   | Task | Type | When | Session | Time |
//   | ---- | ---- | ---- | ------- | ---- |
//   | Checkout form validation | Development | 09:10-11:20 | 4c11d0a2 | 3h 15m |
//   | Payment provider comparison | Research · manual, 1h given | - | - | 1h 30m |
//
//   - Checkout form validation
//     - Every checkout field shows a clear error before payment
//
//   > Sessions
//   > 4c11d0a2 · fix checkout validation bug
//
// `When` is the local clock time the task happened, `Session` the sessions it
// happened in, by the first eight characters of their id. `Time` is what is
// recorded - the multiplier already applied - so it is not the length of
// `When`. The legend is written by the collector, never by hand.

import {
  formatDuration,
  fromMinutes,
  mergeBlocks,
  parseDuration,
  subtractRanges,
  toMinutes,
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
 * The honest label for time the evidence cannot name. It gets no bullets:
 * there is nothing on record to say about it, and inventing outcomes for it
 * would put claims on a client document that nothing supports.
 */
export const UNATTRIBUTED = "Unattributed work";

/**
 * The work type manual hours always carry. Work done away from Claude Code -
 * a Figma afternoon, a paper sketch, reading - is research by the time it
 * reaches a timesheet, and one fixed type keeps every computer's manual rows
 * adding up under the same heading.
 */
export const MANUAL_TYPE = "Research";

/**
 * What an unnamed stretch reads as on a PDF. Unnamed time is real time, so
 * it is counted and shown rather than holding the PDF back - under a neutral
 * name, with no bullets, since nothing on record says what it delivered.
 */
export const FALLBACK_NAME = "Research & exploration";
export const FALLBACK_TYPE = MANUAL_TYPE;

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

/**
 * Marks a row as manual in the Type column. Manual hours are work that never
 * touched a transcript - a Figma afternoon, a paper sketch - so no collect can
 * measure them. The marker is what tells a rebuild to leave the row alone and
 * to count it on top of what it measures.
 *
 * `Research · manual, 2h given` is an entry scaled by the hours multiplier:
 * two hours given, recorded in the Time column as three. `Design · manual`,
 * with nothing given, is an entry from before manual hours were scaled,
 * recorded as given and never rescaled.
 */
export const MANUAL_MARK = "manual";
const TYPE_SEPARATOR = " · ";
/** An empty cell: a row nobody has typed yet, a placeholder, a row with no times. */
const NO_TYPE = "-";
const MANUAL_CELL = /^(.*?)\s*·\s*manual(?:\s*,\s*(.+?)\s+given)?\s*$/i;

function sumSeconds(tasks) {
  return tasks.reduce((sum, task) => sum + task.seconds, 0);
}

/** Whether a task still needs a real name. */
export function isPlaceholder(name) {
  return PLACEHOLDERS.has(name);
}

/**
 * Whether a named task still needs its outcome bullets - the plain-language
 * list of what the time actually delivered, which is what the PDF shows under
 * each task. Two at least, so every measured task says more than its name.
 * Manual rows are the person's own word, and their bullets are optional.
 */
export function needsBullets(task) {
  return (
    !isPlaceholder(task.name) && task.name !== UNATTRIBUTED && !task.manual && (task.details?.length ?? 0) < 2
  );
}

/**
 * Whether a named, measured task still needs its `When` - the clock times it
 * happened, which the computer's own PDF prints under it. Manual rows have no
 * transcript to read times from.
 */
export function needsTimes(task) {
  return !isPlaceholder(task.name) && task.name !== UNATTRIBUTED && !task.manual && !(task.when?.length > 0);
}

/**
 * Whether a named task still needs its work type - one of the config's
 * `categories`. Like missing bullets this only thins the report, so it is a
 * backfill on the next update, never a reason to refuse a PDF.
 */
export function needsType(task) {
  return !isPlaceholder(task.name) && task.name !== UNATTRIBUTED && !task.type;
}

/** `Development`, `Research · manual, 2h given`, `Design · manual`, or `-`. */
export function typeCell(task) {
  const type = task.type || NO_TYPE;
  if (!task.manual) return type;
  const given = task.givenSeconds != null ? `, ${formatDuration(task.givenSeconds)} given` : "";
  return `${type}${TYPE_SEPARATOR}${MANUAL_MARK}${given}`;
}

function parseTypeCell(cell) {
  const manual = MANUAL_CELL.exec(cell);
  const type = (manual ? manual[1] : cell).trim();
  const parsed = { type: type && type !== NO_TYPE ? type : null, manual: Boolean(manual) };
  if (manual?.[2]) parsed.givenSeconds = parseDuration(manual[2]);
  return parsed;
}

/** `09:10-11:20, 13:05-14:05`, or `-` when the task has no times. */
export function whenCell(task) {
  return task.when?.length > 0 ? task.when.map((range) => `${range.start}-${range.end}`).join(", ") : NO_TYPE;
}

const CLOCK_RANGE = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/;

/** The When cell back to `[{ start, end }]`, or null for `-` or anything that does not read as times. */
export function parseWhenCell(cell) {
  if (!cell || cell.trim() === NO_TYPE) return null;
  const ranges = [];
  for (const part of cell.split(",")) {
    const match = CLOCK_RANGE.exec(part.trim());
    if (!match) return null;
    const clock = (hours, minutes) => `${hours.padStart(2, "0")}:${minutes}`;
    ranges.push({ start: clock(match[1], match[2]), end: clock(match[3], match[4]) });
  }
  return ranges.length > 0 ? ranges : null;
}

/** `4c11d0a2, 9be0f113`, or `-`. */
export function sessionCell(task) {
  return task.sessions?.length > 0 ? task.sessions.join(", ") : NO_TYPE;
}

function parseSessionCell(cell) {
  if (!cell || cell.trim() === NO_TYPE) return null;
  const refs = cell.split(/[,\s]+/).filter(Boolean);
  return refs.length > 0 ? refs : null;
}

/** A table row's cells, or null when the line is not one. */
function tableCells(line) {
  if (!/^\|.*\|\s*$/.test(line)) return null;
  return line.trim().slice(1, -1).split("|").map((cell) => cell.trim());
}

const DAY_HEADING = /^##\s+(\d{4}-\d{2}-\d{2})\s+\([A-Za-z]{3}\)\s+-\s+(.+?)\s*$/;
/** `> 4c11d0a2 · fix checkout validation bug` - one entry of a day's session legend. */
const SESSION_LINE = /^>\s+([0-9A-Za-z-]+)\s+·\s+(.+?)\s*$/;
const MONTH_HEADING = /^#\s+Time tracking\s+-\s+(\d{4}-\d{2})\s*$/;
/** `- Task name` - selects which task the indented bullets below belong to. */
const DETAIL_TASK = /^-\s+(.+?)\s*$/;
/** `  - What was delivered` - one outcome bullet for the selected task. */
const DETAIL_ITEM = /^\s{2,}[-*]\s+(.+?)\s*$/;

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
  let detailTask = null;

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
      detailTask = null;
      continue;
    }

    if (!current) continue;

    const sessionMatch = SESSION_LINE.exec(line);
    if (sessionMatch) {
      (current.sessions ??= []).push({ ref: sessionMatch[1], label: sessionMatch[2] });
      continue;
    }

    // Outcome bullets live in a list after the day's table, keyed by task name,
    // so the table itself stays two columns and every older file still parses.
    // Bullets under a name the table does not hold are dropped: the table is
    // what the hours hang off, and a detail with no hours has nowhere to go.
    const itemMatch = DETAIL_ITEM.exec(line);
    if (itemMatch) {
      if (detailTask) (detailTask.details ??= []).push(itemMatch[1]);
      continue;
    }
    const taskMatch = DETAIL_TASK.exec(line);
    if (taskMatch) {
      detailTask =
        current.tasks.find((task) => task.name === taskMatch[1] && !task.details) ??
        current.tasks.find((task) => task.name === taskMatch[1]) ??
        null;
      continue;
    }

    // Five columns is today's file. Two (Task, Time) and three (Task, Type,
    // Time) are older ones: they parse with what they have, and the next
    // render writes them back with every column for the labeller to fill.
    const cells = tableCells(line);
    if (cells && [2, 3, 5].includes(cells.length)) {
      const name = cells[0];
      // Skip the header row and its `| ---- |` separator.
      if (name === "Task" || /^-+$/.test(name)) continue;
      const task = {
        name,
        ...(cells.length > 2 ? parseTypeCell(cells[1]) : { type: null, manual: false }),
        seconds: parseDuration(cells[cells.length - 1]),
      };
      if (cells.length === 5) {
        const when = parseWhenCell(cells[2]);
        const sessions = parseSessionCell(cells[3]);
        if (when) task.when = when;
        if (sessions) task.sessions = sessions;
      }
      // `givenSeconds` reads after `seconds`, so a parsed row compares equal
      // to one built the way the manual entry builds it.
      const { givenSeconds, ...rest } = task;
      current.tasks.push(givenSeconds != null ? { ...rest, givenSeconds } : rest);
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
    out.push("| Task | Type | When | Session | Time |");
    out.push("| ---- | ---- | ---- | ------- | ---- |");
    for (const task of day.tasks) {
      out.push(
        `| ${task.name} | ${typeCell(task)} | ${whenCell(task)} | ${sessionCell(task)} | ${formatDuration(task.seconds)} |`,
      );
    }
    out.push("");

    const detailed = day.tasks.filter((task) => !isPlaceholder(task.name) && task.details?.length > 0);
    if (detailed.length > 0) {
      for (const task of detailed) {
        out.push(`- ${task.name}`);
        for (const item of task.details) out.push(`  - ${item}`);
      }
      out.push("");
    }

    if (day.sessions?.length > 0) {
      out.push("> Sessions");
      for (const session of day.sessions) out.push(`> ${session.ref} · ${session.label}`);
      out.push("");
    }
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
 * A day's measured time, scaled: main-session blocks times the multiplier,
 * plus agent time no session covered times the subagent multiplier. Scaled
 * here, once, so every downstream consumer - reconciliation, the rendered
 * markdown, the PDF - sees the same already scaled seconds rather than each
 * having to remember to apply it.
 */
export function measuredSeconds(entry, hoursMultiplier = 1, subagentMultiplier = 1) {
  return (
    totalSeconds(mergeBlocks(entry.blocks)) * hoursMultiplier +
    (entry.unscaledSeconds ?? 0) * subagentMultiplier
  );
}

/**
 * A day's session legend after a re-measure: the sessions measured now, in
 * the order they started, then any the record already named that the
 * evidence no longer shows. A label measured now wins - it is read fresh
 * from the transcripts.
 */
export function mergeLegend(previous = [], measured = []) {
  const merged = measured.map((session) => ({ ...session }));
  for (const session of previous) {
    if (!merged.some((known) => known.ref === session.ref)) merged.push({ ...session });
  }
  return merged;
}

/**
 * Give a day's placeholder row the times and sessions nobody has named yet:
 * the day's measured ranges less every named row's `When`. When a named row
 * has no times there is no telling which part of the day it covers, so the
 * placeholder gets none either - an honest `-` beats a wrong time.
 *
 * `ranges` is the day's measured blocks, `[{ start: "HH:MM", end: "HH:MM",
 * sessions: [ref] }]`. A sliver under two minutes is a rounding edge, not work.
 */
export function placeholderSpan(tasks, ranges) {
  const tail = tasks.find((task) => isPlaceholder(task.name));
  if (!tail || !ranges) return tasks;
  delete tail.when;
  delete tail.sessions;
  const named = tasks.filter((task) => !isPlaceholder(task.name) && !task.manual);
  if (named.some((task) => !(task.when?.length > 0))) return tasks;
  const minutes = (range) => ({ ...range, start: toMinutes(range.start), end: toMinutes(range.end) });
  const rest = subtractRanges(
    ranges.map(minutes),
    named.flatMap((task) => task.when.map(minutes)),
  ).filter((piece) => piece.end - piece.start >= 2);
  if (rest.length === 0) return tasks;
  tail.when = rest.map((piece) => ({ start: fromMinutes(piece.start), end: fromMinutes(piece.end) }));
  const sessions = [...new Set(rest.flatMap((piece) => piece.sessions ?? []))];
  if (sessions.length > 0) tail.sessions = sessions;
  return tasks;
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
 * It applies to `entry.blocks`, the main-session time. An entry may also
 * carry `unscaledSeconds` - subagent time no main-session block covered -
 * which is scaled by `subagentMultiplier` instead (1.2 by default).
 *
 * An entry's `ranges` (its blocks as local clock times, with their sessions)
 * fill the placeholder's When and Session cells, and its `sessions` (`[{ ref,
 * label }]`) the day's legend.
 *
 * `fullCountFrom` freezes the record before it: a day already written there
 * is kept exactly as it is, whatever it measures now. That is the line drawn
 * when every computer started counting in full - before it, time shared with
 * another computer was taken off, and those weeks were already reported.
 *
 * Manual rows sit outside all of this. No transcript measured them, so no
 * transcript can grow, shrink or trim them: every guard and the reconcile run
 * against the measured rows alone, and the manual ones are carried across
 * untouched, their time added on top of the day's measured total.
 */
export function rebuild(
  existing,
  month,
  measured,
  todayDay,
  idleGapMinutes,
  hoursMultiplier = 1,
  subagentMultiplier = 1,
  { fullCountFrom = null } = {},
) {
  const days = new Map((existing?.days ?? []).map((day) => [day.date, day]));

  for (const entry of measured) {
    const raw = measuredSeconds(entry, hoursMultiplier, subagentMultiplier);
    // Too short to render as a minute: rounding, not a day of work.
    if (raw < ZERO_ROW_SECONDS) continue;

    const previous = days.get(entry.date);
    if (previous && fullCountFrom && entry.date < fullCountFrom) continue;
    const legend = mergeLegend(previous?.sessions, entry.sessions);
    const withLegend = (day) => (legend.length > 0 ? { ...day, sessions: legend } : day);
    const manual = (previous?.tasks ?? []).filter((task) => task.manual);
    const manualSeconds = sumSeconds(manual);
    const recorded = (previous?.tasks ?? []).filter((task) => !task.manual);
    const recordedSeconds = (previous?.seconds ?? 0) - manualSeconds;

    // A finished day whose every row is named is settled: protected against
    // shrinking and against rounding, but not against growth. The number a
    // reader saw when the day closed must still be there tomorrow, so a
    // re-measure within a minute of it changes nothing. A day named partway
    // through and then worked on until midnight is the exception that made
    // this a rule rather than a wall - the rows written at noon stay as they
    // are, and the evening lands below them as a new placeholder row through
    // the reconcile further down. A day still carrying a placeholder is still
    // being reconciled and keeps updating, and today always does.
    if (
      previous &&
      entry.date < todayDay &&
      recorded.length > 0 &&
      recorded.every((task) => !isPlaceholder(task.name)) &&
      raw - recordedSeconds <= SHRINK_TOLERANCE_SECONDS
    ) {
      // Its rows stay as they are; only the legend can learn a session.
      if (JSON.stringify(legend) !== JSON.stringify(previous.sessions ?? [])) {
        days.set(entry.date, withLegend(previous));
      }
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
      recordedSeconds - raw > SHRINK_TOLERANCE_SECONDS &&
      recorded.some((task) => !isPlaceholder(task.name))
    ) {
      console.warn(
        `Warning: ${entry.date} measures ${formatDuration(raw)} but the timesheet records ` +
          `${formatDuration(recordedSeconds)} against named work. Keeping the recorded day - ` +
          `its transcripts have most likely expired.`,
      );
      continue;
    }

    const tasks = placeholderSpan(
      reconcileTasks(recorded, raw, entry.date === todayDay ? IN_PROGRESS : UNLABELLED, idleGapMinutes * 60),
      entry.ranges,
    );
    days.set(
      entry.date,
      withLegend({
        date: entry.date,
        seconds: raw + manualSeconds,
        tasks: [...tasks, ...manual.map((task) => ({ ...task }))],
      }),
    );
  }

  return {
    month,
    days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/**
 * Manual hours: added, changed and removed only through these, so a day's
 * total is never hand-written. A day's measured time is its total less its
 * manual rows, and every edit keeps it exactly that while the manual rows
 * change around it. A day that holds only manual rows exists all the same -
 * no collect has evidence for it, so no collect touches it.
 *
 * Each takes a parsed month file and returns a new one; the caller writes it.
 */
export function addManualTask(file, date, task) {
  const days = file.days.map((day) => ({ ...day, tasks: day.tasks.map((row) => ({ ...row })) }));
  let day = days.find((candidate) => candidate.date === date);
  if (!day) {
    day = { date, seconds: 0, tasks: [] };
    days.push(day);
  }
  if (day.tasks.some((row) => row.manual && row.name === task.name)) {
    throw new Error(`${date} already has a manual row "${task.name}". Change it with \`set\` instead.`);
  }
  day.tasks.push({ ...task, manual: true });
  day.seconds += task.seconds;
  return { ...file, days: days.sort((a, b) => a.date.localeCompare(b.date)) };
}

/**
 * A manual entry's recorded time: the hours given, scaled by the same
 * multiplier as measured time and rounded to the minute the markdown stores.
 */
export function scaleManual(givenSeconds, hoursMultiplier = 1) {
  return Math.round((givenSeconds * hoursMultiplier) / 60) * 60;
}

/** `changes.seconds` with `changes.givenSeconds` re-times the row; a given time makes an older row a scaled one. */
export function setManualTask(file, date, name, changes) {
  return editManual(file, date, name, (row) => {
    const next = { ...row };
    if (changes.rename) next.name = changes.rename;
    if (changes.type) next.type = changes.type;
    if (changes.seconds != null) {
      delete next.givenSeconds;
      next.seconds = changes.seconds;
      if (changes.givenSeconds != null) next.givenSeconds = changes.givenSeconds;
    }
    if (changes.details) next.details = changes.details;
    return next;
  });
}

export function removeManualTask(file, date, name) {
  return editManual(file, date, name, () => null);
}

function editManual(file, date, name, change) {
  const day = file.days.find((candidate) => candidate.date === date);
  const row = day?.tasks.find((task) => task.manual && task.name === name);
  if (!row) throw new Error(`${date} has no manual row "${name}".`);

  const replaced = change(row);
  if (replaced && replaced.name !== name && day.tasks.some((task) => task.manual && task.name === replaced.name)) {
    throw new Error(`${date} already has a manual row "${replaced.name}".`);
  }
  const tasks = day.tasks.flatMap((task) => (task === row ? (replaced ? [replaced] : []) : [{ ...task }]));
  const seconds = day.seconds - row.seconds + (replaced?.seconds ?? 0);
  const days = file.days
    .map((candidate) => (candidate === day ? { ...day, seconds, tasks } : candidate))
    // A day that only ever held manual time is gone once its last row is.
    .filter((candidate) => candidate.tasks.length > 0);
  return { ...file, days };
}

/**
 * A task row that is about keeping the timesheet rather than about the
 * project - "Timesheet update", "Hours recorded and named", "Tracker fixes".
 * Time spent updating the tracker is left out at measurement and the
 * labeller is told never to write such a row; this is the safety net under
 * both, so one never reaches a client - or the hour budget - whatever an
 * older month holds.
 */
const TRACKER_ROW =
  /\b(?:time\s*sheet|time[\s-]*track(?:er|ing)?|tracker|hours\s+(?:recorded|named|logged|labell?ed)|(?:recorded|named)\s+and\s+(?:named|recorded))\b/i;

export function isTrackerRow(name) {
  return TRACKER_ROW.test(name);
}

/**
 * Drop the timesheet rows from each day and keep the day's total equal to
 * the rows that remain. A day with nothing else in it is dropped whole: the
 * client did not buy an hour of bookkeeping.
 */
export function withoutTrackerRows(days) {
  const kept = [];
  for (const day of days) {
    const tasks = day.tasks.filter((task) => !isTrackerRow(task.name));
    if (tasks.length === day.tasks.length) {
      kept.push(day);
      continue;
    }
    if (tasks.length === 0) continue;
    kept.push({ ...day, tasks, seconds: tasks.reduce((sum, task) => sum + task.seconds, 0) });
  }
  return kept;
}
