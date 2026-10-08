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
  attachSessions,
  buildBlocks,
  mergeBlocks,
  subtractBlocks,
  totalSeconds,
  uncoveredSeconds,
} from "../templates/tracking/engine/blocks.mjs";
import {
  computerLabel,
  historyPaths,
  monthFileIds,
  transcriptDirs,
} from "../templates/tracking/engine/config.mjs";
import {
  cutHoles,
  dayNeeds,
  isTrackerPrompt,
  readPrompts,
  readTimestamps,
  sessionLabel,
  sessionLabels,
  spanProblems,
  trackerStretches,
} from "../templates/tracking/engine/collect.mjs";
import { lastCommit, parseReflog } from "../templates/tracking/engine/log.mjs";
import { entryProblem, findManualOwner, parseHours } from "../templates/tracking/engine/manual.mjs";
import {
  FALLBACK_NAME,
  IN_PROGRESS,
  UNLABELLED,
  addManualTask,
  measuredSeconds,
  parseMonthFile,
  rebuild,
  removeManualTask,
  renderMonthFile,
  scaleManual,
  setManualTask,
} from "../templates/tracking/engine/month-file.mjs";
import {
  groupByType,
  isTrackerRow,
  manualTag,
  mergeDays,
  plan,
  presentDays,
  renderHtml,
  spanText,
  statsFor,
  typeRollup,
  weekLabel,
  withoutTrackerRows,
} from "../templates/tracking/engine/report.mjs";
import { firstWeekStart, legacyMoves, legacyPersonFor, withTrackerHooks } from "../scripts/setup.mjs";
import { engineDrift, timesheetNames } from "../scripts/check.mjs";
import {
  budgetFrom,
  recordedDays,
  roomProblem,
  weekOf,
  weekRows,
  weeksOverlapping,
} from "../templates/tracking/engine/budget.mjs";
import { CACHE_DIR, TRACKING_DIR } from "../templates/tracking/engine/config.mjs";
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

| Task | Type | When | Session | Time |
| ---- | ---- | ---- | ------- | ---- |
| Checkout form validation | Development | 09:10-11:20, 13:00-13:40 | 4c11d0a2 | 3h 30m |
| Checkout screens in Figma | Design · manual | - | - | 3h |

- Checkout form validation
  - Clear error messages on every field
- Checkout screens in Figma
  - Mobile and desktop checkout layouts

> Sessions
> 4c11d0a2 · fix checkout validation bug
`;

function manualRow(name, seconds, type = "Design") {
  return { name, type, manual: true, seconds };
}

test("an old two-column file parses untyped and re-renders with every column", () => {
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
  assert.match(
    renderMonthFile(parsed),
    /\| Task \| Type \| When \| Session \| Time \|\n\| ---- \| ---- \| ---- \| ------- \| ---- \|\n\| Checkout \| - \| - \| - \| 2h \|/,
  );
  // A three-column file, from before times and sessions, parses with its type.
  const typed = parseMonthFile(old.replace("| Task | Time |", "| Task | Type | Time |").replace("| Checkout | 2h |", "| Checkout | Design | 2h |"));
  assert.deepEqual(typed.days[0].tasks, [{ name: "Checkout", type: "Design", manual: false, seconds: 7200 }]);
});

test("a file with times, sessions, a legend and a manual row round-trips byte for byte", () => {
  const parsed = parseMonthFile(TYPED_FILE);
  assert.deepEqual(
    parsed.days[0].tasks.map(({ name, type, manual, when, sessions }) => ({ name, type, manual, when, sessions })),
    [
      {
        name: "Checkout form validation",
        type: "Development",
        manual: false,
        when: [{ start: "09:10", end: "11:20" }, { start: "13:00", end: "13:40" }],
        sessions: ["4c11d0a2"],
      },
      { name: "Checkout screens in Figma", type: "Design", manual: true, when: undefined, sessions: undefined },
    ],
  );
  assert.deepEqual(parsed.days[0].sessions, [{ ref: "4c11d0a2", label: "fix checkout validation bug" }]);
  assert.equal(renderMonthFile(parsed), TYPED_FILE);

  // A scaled manual row keeps the hours given beside the hours recorded.
  const scaled = TYPED_FILE.replace("| Design · manual | - | - | 3h |", "| Research · manual, 2h given | - | - | 3h |");
  const row = parseMonthFile(scaled).days[0].tasks[1];
  assert.deepEqual(row, {
    name: "Checkout screens in Figma",
    type: "Research",
    manual: true,
    seconds: 3 * 3600,
    givenSeconds: 2 * 3600,
    details: ["Mobile and desktop checkout layouts"],
  });
  assert.equal(renderMonthFile(parseMonthFile(scaled)), scaled);
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

test("a re-measure never rescales a manual row - its size was set when it was logged", () => {
  const existing = { month: "2026-09", days: [{ date: TODAY, seconds: 3600, tasks: [manualRow("Figma", 3600)] }] };
  const measured = [{ date: TODAY, blocks: [block(0, 60, TODAY)] }];
  const { days } = rebuild(existing, "2026-09", measured, TODAY, 20, 2);
  // An hour measured counts as two; the older manual row stays as recorded.
  assert.equal(days[0].seconds, 3 * 3600);
  assert.deepEqual(days[0].tasks, [{ name: IN_PROGRESS, seconds: 2 * 3600 }, manualRow("Figma", 3600)]);
});

test("new manual hours are scaled like measured time and keep what was given", () => {
  assert.equal(scaleManual(2 * 3600, 1.5), 3 * 3600);
  assert.equal(scaleManual(50 * 60, 1.5), 75 * 60);
  let file = addManualTask({ month: "2026-09", days: [] }, DAY, {
    name: "Pricing research",
    type: "Research",
    seconds: scaleManual(2 * 3600, 1.5),
    givenSeconds: 2 * 3600,
  });
  assert.equal(file.days[0].seconds, 3 * 3600);
  assert.match(renderMonthFile(file), /\| Pricing research \| Research · manual, 2h given \| - \| - \| 3h \|/);

  // A new --hours re-times it, and turns an older unscaled row into a scaled one.
  file = setManualTask(file, DAY, "Pricing research", { seconds: scaleManual(3600, 1.5), givenSeconds: 3600 });
  assert.equal(file.days[0].seconds, 90 * 60);
  const legacy = { month: "2026-09", days: [{ date: DAY, seconds: 3600, tasks: [manualRow("Figma", 3600)] }] };
  const rescaled = setManualTask(legacy, DAY, "Figma", { seconds: scaleManual(3600, 1.5), givenSeconds: 3600 });
  assert.deepEqual(rescaled.days[0].tasks[0], { ...manualRow("Figma", 90 * 60), givenSeconds: 3600 });
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

test("manual entries are checked against trackFrom, today and a sane length", () => {
  const config = { trackFrom: "2026-09-01" };
  const ok = { date: "2026-09-14", seconds: 3600 };
  assert.equal(entryProblem(ok, config, TODAY), null);
  assert.match(entryProblem({ ...ok, date: "2026-08-31" }, config, TODAY), /before trackFrom/);
  assert.match(entryProblem({ ...ok, date: "2026-10-01" }, config, TODAY), /future/);
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

test("a named day says what it lacks, and a placeholder day needs everything", () => {
  const timed = { when: [{ start: "09:00", end: "10:00" }] };
  const two = ["Done", "Shipped"];
  assert.deepEqual(dayNeeds({ date: DAY, tasks: [{ name: "Checkout", seconds: 60, details: two, ...timed }] }), ["types"]);
  assert.deepEqual(dayNeeds({ date: DAY, tasks: [{ name: "Checkout", type: "Development", seconds: 60, ...timed }] }), ["bullets"]);
  // One bullet is not enough for a measured task; a manual row needs none.
  assert.deepEqual(dayNeeds({ date: DAY, tasks: [{ name: "Checkout", type: "Development", seconds: 60, details: ["Done"], ...timed }] }), ["bullets"]);
  assert.deepEqual(dayNeeds({ date: DAY, tasks: [manualRow("Figma", 60)] }), []);
  assert.deepEqual(dayNeeds({ date: DAY, tasks: [{ name: UNLABELLED, seconds: 60 }] }), ["names", "bullets", "types", "times"]);
  const untimed = { date: DAY, tasks: [{ name: "Checkout", type: "Development", seconds: 60, details: two }] };
  assert.deepEqual(dayNeeds(untimed), ["times"]);
  // Times are only asked while the transcripts are here, and not before full counting began.
  assert.deepEqual(dayNeeds(untimed, { hasEvidence: false }), []);
  assert.deepEqual(dayNeeds(untimed, { timesFrom: "2026-09-28" }), []);
  assert.deepEqual(
    dayNeeds({ date: DAY, tasks: [{ name: "Checkout", type: "Development", seconds: 60, details: two, ...timed }] }),
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

test("turns a finished agent wakes are agent time, not main-session time", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "time-tracker-"));
  try {
    const at = (m) => new Date(T0 + m * MINUTE).toISOString();
    const human = (m, text) =>
      `{"type":"user","message":{"role":"user","content":"${text}"},"origin":{"kind":"human"},"timestamp":"${at(m)}"}\n`;
    const notified = (m) =>
      `{"type":"queue-operation","operation":"enqueue","timestamp":"${at(m)}","content":"<task-notification>\\n<task-id>a1</task-id>"}\n` +
      `{"type":"user","message":{"role":"user","content":"<task-notification>\\n<task-id>a1</task-id>"},"origin":{"kind":"task-notification"},"timestamp":"${at(m)}"}\n`;
    // Transcripts from before Claude Code wrote `origin` carry only the tag.
    const legacyNotified = (m) =>
      `{"type":"user","message":{"role":"user","content":"<task-notification>\\n<task-id>a2</task-id>"},"timestamp":"${at(m)}"}\n`;
    const assistant = (m) => `{"type":"assistant","message":{"content":[]},"timestamp":"${at(m)}"}\n`;
    const toolResult = (m) =>
      `{"type":"user","message":{"role":"user","content":[{"type":"tool_result","content":"ok"}]},"timestamp":"${at(m)}"}\n`;
    const meta = (m) =>
      `{"type":"user","isMeta":true,"message":{"role":"user","content":"Base directory for this skill"},"timestamp":"${at(m)}"}\n`;

    // One prompt starts a background agent and the person walks away. Each
    // time the agent reports back, the main session wakes and runs a turn on
    // its own - 15 minutes apart, inside the idle gap. Then the person returns.
    writeFileSync(
      path.join(dir, "s.jsonl"),
      human(0, "build the footer") +
        assistant(2) +
        notified(15) +
        assistant(16) +
        meta(16) +
        toolResult(17) +
        legacyNotified(30) +
        assistant(31) +
        notified(45) +
        assistant(46) +
        human(50, "looks good, ship it") +
        assistant(52),
    );
    mkdirSync(path.join(dir, "s", "subagents"), { recursive: true });
    writeFileSync(
      path.join(dir, "s", "subagents", "agent-1.jsonl"),
      [2, 10, 15, 22, 30, 38, 45].map((m) => `{"type":"assistant","timestamp":"${at(m)}"}\n`).join(""),
    );

    const result = readTimestamps(dir, "SENTINEL");
    const minutes = (list) => [...list].map((ms) => (ms - T0) / MINUTE).sort((a, b) => a - b);
    assert.deepEqual(minutes(result.main), [0, 2, 50, 52]);
    // The woken turns still count as agent time - only the multiplier differs.
    assert.deepEqual(
      minutes(result.all),
      [0, 2, 2, 10, 15, 15, 15, 16, 16, 17, 22, 30, 30, 31, 38, 45, 45, 45, 46, 50, 52],
    );
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

test("timesheets are found per computer, not-yet-upgraded ones included", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "time-tracker-ids-"));
  try {
    for (const name of ["2026-10.desk-1a2b.md", "2026-10.ann.lap-9f9f.md", "2026-10.desk-1a2b.pdf", "2026-09.desk-1a2b.md"]) {
      writeFileSync(path.join(dir, name), "");
    }
    assert.deepEqual(monthFileIds("2026-10", dir), ["ann.lap-9f9f", "desk-1a2b"]);
    assert.equal(computerLabel("studio-3f9a"), "studio");
    assert.equal(computerLabel("studio"), "studio");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("upgrading renames this computer's files and claims older history only when nobody else has", () => {
  const names = ["2026-09.ann.desk-1a2b.md", "log.ann.desk-1a2b.jsonl", "2026-09.bob.lap-9f9f.md", "2026-09.ann.pdf", "config.json"];
  assert.deepEqual(legacyMoves(names, "desk-1a2b", "ann"), {
    moves: [
      ["2026-09.ann.desk-1a2b.md", "2026-09.desk-1a2b.md"],
      ["log.ann.desk-1a2b.jsonl", "log.desk-1a2b.jsonl"],
    ],
    conflicts: [],
    blocked: false,
  });
  // Files from before computers had names go to the first computer upgraded...
  assert.deepEqual(legacyMoves(["2026-08.ann.md", "log.ann.jsonl"], "desk-1a2b", "ann").moves, [
    ["2026-08.ann.md", "2026-08.desk-1a2b.md"],
    ["log.ann.jsonl", "log.desk-1a2b.jsonl"],
  ]);
  // ...unless another of the person's computers took them first.
  assert.deepEqual(legacyMoves(["2026-08.ann.md", "2026-09.ann.lap-9f9f.md"], "desk-1a2b", "ann"), {
    moves: [],
    conflicts: [],
    blocked: true,
  });
  // The one shared timesheet is claimed only where there is no other.
  assert.deepEqual(legacyMoves(["2026-07.md", "log.jsonl"], "desk-1a2b").moves, [
    ["2026-07.md", "2026-07.desk-1a2b.md"],
    ["log.jsonl", "log.desk-1a2b.jsonl"],
  ]);
  assert.deepEqual(legacyMoves(["2026-07.md", "2026-07.lap-9f9f.md"], "desk-1a2b").moves, []);
  // Two people on one computer both want the same file: neither moves.
  const shared = legacyMoves(["2026-09.ann.desk-1a2b.md", "2026-09.bob.desk-1a2b.md"], "desk-1a2b", "ann");
  assert.deepEqual(shared.moves, []);
  assert.equal(shared.conflicts.length, 2);
  // Re-running after the rename moves nothing.
  assert.deepEqual(legacyMoves(["2026-09.desk-1a2b.md", "log.desk-1a2b.jsonl"], "desk-1a2b", "ann").moves, []);
});

test("the older person is read from this computer's files, else from git email", () => {
  assert.equal(legacyPersonFor(["2026-09.ann.desk-1a2b.md"], "desk-1a2b"), "ann");
  const people = { ann: { emails: ["Ann@Example.com"] } };
  assert.equal(legacyPersonFor(["2026-09.ann.md"], "desk-1a2b", people, "ann@example.com"), "ann");
  assert.equal(legacyPersonFor([], "desk-1a2b", people, "bob@example.com"), null);
  assert.equal(firstWeekStart("2026-10-08"), "2026-09-28");
  assert.equal(firstWeekStart("2026-06-15"), "2026-06-01");
});

test("check names this computer's leftover files and the computers not upgraded", () => {
  assert.deepEqual(
    timesheetNames(["2026-10.ann.desk-1a2b.md", "log.ann.desk-1a2b.jsonl", "2026-10.bob.lap-9f9f.md", "2026-10.desk-1a2b.md"], "desk-1a2b"),
    { own: ["2026-10.ann.desk-1a2b.md", "log.ann.desk-1a2b.jsonl"], others: ["bob.lap-9f9f"] },
  );
});

test("a manual row is found on this computer first, then wherever it is", () => {
  const files = [
    { id: "desk", file: { days: [{ date: DAY, tasks: [{ name: "Figma", seconds: 60 }] }] } },
    { id: "laptop", file: { days: [{ date: DAY, tasks: [manualRow("Figma", 60)] }] } },
  ];
  assert.equal(findManualOwner(files, DAY, "Figma"), "laptop");
  assert.equal(findManualOwner(files, DAY, "Sketches"), null);
});

test("full counting leaves days before fullCountFrom as recorded", () => {
  const existing = { month: "2026-09", days: [namedDay(2 * 3600, [["Checkout", 2 * 3600]])] };
  const measured = [{ date: DAY, blocks: [block(0, 5 * 60)] }];
  const frozen = rebuild(existing, "2026-09", measured, TODAY, 20, 1, 1, { fullCountFrom: "2026-09-28" });
  assert.deepEqual(frozen.days, existing.days);
  // A day after it - or with no record yet - counts in full.
  const counted = rebuild(existing, "2026-09", measured, TODAY, 20, 1, 1, { fullCountFrom: "2026-09-01" });
  assert.equal(counted.days[0].seconds, 5 * 3600);
  const fresh = rebuild(null, "2026-09", measured, TODAY, 20, 1, 1, { fullCountFrom: "2026-09-28" });
  assert.equal(fresh.days[0].seconds, 5 * 3600);
});

// --- sessions and clock times ---------------------------------------------

test("each block learns which sessions it holds and when", () => {
  const sessions = new Map([
    ["aaaa1111-x", [T0 + 50 * MINUTE, T0, T0 + 10 * MINUTE]],
    ["bbbb2222-y", [T0 + 30 * MINUTE, T0 + 40 * MINUTE]],
    ["cccc3333-z", [T0 + 300 * MINUTE]],
  ]);
  const [one] = attachSessions([block(0, 50)], sessions);
  assert.deepEqual(one.sessions, [
    { id: "aaaa1111-x", start: T0, end: T0 + 50 * MINUTE },
    { id: "bbbb2222-y", start: T0 + 30 * MINUTE, end: T0 + 40 * MINUTE },
  ]);
  // A hole cut out of the middle leaves each piece only the sessions it still holds.
  const pieces = attachSessions(subtractBlocks([block(0, 50)], [block(20, 45)]), sessions);
  assert.deepEqual(pieces.map((piece) => piece.sessions.map((session) => session.id)), [["aaaa1111-x"], ["aaaa1111-x"]]);
});

test("a session is labelled by its first real prompt", () => {
  const prompts = [
    { at: 1, text: "update tracker", session: "s1" },
    { at: 2, text: "fix   the checkout | validation bug", session: "s1" },
    { at: 3, text: "and the emails", session: "s1" },
  ];
  const labels = sessionLabels(prompts, new Map([["s1", "ignored"], ["s2", "from the transcript"]]));
  assert.equal(labels.get("s1"), "fix the checkout / validation bug");
  assert.equal(labels.get("s2"), "from the transcript");
  assert.equal(sessionLabel("<command-name>/grill-me</command-name><command-args>the plan</command-args>"), "/grill-me the plan");
  assert.equal(sessionLabel("x".repeat(80)).length, 60);
  assert.equal(sessionLabel("Caveat: the messages below were generated"), null);
});

test("an unnamed row gets the day's times and sessions nobody has named", () => {
  const existing = {
    month: "2026-09",
    days: [
      {
        date: DAY,
        seconds: 2 * 3600,
        tasks: [{ name: "Checkout", type: "Development", seconds: 2 * 3600, when: [{ start: "09:00", end: "11:00" }], sessions: ["aaaa1111"] }],
        sessions: [{ ref: "aaaa1111", label: "checkout" }],
      },
    ],
  };
  const measured = [
    {
      date: DAY,
      blocks: [block(0, 120), block(180, 240)],
      ranges: [
        { start: "09:00", end: "11:00", sessions: ["aaaa1111"] },
        { start: "12:00", end: "13:00", sessions: ["bbbb2222"] },
      ],
      sessions: [{ ref: "aaaa1111", label: "checkout" }, { ref: "bbbb2222", label: "emails" }],
    },
  ];
  const { days } = rebuild(existing, "2026-09", measured, TODAY, 20, 1);
  assert.deepEqual(days[0].tasks[1], { name: UNLABELLED, seconds: 3600, when: [{ start: "12:00", end: "13:00" }], sessions: ["bbbb2222"] });
  assert.deepEqual(days[0].sessions, [{ ref: "aaaa1111", label: "checkout" }, { ref: "bbbb2222", label: "emails" }]);
  assert.deepEqual(spanProblems(days[0], measured[0].ranges, 20), []);
  const slip = { ...days[0], tasks: [{ ...days[0].tasks[0], when: [{ start: "15:00", end: "16:00" }], sessions: ["zzzz9999"] }] };
  assert.equal(spanProblems(slip, measured[0].ranges, 20).length, 2);
});

test("a settled day learns its session legend without its rows changing", () => {
  const existing = { month: "2026-09", days: [namedDay(5 * 3600, [["Checkout", 5 * 3600]])] };
  const measured = [{ date: DAY, blocks: [block(0, 5 * 60)], sessions: [{ ref: "aaaa1111", label: "checkout" }] }];
  const { days } = rebuild(existing, "2026-09", measured, TODAY, 20, 1);
  assert.deepEqual(days[0].tasks, existing.days[0].tasks);
  assert.deepEqual(days[0].sessions, [{ ref: "aaaa1111", label: "checkout" }]);
});

test("commits made here are read from the reflog, others' are not", () => {
  const record = (full, at, reflog, subject) => `\x1e${full}\t${full.slice(0, 7)}\t${at}\t${reflog}\t${subject}\tbody\n`;
  const text = [
    record("f".repeat(40), 500, "commit (amend): Checkout validation", "Checkout validation"),
    record("e".repeat(40), 500, "commit: Checkout validation", "Checkout validation"),
    record("d".repeat(40), 400, "pull: Fast-forward", "Teammate's work"),
    record("c".repeat(40), 300, "checkout: moving from main to feature", "Old"),
    record("b".repeat(40), 200, "commit (merge): Merge branch 'feature'", "Merge branch 'feature'"),
    record("a".repeat(40), 100, "commit (initial): First commit", "First commit"),
    record("9".repeat(40), 50, "cherry-pick: Borrowed", "Borrowed"),
  ].join("");
  assert.deepEqual(
    parseReflog(text).map((commit) => [commit.full[0], commit.subject]),
    [["f", "Checkout validation"], ["b", "Merge branch 'feature'"], ["a", "First commit"]],
  );
});

// --- the PDFs ----------------------------------------------------------------

test("unnamed time shows as research and keeps its hours", () => {
  const day = { date: DAY, seconds: 3 * 3600, tasks: [{ name: "Checkout", type: "Development", seconds: 2 * 3600 }, { name: UNLABELLED, seconds: 3600, when: [{ start: "12:00", end: "13:00" }] }] };
  const { days, unnamed } = presentDays([day]);
  assert.deepEqual(unnamed, [DAY]);
  assert.equal(days[0].seconds, 3 * 3600);
  assert.deepEqual(days[0].tasks[1], { name: FALLBACK_NAME, type: "Research", seconds: 3600, when: [{ start: "12:00", end: "13:00" }], details: [], fallback: true });
  // Two computers' unnamed time is one research row on the client PDF.
  const [merged] = mergeDays([days, presentDays([{ ...day, tasks: [{ name: IN_PROGRESS, seconds: 1800 }], seconds: 1800 }]).days]);
  const research = merged.tasks.find((task) => task.name === FALLBACK_NAME);
  assert.equal(research.seconds, 5400);
  assert.equal(research.when, undefined);
});

test("a day's tasks group by type in the config's order, timed tasks in time order", () => {
  const tasks = [
    { name: "C", type: "Research", seconds: 60 },
    { name: "B", type: "Development", seconds: 60, when: [{ start: "13:00", end: "14:00" }] },
    { name: "A", type: "Development", seconds: 60, when: [{ start: "09:00", end: "10:00" }] },
    { name: "D", type: "Zine", seconds: 60 },
    { name: "E", type: null, seconds: 60 },
  ];
  const groups = groupByType(tasks, ["Design", "Development", "Research"]);
  assert.deepEqual(groups.map((group) => [group.type, group.tasks.map((task) => task.name)]), [
    ["Development", ["A", "B"]],
    ["Research", ["C"]],
    ["Zine", ["D"]],
    [null, ["E"]],
  ]);
});

test("a task's line on the computer's own PDF says when, where and in which session", () => {
  const day = { sessions: [{ ref: "4c11d0a2", label: "fix checkout validation bug" }] };
  assert.equal(
    spanText({ when: [{ start: "09:10", end: "11:20" }], sessions: ["4c11d0a2"] }, day, "studio"),
    '09:10-11:20 · studio · "fix checkout validation bug"',
  );
  assert.equal(spanText({ manual: true, givenSeconds: 3600 }, day, "studio"), "studio · manual, 1h given");
});

test("weeks are whole Monday to Sunday, labelled across month and year edges", () => {
  assert.deepEqual(weeksOverlapping("2026-10").map((week) => week.start), ["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
  assert.equal(weekLabel("2026-10-05", "2026-10-11"), "5 - 11 October 2026");
  assert.equal(weekLabel("2026-09-28", "2026-10-04"), "28 September - 4 October 2026");
  assert.equal(weekLabel("2026-12-28", "2027-01-03"), "28 December 2026 - 3 January 2027");
});

test("a month's week rows count their whole week, future weeks included", () => {
  const totals = new Map([
    ["2026-09-28", 10 * HOUR],
    ["2026-09-30", 14 * HOUR],
    ["2026-10-01", 6 * HOUR],
    ["2026-10-06", 20 * HOUR],
  ]);
  const rows = weekRows(totals, { week: 40 * HOUR, month: 160 * HOUR }, "2026-10", new Map([["2026-10-06", 5 * HOUR]]));
  assert.equal(rows.length, 5);
  assert.deepEqual([rows[0].done, rows[0].left, rows[0].before], [30 * HOUR, 10 * HOUR, { start: "2026-09-28", end: "2026-09-30", seconds: 24 * HOUR }]);
  assert.deepEqual([rows[1].done, rows[1].own, rows[1].left], [20 * HOUR, 5 * HOUR, 20 * HOUR]);
  assert.deepEqual([rows[4].done, rows[4].left, rows[4].after.start], [0, 40 * HOUR, "2026-11-01"]);
  // No budget: the hours, with no cap and nothing left.
  assert.deepEqual([weekRows(totals, null, "2026-10")[1].cap, weekRows(totals, null, "2026-10")[1].left], [null, null]);
});

test("a run on the 1st writes last month too, and one PDF for the whole week", () => {
  const relative = (job) => path.relative(TRACKING_DIR, job.pdf);
  const jobs = plan({ today: "2026-10-01", month: "2026-10", explicit: false, allWeeks: false }, "desk-1a2b");
  assert.deepEqual(jobs.map(relative), [
    "2026-09.desk-1a2b.pdf",
    "2026-10.desk-1a2b.pdf",
    path.join("weekly", "2026-09-28.desk-1a2b.pdf"),
    path.join("client", "2026-09.pdf"),
    path.join("client", "2026-10.pdf"),
    path.join("client", "weekly", "2026-09-28.pdf"),
  ]);
  assert.equal(jobs[2].period, "Week of 28 September - 4 October 2026");
  assert.ok(jobs.every((job) => job.html.startsWith(CACHE_DIR)));
  // Every week begun so far, once each.
  const all = plan({ today: "2026-10-08", month: "2026-10", explicit: false, allWeeks: true }, "desk-1a2b", () => false);
  assert.deepEqual(all.filter((job) => !job.team).map(relative), [
    "2026-10.desk-1a2b.pdf",
    path.join("weekly", "2026-09-28.desk-1a2b.pdf"),
    path.join("weekly", "2026-10-05.desk-1a2b.pdf"),
  ]);
});

test("the stat boxes show done, left and the total, own hours first on a computer's PDF", () => {
  const labels = (stats) => stats.map((entry) => `${entry.value} ${entry.label}`);
  const week = { done: 26.5 * HOUR, cap: 40 * HOUR, left: 13.5 * HOUR };
  assert.deepEqual(labels(statsFor({ kind: "week", own: false, figures: week, total: 26.5 * HOUR, dayCount: 4 })), [
    "26h 30m Done this week",
    "13h 30m Remaining",
    "40h Week total",
  ]);
  assert.deepEqual(labels(statsFor({ kind: "week", own: true, figures: week, total: 18 * HOUR, dayCount: 3 })), [
    "18h This computer",
    "26h 30m of 40h Project done",
    "13h 30m Project left",
  ]);
  assert.deepEqual(
    labels(statsFor({ kind: "month", own: false, figures: { done: 170 * HOUR, cap: 160 * HOUR, left: -10 * HOUR }, total: 170 * HOUR, dayCount: 20 })),
    ["170h Done so far", "10h Over budget by", "160h Month total"],
  );
  assert.deepEqual(labels(statsFor({ kind: "month", own: false, figures: null, total: 10 * HOUR, dayCount: 2 })), [
    "10h Total",
    "2 Tracked days",
    "5h Average day",
  ]);
});

test("the client PDF names no computer and carries no times or sessions", () => {
  const own = [
    {
      date: DAY,
      seconds: 3 * 3600,
      tasks: [
        { name: "Checkout", type: "Development", seconds: 2 * 3600, when: [{ start: "09:10", end: "11:20" }], sessions: ["4c11d0a2"], details: ["Errors on every field", "Card checks"] },
        { name: UNLABELLED, seconds: 3600, when: [{ start: "12:00", end: "13:00" }], sessions: ["9be0f113"] },
      ],
      sessions: [{ ref: "4c11d0a2", label: "fix checkout validation bug" }, { ref: "9be0f113", label: "webhook retries" }],
    },
  ];
  const view = (days, computer) => ({
    project: "acme-shop",
    period: "Week of 14 - 20 September 2026",
    kind: "week",
    today: TODAY,
    days,
    categories: ["Development", "Research"],
    stats: [],
    computer,
    weeks: null,
  });
  const client = renderHtml(view(mergeDays([presentDays(own).days]), null));
  for (const leak of ["studio", "4c11d0a2", "fix checkout", "webhook", "09:10", "12:00"]) {
    assert.equal(client.includes(leak), false, leak);
  }
  assert.match(client, /Research &amp; exploration/);
  const mine = renderHtml(view(presentDays(own).days, "studio"));
  assert.match(mine, /09:10-11:20 · studio · &quot;fix checkout validation bug&quot;/);
  assert.match(mine, /12:00-13:00 · studio · &quot;webhook retries&quot;/);
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

test("every computer's timesheet counts toward the one budget, upkeep rows not at all", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "time-tracker-budget-"));
  try {
    const month = (days) =>
      renderMonthFile({ month: "2026-10", days: days.map(([date, seconds]) => ({ date, seconds, tasks: [{ name: "Work", type: "Development", seconds }] })) });
    writeFileSync(path.join(dir, "2026-10.desk-1a2b.md"), month([["2026-10-05", 10 * HOUR]]));
    writeFileSync(path.join(dir, "2026-10.bob.lap-9f9f.md"), month([["2026-10-05", 5 * HOUR], ["2026-10-06", 2 * HOUR]]));
    writeFileSync(
      path.join(dir, "2026-10.studio-3f9a.md"),
      renderMonthFile({ month: "2026-10", days: [{ date: "2026-10-06", seconds: 2 * HOUR, tasks: [{ name: "Work", type: "Development", seconds: HOUR }, { name: "Timesheet update", seconds: HOUR }] }] }),
    );
    const onDisk = recordedDays(["2026-10"], { dir });
    assert.equal(onDisk.get("2026-10-05"), 15 * HOUR);
    assert.equal(onDisk.get("2026-10-06"), 3 * HOUR);
    assert.equal(recordedDays(["2026-10"], { dir, only: "desk-1a2b" }).get("2026-10-06"), undefined);

    // A computer's freshly measured month replaces what its file says.
    const fresh = { id: "desk-1a2b", months: new Map([["2026-10", { month: "2026-10", days: [{ date: "2026-10-05", seconds: 12 * HOUR, tasks: [] }] }]]) };
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

test("transcripts and prompts are read from ~/.claude, the repo's .claude-local and CLAUDE_CONFIG_DIR", () => {
  const saved = process.env.CLAUDE_CONFIG_DIR;
  try {
    delete process.env.CLAUDE_CONFIG_DIR;
    const dirs = transcriptDirs("/work/my.app");
    assert.equal(dirs.length, 2);
    assert.ok(dirs[0].endsWith(path.join(".claude", "projects", "-work-my-app")));
    assert.equal(dirs[1], path.join("/work/my.app", ".claude-local", "projects", "-work-my-app"));

    // Pointing CLAUDE_CONFIG_DIR at a folder already listed adds nothing.
    process.env.CLAUDE_CONFIG_DIR = "/work/my.app/.claude-local";
    assert.equal(transcriptDirs("/work/my.app").length, 2);

    process.env.CLAUDE_CONFIG_DIR = "/elsewhere";
    assert.equal(historyPaths("/work/my.app").at(-1), path.join("/elsewhere", "history.jsonl"));
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = saved;
  }
});
