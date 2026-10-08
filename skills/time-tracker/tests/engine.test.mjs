// Tests for the pure parts of the time-tracker engine.
//
//   node --test skills/time-tracker/tests/
//
// Nothing here touches a real project: the engine is imported straight from
// the templates, and the one test that reads files builds its transcripts in a
// temporary folder.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  buildBlocks,
  mergeBlocks,
  subtractBlocks,
  totalSeconds,
  uncoveredSeconds,
} from "../templates/tracking/engine/blocks.mjs";
import { monthFileIds, personFileIds, splitFileId } from "../templates/tracking/engine/config.mjs";
import {
  cutHoles,
  dayNeeds,
  isTrackerPrompt,
  overlapCover,
  readPrompts,
  readTimestamps,
  trackerStretches,
} from "../templates/tracking/engine/collect.mjs";
import { lastCommit } from "../templates/tracking/engine/log.mjs";
import { entryProblem, findManualOwner, parseHours } from "../templates/tracking/engine/manual.mjs";
import {
  IN_PROGRESS,
  UNLABELLED,
  addManualTask,
  measuredSeconds,
  overlapRoom,
  parseMonthFile,
  rebuild,
  removeManualTask,
  renderMonthFile,
  setManualTask,
} from "../templates/tracking/engine/month-file.mjs";
import {
  isTrackerRow,
  manualTag,
  mergeDays,
  personalDays,
  typeRollup,
  withoutTrackerRows,
} from "../templates/tracking/engine/report.mjs";
import { legacyMoves, withTrackerHooks } from "../scripts/setup.mjs";
import { engineDrift } from "../scripts/check.mjs";
import {
  budgetFrom,
  recordedDays,
  roomProblem,
  weekOf,
} from "../templates/tracking/engine/budget.mjs";
import { promptExempt } from "../templates/tracking/engine/hooks.mjs";

const DAY = "2026-09-14";
const TODAY = "2026-09-30";
const T0 = Date.parse(`${DAY}T09:00:00Z`);
const MINUTE = 60 * 1000;

function block(startMinutes, endMinutes, day = DAY) {
  return { day, start: T0 + startMinutes * MINUTE, end: T0 + endMinutes * MINUTE };
}

function namedDay(seconds, tasks) {
  return { date: DAY, seconds, tasks: tasks.map(([name, s]) => ({ name, seconds: s })) };
}

// --- blocks ----------------------------------------------------------------

test("subtractBlocks cuts the covered parts out and keeps the day", () => {
  const pieces = subtractBlocks([block(0, 60)], [block(10, 20), block(15, 30), block(50, 70)]);
  assert.deepEqual(pieces, [block(0, 10), block(30, 50)]);
});

test("uncoveredSeconds counts only what the cover misses", () => {
  assert.equal(uncoveredSeconds([block(0, 60)], [block(0, 60)]), 0);
  assert.equal(uncoveredSeconds([block(0, 60)], []), 3600);
  assert.equal(uncoveredSeconds([block(0, 60), block(30, 90)], [block(45, 75)]), 3600);
});

// --- rebuild ---------------------------------------------------------------

test("a fully named past day that grows gets an Unlabelled row for the difference", () => {
  const existing = { month: "2026-09", days: [namedDay(5 * 3600, [["Checkout", 3 * 3600], ["Emails", 2 * 3600]])] };
  const measured = [{ date: DAY, blocks: [block(0, 8 * 60)] }];
  const { days } = rebuild(existing, "2026-09", measured, TODAY, 20, 1);

  assert.equal(days.length, 1);
  assert.equal(days[0].seconds, 8 * 3600);
  assert.deepEqual(days[0].tasks, [
    { name: "Checkout", seconds: 3 * 3600 },
    { name: "Emails", seconds: 2 * 3600 },
    { name: UNLABELLED, seconds: 3 * 3600 },
  ]);
});

test("a fully named past day within a minute of its record is left alone", () => {
  const existing = { month: "2026-09", days: [namedDay(5 * 3600, [["Checkout", 5 * 3600]])] };
  const measured = [{ date: DAY, blocks: [block(0, 5 * 60), block(5 * 60, 5 * 60 + 0.5)] }];
  const { days } = rebuild(existing, "2026-09", measured, TODAY, 20, 1);
  assert.equal(days[0].seconds, 5 * 3600);
  assert.deepEqual(days[0].tasks, [{ name: "Checkout", seconds: 5 * 3600 }]);
});

test("a fully named past day that measures lower keeps its recorded total", () => {
  const existing = { month: "2026-09", days: [namedDay(5 * 3600, [["Checkout", 5 * 3600]])] };
  const measured = [{ date: DAY, blocks: [block(0, 90)] }];
  const warn = console.warn;
  console.warn = () => {};
  try {
    const { days } = rebuild(existing, "2026-09", measured, TODAY, 20, 1);
    assert.equal(days[0].seconds, 5 * 3600);
    assert.deepEqual(days[0].tasks, [{ name: "Checkout", seconds: 5 * 3600 }]);
  } finally {
    console.warn = warn;
  }
});

test("main-session time takes the main multiplier, agent-only time the subagent one", () => {
  const mainBlocks = [block(0, 60)];
  const allBlocks = mergeBlocks([...mainBlocks, block(120, 150)]);
  const measured = [
    { date: DAY, blocks: mainBlocks, unscaledSeconds: uncoveredSeconds(allBlocks, mainBlocks) },
  ];
  const { days } = rebuild(null, "2026-09", measured, TODAY, 20, 1.5, 1.2);
  // 60 min x 1.5 = 90 min, plus 30 min of agent work x 1.2 = 36 min.
  assert.equal(days[0].seconds, 90 * 60 + 36 * 60);
  assert.equal(measuredSeconds(measured[0], 1.5, 1.2), 126 * 60);
});

test("agent time fully inside a main block adds nothing", () => {
  const mainBlocks = [block(0, 60)];
  const allBlocks = mergeBlocks([...mainBlocks, block(10, 40)]);
  const measured = [
    { date: DAY, blocks: mainBlocks, unscaledSeconds: uncoveredSeconds(allBlocks, mainBlocks) },
  ];
  const { days } = rebuild(null, "2026-09", measured, TODAY, 20, 1.5);
  assert.equal(days[0].seconds, 90 * 60);
});

// --- work types and manual hours -------------------------------------------

const TYPED_FILE = `# Time tracking - 2026-09

Total: 6h 30m across 1 tracked day.

## 2026-09-14 (Mon) - 6h 30m

| Task | Type | Time |
| ---- | ---- | ---- |
| Checkout form validation | Development | 3h 30m |
| Checkout screens in Figma | Design · manual | 3h |

- Checkout form validation
  - Clear error messages on every field
- Checkout screens in Figma
  - Mobile and desktop checkout layouts
`;

function manualRow(name, seconds, type = "Design") {
  return { name, type, manual: true, seconds };
}

test("an old two-column file parses untyped and re-renders with a Type column", () => {
  const old = [
    "# Time tracking - 2026-09",
    "",
    "## 2026-09-14 (Mon) - 2h",
    "",
    "| Task | Time |",
    "| ---- | ---- |",
    "| Checkout | 2h |",
    "",
  ].join("\n");
  const parsed = parseMonthFile(old);
  assert.deepEqual(parsed.days[0].tasks, [{ name: "Checkout", type: null, manual: false, seconds: 7200 }]);
  assert.match(renderMonthFile(parsed), /\| Task \| Type \| Time \|\n\| ---- \| ---- \| ---- \|\n\| Checkout \| - \| 2h \|/);
});

test("a typed file with a manual row round-trips byte for byte", () => {
  const parsed = parseMonthFile(TYPED_FILE);
  assert.deepEqual(
    parsed.days[0].tasks.map(({ name, type, manual }) => ({ name, type, manual })),
    [
      { name: "Checkout form validation", type: "Development", manual: false },
      { name: "Checkout screens in Figma", type: "Design", manual: true },
    ],
  );
  assert.equal(renderMonthFile(parsed), TYPED_FILE);
});

test("a re-measure leaves manual rows alone and counts them on top", () => {
  const existing = {
    month: "2026-09",
    days: [{ date: DAY, seconds: 5 * 3600, tasks: [{ name: "Checkout", type: "Development", seconds: 2 * 3600 }, manualRow("Figma", 3 * 3600)] }],
  };
  const measured = [{ date: DAY, blocks: [block(0, 4 * 60)] }];
  const { days } = rebuild(existing, "2026-09", measured, TODAY, 20, 1);
  assert.equal(days[0].seconds, 4 * 3600 + 3 * 3600);
  assert.deepEqual(days[0].tasks, [
    { name: "Checkout", type: "Development", seconds: 2 * 3600 },
    { name: UNLABELLED, seconds: 2 * 3600 },
    manualRow("Figma", 3 * 3600),
  ]);
});

test("a fully named past day with manual hours does not grow an Unlabelled row", () => {
  const existing = {
    month: "2026-09",
    days: [{ date: DAY, seconds: 5 * 3600, tasks: [{ name: "Checkout", type: "Development", seconds: 2 * 3600 }, manualRow("Figma", 3 * 3600)] }],
  };
  const measured = [{ date: DAY, blocks: [block(0, 2 * 60)] }];
  const { days } = rebuild(existing, "2026-09", measured, TODAY, 20, 1);
  assert.deepEqual(days, existing.days);
});

test("a manual-only day survives a collect with no evidence for it", () => {
  const existing = { month: "2026-09", days: [{ date: DAY, seconds: 3 * 3600, tasks: [manualRow("Paper sketches", 3 * 3600)] }] };
  const { days } = rebuild(existing, "2026-09", [], TODAY, 20, 2);
  assert.deepEqual(days, existing.days);
});

test("the multiplier scales measured time, never manual hours", () => {
  const existing = { month: "2026-09", days: [{ date: TODAY, seconds: 3600, tasks: [manualRow("Figma", 3600)] }] };
  const measured = [{ date: TODAY, blocks: [block(0, 60, TODAY)] }];
  const { days } = rebuild(existing, "2026-09", measured, TODAY, 20, 2);
  // An hour measured counts as two; the hour logged by hand stays one.
  assert.equal(days[0].seconds, 3 * 3600);
  assert.deepEqual(days[0].tasks, [{ name: IN_PROGRESS, seconds: 2 * 3600 }, manualRow("Figma", 3600)]);
});

test("adding, changing and removing a manual row moves the day total with it", () => {
  let file = parseMonthFile(TYPED_FILE);
  file = addManualTask(file, DAY, { name: "Onboarding sketch", type: "Design", seconds: 1800 });
  assert.equal(file.days[0].seconds, 7 * 3600);
  assert.throws(() => addManualTask(file, DAY, { name: "Onboarding sketch", type: "Design", seconds: 60 }), /already has/);

  file = setManualTask(file, DAY, "Onboarding sketch", { seconds: 3600, type: "Research" });
  assert.equal(file.days[0].seconds, 7.5 * 3600);
  assert.equal(file.days[0].tasks.at(-1).type, "Research");

  file = removeManualTask(file, DAY, "Onboarding sketch");
  assert.equal(file.days[0].seconds, 6.5 * 3600);
  assert.throws(() => removeManualTask(file, DAY, "Checkout form validation"), /no manual row/);

  // A day that held only manual time is created by the add and gone with the remove.
  let empty = addManualTask({ month: "2026-09", days: [] }, "2026-09-02", manualRow("Figma", 3600));
  assert.equal(empty.days.length, 1);
  empty = removeManualTask(empty, "2026-09-02", "Figma");
  assert.equal(empty.days.length, 0);
});

test("manual entries are checked against trackFrom, today and the categories", () => {
  const config = { trackFrom: "2026-09-01", categories: ["Design", "Development"] };
  const ok = { date: "2026-09-14", type: "Design", seconds: 3600 };
  assert.equal(entryProblem(ok, config, TODAY), null);
  assert.match(entryProblem({ ...ok, date: "2026-08-31" }, config, TODAY), /before trackFrom/);
  assert.match(entryProblem({ ...ok, date: "2026-10-01" }, config, TODAY), /future/);
  assert.match(entryProblem({ ...ok, type: "Coding" }, config, TODAY), /not a category/);
  assert.match(entryProblem({ ...ok, seconds: null }, config, TODAY), /--hours/);
  assert.match(entryProblem({ ...ok, seconds: 25 * 3600 }, config, TODAY), /--hours/);
});

test("manual hours read as decimals, h/m or bare minutes", () => {
  assert.equal(parseHours("3"), 3 * 3600);
  assert.equal(parseHours("1.5"), 90 * 60);
  assert.equal(parseHours("1h 30m"), 90 * 60);
  assert.equal(parseHours("45m"), 45 * 60);
  assert.equal(parseHours("0"), null);
  assert.equal(parseHours("a few"), null);
});

test("manual log lines leave the commit watermark where it was", () => {
  const entries = [
    { throughCommit: "abc123" },
    { kind: "manual", action: "add", date: DAY, task: "Figma" },
  ];
  assert.equal(lastCommit("nobody", entries), "abc123");
});

test("a named day with no work type needs types, and a placeholder day needs everything", () => {
  assert.deepEqual(dayNeeds({ tasks: [{ name: "Checkout", seconds: 60, details: ["Done"] }] }), ["types"]);
  assert.deepEqual(dayNeeds({ tasks: [{ name: "Checkout", type: "Development", seconds: 60 }] }), ["bullets"]);
  assert.deepEqual(dayNeeds({ tasks: [{ name: UNLABELLED, seconds: 60 }] }), ["names", "bullets", "types"]);
  assert.deepEqual(
    dayNeeds({ tasks: [{ name: "Checkout", type: "Development", seconds: 60, details: ["Done"] }] }),
    [],
  );
});

test("the client merge keeps types apart and marks manual-plus-measured as partly manual", () => {
  const day = (tasks) => ({ date: DAY, seconds: tasks.reduce((sum, task) => sum + task.seconds, 0), tasks });
  const [merged] = mergeDays([
    [day([{ name: "Checkout", type: "Design", seconds: 3600 }, { name: "Pricing", type: "Development", seconds: 1800 }])],
    [day([{ name: "Checkout", type: "Development", seconds: 3600 }, manualRow("Pricing", 1800, "Development")])],
  ]);
  const byKey = Object.fromEntries(merged.tasks.map((task) => [`${task.name}/${task.type}`, task]));
  assert.equal(merged.tasks.length, 3);
  assert.equal(byKey["Checkout/Design"].seconds, 3600);
  assert.equal(byKey["Checkout/Development"].seconds, 3600);
  assert.equal(byKey["Pricing/Development"].seconds, 3600);
  assert.equal(manualTag(byKey["Pricing/Development"]), "Partly manual");
  assert.equal(manualTag(byKey["Checkout/Design"]), null);
  assert.equal(manualTag(manualRow("Figma", 60)), "Manual");

  assert.deepEqual(typeRollup([merged]), [
    { type: "Development", seconds: 7200, manualSeconds: 1800 },
    { type: "Design", seconds: 3600, manualSeconds: 0 },
  ]);
});

test("asking to log manual hours is tracker upkeep, describing other work is not", () => {
  assert.equal(isTrackerPrompt("log manual hours"), true);
  assert.equal(isTrackerPrompt("add manual time: 3h in Figma yesterday"), true);
  assert.equal(isTrackerPrompt("Please log my manual hours"), true);
  assert.equal(isTrackerPrompt("add a manual override to the checkout form"), false);
  assert.equal(isTrackerPrompt("log the hours worked to the console"), false);
});

// --- collect ---------------------------------------------------------------

test("a missing transcript folder reads as empty, not as an error", () => {
  const result = readTimestamps(path.join(tmpdir(), "time-tracker-does-not-exist"), "SENTINEL");
  assert.deepEqual(result.main, []);
  assert.deepEqual(result.all, []);
});

test("isTrackerPrompt matches the request and its typos, not real work", () => {
  for (const text of [
    "update tracker",
    "Update tracker.",
    "update tracking",
    "updatetracking",
    "updat tracker",
    "udpate the tracker",
    "update my timesheet",
    "please update tracker",
    "update timetracker",
    "/time-tracker",
  ]) {
    assert.equal(isTrackerPrompt(text), true, text);
  }
  for (const text of [
    "update the checkout form",
    "update tracker and then fix the login bug",
    "fix the tracker page in the app",
    "what hours have I worked",
  ]) {
    assert.equal(isTrackerPrompt(text), false, text);
  }
});

test("trackerStretches excludes tracker-only sessions whole and stretches in mixed ones", () => {
  const prompts = [
    { at: 100, text: "update tracker", session: "only" },
    { at: 200, text: "updat tracker", session: "only" },
    { at: 100, text: "build the signup page", session: "mixed" },
    { at: 300, text: "update tracker", session: "mixed" },
    { at: 500, text: "now the password reset", session: "mixed" },
    { at: 900, text: "update tracking", session: "mixed" },
  ];
  const exclusions = trackerStretches(prompts);
  assert.deepEqual(exclusions.get("only"), { whole: true, stretches: [] });
  assert.deepEqual(exclusions.get("mixed"), {
    whole: false,
    stretches: [
      { start: 300, end: 500 },
      { start: 900, end: null },
    ],
  });
});

test("readTimestamps reads subagents, skips tracker-only sessions and cuts tracker stretches", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "time-tracker-"));
  try {
    const line = (ms) => `{"type":"user","timestamp":"${new Date(ms).toISOString()}"}\n`;
    const lines = (...minutes) => minutes.map((m) => line(T0 + m * MINUTE)).join("");

    // A working session with a background agent that outlives it.
    writeFileSync(path.join(dir, "work.jsonl"), lines(0, 5, 10));
    mkdirSync(path.join(dir, "work", "subagents"), { recursive: true });
    writeFileSync(path.join(dir, "work", "subagents", "agent-1.jsonl"), lines(5, 25, 40, 60));
    // A session that only ever said "update tracker".
    writeFileSync(path.join(dir, "only.jsonl"), lines(100, 110, 120));
    mkdirSync(path.join(dir, "only", "subagents"), { recursive: true });
    writeFileSync(path.join(dir, "only", "subagents", "agent-2.jsonl"), lines(105, 115));
    // A scheduled automation run, found by its sentinel.
    writeFileSync(path.join(dir, "auto.jsonl"), `{"display":"SENTINEL - label"}\n${lines(200, 210)}`);
    // A mixed session: work, an update, then work again.
    writeFileSync(path.join(dir, "mixed.jsonl"), lines(300, 310, 320, 330, 340));

    const exclusions = trackerStretches([
      { at: T0 + 100 * MINUTE, text: "update tracker", session: "only" },
      { at: T0 + 300 * MINUTE, text: "signup page", session: "mixed" },
      { at: T0 + 315 * MINUTE, text: "update tracker", session: "mixed" },
      { at: T0 + 335 * MINUTE, text: "password reset", session: "mixed" },
    ]);
    const log = console.log;
    console.log = () => {};
    let result;
    try {
      result = readTimestamps(dir, "SENTINEL", exclusions);
    } finally {
      console.log = log;
    }

    const minutes = (list) => [...list].map((ms) => (ms - T0) / MINUTE).sort((a, b) => a - b);
    assert.deepEqual(minutes(result.main), [0, 5, 10, 300, 310, 320, 330, 340]);
    assert.deepEqual(minutes(result.all), [0, 5, 5, 10, 25, 40, 60, 300, 310, 320, 330, 340]);
    assert.deepEqual(result.holes, [
      { session: "mixed", start: T0 + 315 * MINUTE, end: T0 + 335 * MINUTE },
    ]);

    // The stretch is cut out of the block, so the minutes on either side of it
    // still count: 300-315 and 335-340.
    const options = { idleGapMinutes: 20, timeZone: "UTC" };
    const blocks = cutHoles(buildBlocks(result.all, options), result.holes, result.sessions, options);
    const mixed = blocks.filter((b) => b.start >= T0 + 300 * MINUTE);
    assert.equal(totalSeconds(mixed), (15 + 5) * 60);
    // The agent that outlived its parent is in `all` but not in `main`.
    const work = (list) => totalSeconds(buildBlocks(list.filter((ms) => ms < T0 + 100 * MINUTE), options));
    assert.equal(work(result.main), 10 * 60);
    assert.equal(work(result.all), 60 * 60);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an open-ended stretch runs to the end of the session", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "time-tracker-"));
  try {
    const line = (ms) => `{"type":"user","timestamp":"${new Date(ms).toISOString()}"}\n`;
    writeFileSync(path.join(dir, "s.jsonl"), [0, 10, 20, 30].map((m) => line(T0 + m * MINUTE)).join(""));
    const exclusions = trackerStretches([
      { at: T0, text: "signup page", session: "s" },
      { at: T0 + 15 * MINUTE, text: "update tracker", session: "s" },
    ]);
    const result = readTimestamps(dir, "SENTINEL", exclusions);
    assert.deepEqual(result.holes, [{ session: "s", start: T0 + 15 * MINUTE, end: T0 + 30 * MINUTE }]);
    const options = { idleGapMinutes: 20, timeZone: "UTC" };
    const blocks = cutHoles(buildBlocks(result.all, options), result.holes, result.sessions, options);
    assert.equal(totalSeconds(blocks), 15 * 60);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a hole spares another session's concurrent work", () => {
  const options = { idleGapMinutes: 20, timeZone: "UTC" };
  const sessions = new Map([
    ["a", [T0, T0 + 10 * MINUTE, T0 + 40 * MINUTE, T0 + 50 * MINUTE]],
    ["b", [T0 + 15 * MINUTE, T0 + 35 * MINUTE]],
  ]);
  const holes = [{ session: "a", start: T0 + 10 * MINUTE, end: T0 + 40 * MINUTE }];
  const all = [...sessions.values()].flat();
  const blocks = cutHoles(buildBlocks(all, options), holes, sessions, options);
  // 0-10 and 40-50 from session a, 15-35 from session b.
  assert.equal(totalSeconds(blocks), 40 * 60);
});

test("readPrompts carries the session id and keeps to this project", () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "time-tracker-")), "history.jsonl");
  try {
    writeFileSync(
      file,
      [
        JSON.stringify({ display: "update tracker", timestamp: 1, project: "/repo", sessionId: "s1" }),
        JSON.stringify({ display: "elsewhere", timestamp: 2, project: "/other", sessionId: "s2" }),
        JSON.stringify({ display: "old row", timestamp: 3, project: "/repo" }),
        "{truncated",
      ].join("\n"),
    );
    assert.deepEqual(readPrompts(file, "/repo"), [
      { at: 1, text: "update tracker", session: "s1" },
      { at: 3, text: "old row", session: null },
    ]);
  } finally {
    rmSync(path.dirname(file), { recursive: true, force: true });
  }
});

// --- report ----------------------------------------------------------------

test("a day whose only row is timesheet work gets no row and no day on the PDF", () => {
  assert.equal(isTrackerRow("Timesheet update"), true);
  assert.equal(isTrackerRow("Hours recorded and named"), true);
  assert.equal(isTrackerRow("Tracker fixes"), true);
  assert.equal(isTrackerRow("Time tracking review"), true);
  assert.equal(isTrackerRow("Checkout flow"), false);

  const days = withoutTrackerRows([namedDay(1800, [["Timesheet update", 1800]])]);
  assert.deepEqual(days, []);
});

test("a mixed day's PDF total equals its visible rows", () => {
  const days = withoutTrackerRows([
    namedDay(4 * 3600, [["Checkout", 3 * 3600], ["Timesheet corrected", 3600]]),
    namedDay(2 * 3600, [["Emails", 2 * 3600]]),
  ]);
  assert.equal(days.length, 2);
  assert.deepEqual(days[0].tasks, [{ name: "Checkout", seconds: 3 * 3600 }]);
  assert.equal(days[0].seconds, days[0].tasks.reduce((sum, task) => sum + task.seconds, 0));
  assert.equal(days[0].seconds, 3 * 3600);
  assert.equal(days[1].seconds, 2 * 3600);
});

// --- one timesheet per computer --------------------------------------------

function range(startMinutes, endMinutes) {
  return { start: T0 + startMinutes * MINUTE, end: T0 + endMinutes * MINUTE };
}

function covered(cover) {
  return totalSeconds(subtractBlocks([block(0, 24 * 60)], [])) - totalSeconds(subtractBlocks([block(0, 24 * 60)], cover));
}

test("a computer leaves out what an earlier-sorting computer counted", () => {
  // laptop sorts after desk: it drops desk's 10:00-11:00 even having recorded it.
  const cover = overlapCover("laptop", [range(60, 120)], [{ machine: "desk", ranges: [range(60, 120)] }]);
  assert.equal(covered(cover), 3600);
});

test("a computer keeps what it recorded first when the other sorts later", () => {
  // desk recorded 10:00-11:00 before laptop did: tie or not, desk keeps it.
  assert.deepEqual(overlapCover("desk", [range(60, 120)], [{ machine: "laptop", ranges: [range(60, 120)] }]), []);
  // ...but leaves out laptop's stretch it had not recorded itself.
  const cover = overlapCover("desk", [range(60, 120)], [{ machine: "laptop", ranges: [range(90, 180)] }]);
  assert.equal(covered(cover), 3600);
});

test("overlap only comes out of unnamed time", () => {
  const named = { date: DAY, seconds: 3 * 3600, tasks: [{ name: "Checkout", seconds: 2 * 3600 }, { name: UNLABELLED, seconds: 3600 }] };
  assert.equal(overlapRoom(named, 3 * 3600), 3600);
  assert.equal(overlapRoom({ ...named, tasks: [{ name: "Checkout", seconds: 3 * 3600 }] }, 3 * 3600), 0);
  // Manual rows are not measured, so they never make room.
  assert.equal(overlapRoom({ date: DAY, seconds: 3600, tasks: [manualRow("Figma", 3600)] }, 1800), 1800);
  assert.equal(overlapRoom(undefined, 5400), 5400);
});

test("rebuild takes overlap off the unnamed tail and leaves named rows", () => {
  const existing = { month: "2026-09", days: [namedDay(4 * 3600, [["Checkout", 2 * 3600], [UNLABELLED, 2 * 3600]])] };
  const measured = [{ date: DAY, blocks: [block(0, 4 * 60)], overlapSeconds: 3600 }];
  const { days } = rebuild(existing, "2026-09", measured, TODAY, 20, 1);
  assert.equal(days[0].seconds, 3 * 3600);
  assert.deepEqual(days[0].tasks, [{ name: "Checkout", seconds: 2 * 3600 }, { name: UNLABELLED, seconds: 3600 }]);
});

test("a day counted wholly on another computer keeps only its manual rows", () => {
  const existing = { month: "2026-09", days: [{ date: TODAY, seconds: 2 * 3600, tasks: [{ name: IN_PROGRESS, seconds: 3600 }, manualRow("Figma", 3600)] }] };
  const measured = [{ date: TODAY, blocks: [block(0, 60, TODAY)], overlapSeconds: 3600 }];
  const { days } = rebuild(existing, "2026-09", measured, TODAY, 20, 1);
  assert.deepEqual(days, [{ date: TODAY, seconds: 3600, tasks: [manualRow("Figma", 3600)] }]);
  const { days: none } = rebuild(null, "2026-09", measured, TODAY, 20, 1);
  assert.deepEqual(none, []);
});

test("a person's computers merge into one personal timesheet", () => {
  const desk = [{ date: DAY, seconds: 3600, tasks: [{ name: "Checkout", type: "Development", seconds: 3600 }] }];
  const laptop = [{ date: DAY, seconds: 1800, tasks: [{ name: "Checkout", type: "Development", seconds: 1800 }] }];
  const [day] = personalDays([{ id: "ann.desk", days: desk }, { id: "ann.laptop", days: laptop }], "ann.desk");
  assert.equal(day.seconds, 5400);
  assert.equal(day.tasks.length, 1);
  assert.equal(day.tasks[0].seconds, 5400);
  // One computer passes through untouched.
  assert.equal(personalDays([{ id: "ann.desk", days: desk }], "ann.desk"), desk);
});

test("a day unnamed on another computer blocks the personal PDF and names that computer", () => {
  const laptop = [{ date: DAY, seconds: 1800, tasks: [{ name: UNLABELLED, seconds: 1800 }] }];
  assert.throws(
    () => personalDays([{ id: "ann.desk", days: [] }, { id: "ann.laptop-1a2b", days: laptop }], "ann.desk"),
    /2026-09-14 on laptop-1a2b/,
  );
  // This computer's own unnamed day is left for the usual check.
  assert.doesNotThrow(() => personalDays([{ id: "ann.desk", days: laptop }], "ann.desk"));
});

test("timesheets are found per person and per computer, legacy ones included", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "time-tracker-ids-"));
  try {
    for (const name of ["2026-10.ann.md", "2026-10.ann.lap-1a2b.md", "2026-10.bob.desk-9f9f.md", "2026-10.ann.pdf", "2026-09.ann.md"]) {
      writeFileSync(path.join(dir, name), "");
    }
    assert.deepEqual(monthFileIds("2026-10", dir), ["ann", "ann.lap-1a2b", "bob.desk-9f9f"]);
    assert.deepEqual(personFileIds("2026-10", "ann", dir), ["ann", "ann.lap-1a2b"]);
    assert.deepEqual(splitFileId("ann.lap-1a2b"), { person: "ann", machine: "lap-1a2b" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the first computer upgraded takes the older timesheet, a later one does not", () => {
  const legacy = ["2026-09.ann.md", "2026-09.ann.pdf", "log.ann.jsonl", "2026-09.bob.md", "config.json"];
  assert.deepEqual(legacyMoves(legacy, "ann", "desk-1a2b"), {
    moves: [
      ["2026-09.ann.md", "2026-09.ann.desk-1a2b.md"],
      ["log.ann.jsonl", "log.ann.desk-1a2b.jsonl"],
    ],
    blocked: false,
  });
  assert.deepEqual(legacyMoves([...legacy, "2026-10.ann.lap-9f9f.md"], "ann", "desk-1a2b"), { moves: [], blocked: true });
  // Re-running on the computer that took it moves nothing more.
  assert.deepEqual(legacyMoves(["2026-09.ann.desk-1a2b.md", "log.ann.desk-1a2b.jsonl"], "ann", "desk-1a2b"), {
    moves: [],
    blocked: false,
  });
});

test("a manual row is found on whichever of the person's computers holds it", () => {
  const files = [
    { id: "ann.desk", file: { days: [{ date: DAY, tasks: [{ name: "Figma", seconds: 60 }] }] } },
    { id: "ann.laptop", file: { days: [{ date: DAY, tasks: [manualRow("Figma", 60)] }] } },
  ];
  assert.equal(findManualOwner(files, DAY, "Figma"), "ann.laptop");
  assert.equal(findManualOwner(files, DAY, "Sketches"), null);
});

// --- the hour budget -------------------------------------------------------

const HOUR = 3600;
const BUDGET = { monthlyHours: 160 };

test("a week runs Monday to Sunday, across a month's edge", () => {
  assert.deepEqual(weekOf("2026-10-01"), { start: "2026-09-28", end: "2026-10-04" });
  assert.deepEqual(weekOf("2026-10-05"), { start: "2026-10-05", end: "2026-10-11" });
  assert.deepEqual(weekOf("2026-10-11"), { start: "2026-10-05", end: "2026-10-11" });
});

test("no monthlyHours means no budget", () => {
  assert.equal(budgetFrom(new Map(), {}, "2026-10-05"), null);
  assert.equal(budgetFrom(new Map(), { monthlyHours: null }, "2026-10-05"), null);
});

test("a week gets a quarter of the month, counted across the month's edge", () => {
  // Mon 28 Sep - Sun 4 Oct: September's three days count toward the week, not October.
  const totals = new Map([
    ["2026-09-28", 15 * HOUR],
    ["2026-09-30", 15 * HOUR],
    ["2026-10-01", 6 * HOUR],
  ]);
  const budget = budgetFrom(totals, BUDGET, "2026-10-01");
  assert.equal(budget.week.cap, 40 * HOUR);
  assert.equal(budget.week.used, 36 * HOUR);
  assert.equal(budget.month.used, 6 * HOUR);
  assert.equal(budget.left, 4 * HOUR);
  assert.equal(budget.exhausted, false);
  assert.deepEqual(budget.over, []);
});

test("a used-up week closes until next Monday", () => {
  const totals = new Map([["2026-10-06", 25 * HOUR], ["2026-10-07", 16 * HOUR]]);
  const budget = budgetFrom(totals, BUDGET, "2026-10-07");
  assert.equal(budget.exhausted, true);
  assert.deepEqual(budget.over, ["week"]);
  assert.equal(budget.reopens, "2026-10-12");
});

test("in a five-week month the month's cap closes the last week early", () => {
  // Four full weeks of 40h in October leave nothing for 26-31 Oct.
  const totals = new Map([
    ["2026-10-01", 40 * HOUR],
    ["2026-10-08", 40 * HOUR],
    ["2026-10-15", 40 * HOUR],
    ["2026-10-22", 40 * HOUR],
  ]);
  const budget = budgetFrom(totals, BUDGET, "2026-10-27");
  assert.equal(budget.week.used, 0);
  assert.equal(budget.month.left, 0);
  assert.equal(budget.exhausted, true);
  assert.equal(budget.reopens, "2026-11-01");
});

test("every person's timesheet counts toward the one budget", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "time-tracker-budget-"));
  try {
    const month = (days) =>
      renderMonthFile({ month: "2026-10", days: days.map(([date, seconds]) => ({ date, seconds, tasks: [{ name: "Work", type: "Development", seconds }] })) });
    writeFileSync(path.join(dir, "2026-10.ann.desk-1a2b.md"), month([["2026-10-05", 10 * HOUR]]));
    writeFileSync(path.join(dir, "2026-10.bob.lap-9f9f.md"), month([["2026-10-05", 5 * HOUR], ["2026-10-06", 2 * HOUR]]));
    const onDisk = recordedDays(["2026-10"], { dir });
    assert.equal(onDisk.get("2026-10-05"), 15 * HOUR);
    assert.equal(onDisk.get("2026-10-06"), 2 * HOUR);

    // A computer's freshly measured month replaces what its file says.
    const fresh = { id: "ann.desk-1a2b", months: new Map([["2026-10", { month: "2026-10", days: [{ date: "2026-10-05", seconds: 12 * HOUR, tasks: [] }] }]]) };
    assert.equal(recordedDays(["2026-10"], { dir, fresh }).get("2026-10-05"), 17 * HOUR);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("manual hours that would go over the budget are refused, shorter ones fit", () => {
  const budget = budgetFrom(new Map([["2026-10-05", 38 * HOUR]]), BUDGET, "2026-10-06");
  assert.equal(roomProblem(budget, 2 * HOUR), null);
  assert.match(roomProblem(budget, 3 * HOUR), /only 2h of the hour budget is left/);
  // Shortening a row always goes through, even over budget.
  const over = budgetFrom(new Map([["2026-10-05", 45 * HOUR]]), BUDGET, "2026-10-06");
  assert.equal(roomProblem(over, -HOUR), null);
});

test("tracker requests and the override get past a used-up budget, work does not", () => {
  assert.equal(promptExempt("update tracker", {}), true);
  assert.equal(promptExempt("log manual hours: 2h in Figma", {}), true);
  assert.equal(promptExempt("fix the checkout bug", {}), false);
  assert.equal(promptExempt("fix the checkout bug", { TIME_TRACKER_OVERRIDE: "1" }), true);
});

test("setup's hooks replace its own, keep everyone else's, and settle", () => {
  const settings = {
    permissions: { allow: ["Bash(ls)"] },
    hooks: {
      SessionStart: [
        { hooks: [{ type: "command", command: "node project-management/tracking/engine/session-start.mjs" }] },
        { matcher: "startup", hooks: [{ type: "command", command: "echo hello" }] },
      ],
    },
  };
  const once = withTrackerHooks(settings, "project-management/tracking/engine");
  assert.deepEqual(once.permissions, settings.permissions);
  assert.deepEqual(once.hooks.SessionStart, [
    { matcher: "startup", hooks: [{ type: "command", command: "echo hello" }] },
    { hooks: [{ type: "command", command: 'node "$CLAUDE_PROJECT_DIR/project-management/tracking/engine/hooks.mjs" session-start' }] },
  ]);
  assert.match(once.hooks.SessionEnd[0].hooks[0].command, /hooks\.mjs" session-end$/);
  assert.match(once.hooks.UserPromptSubmit[0].hooks[0].command, /hooks\.mjs" prompt$/);
  assert.deepEqual(withTrackerHooks(once, "project-management/tracking/engine"), once);
});

// --- check time tracker ----------------------------------------------------

test("checking or updating the tracker's setup is upkeep, not work", () => {
  for (const prompt of [
    "check time tracker",
    "Check the time tracker.",
    "update time tracker setup",
    "upgrade my time-tracker setup",
    "set up time tracking",
  ]) {
    assert.equal(isTrackerPrompt(prompt), true, prompt);
  }
  for (const prompt of ["check the checkout tracker bug", "update time tracker setup and fix the login"]) {
    assert.equal(isTrackerPrompt(prompt), false, prompt);
  }
});

test("engineDrift lists changed, missing and left-over engine files", () => {
  const root = mkdtempSync(path.join(tmpdir(), "time-tracker-drift-"));
  try {
    const templates = path.join(root, "templates");
    const engine = path.join(root, "engine");
    mkdirSync(templates);
    mkdirSync(engine);
    for (const name of ["a.mjs", "b.mjs", "c.mjs"]) writeFileSync(path.join(templates, name), name);
    for (const name of ["a.mjs", "b.mjs", "c.mjs"]) writeFileSync(path.join(engine, name), name);
    assert.deepEqual(engineDrift(templates, engine), { changed: [], missing: [], extra: [] });

    writeFileSync(path.join(engine, "b.mjs"), "edited");
    rmSync(path.join(engine, "c.mjs"));
    writeFileSync(path.join(engine, "track.mjs"), "old");
    assert.deepEqual(engineDrift(templates, engine), { changed: ["b.mjs"], missing: ["c.mjs"], extra: ["track.mjs"] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
