// Tests for the pure parts of the time-tracker engine.
//
//   node --test skills/time-tracker/tests/
//
// Nothing here touches a real project: the engine is imported straight from
// the templates, and the one test that reads files builds its transcripts in a
// temporary folder.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
  computerMonths,
  historyPaths,
  logPath,
  monthFileIds,
  monthFilePath,
  tidyOwnStrays,
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
  statsFor,
  typeRollup,
  weekLabel,
  withoutTrackerRows,
} from "../templates/tracking/engine/report.mjs";
import { firstWeekStart, legacyMoves, legacyPersonFor, migrateToFolders, withTrackerHooks } from "../scripts/setup.mjs";
import { engineDrift, flatLeftovers, timesheetNames } from "../scripts/check.mjs";
import {
  blockedMessage,
  budgetFrom,
  capsOn,
  dayCapOn,
  describeBudget,
  exceptionNotes,
  recordedDays,
  roomProblem,
  weekOf,
  weekCaps,
  weekRows,
  weeksOverlapping,
} from "../templates/tracking/engine/budget.mjs";
import { CACHE_DIR, TRACKING_DIR } from "../templates/tracking/engine/config.mjs";
import { promptExempt } from "../templates/tracking/engine/hooks.mjs";
import {
  configCommits,
  configJson,
  effectiveHistory,
  parseLedger,
  rateFor,
  renderLedger,
  seedHistory,
} from "../templates/tracking/engine/rates.mjs";
import { multiplierLines } from "../scripts/check.mjs";

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

/** Write `files` (relative name -> content) under `dir`, making folders as needed. */
function plant(dir, files) {
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), content);
  }
}

/** Every file under `dir`, as sorted relative names. */
function tree(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath ?? entry.path, entry.name)))
    .sort();
}

test("timesheets are found per computer, in its folder or still flat", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "time-tracker-ids-"));
  try {
    plant(dir, {
      "computers/desk-1a2b/2026-10.md": "",
      "computers/desk-1a2b/2026-09.md": "",
      "computers/desk-1a2b/log.jsonl": "",
      // A computer that has not pulled the folders yet, and one older still.
      "2026-10.mini-0c0c.md": "",
      "log.mini-0c0c.jsonl": "",
      "2026-10.ann.lap-9f9f.md": "",
      "2026-10.desk-1a2b.pdf": "",
    });
    assert.deepEqual(monthFileIds("2026-10", dir), ["ann.lap-9f9f", "desk-1a2b", "mini-0c0c"]);
    assert.deepEqual(monthFileIds("2026-09", dir), ["desk-1a2b"]);
    assert.deepEqual(computerMonths("desk-1a2b", dir), ["2026-09", "2026-10"]);
    assert.deepEqual(computerMonths("mini-0c0c", dir), ["2026-10"]);
    // Each is read where it is; a new one goes in the folder.
    assert.equal(path.relative(dir, monthFilePath("2026-10", "desk-1a2b", dir)), path.join("computers", "desk-1a2b", "2026-10.md"));
    assert.equal(path.relative(dir, monthFilePath("2026-10", "mini-0c0c", dir)), "2026-10.mini-0c0c.md");
    assert.equal(path.relative(dir, monthFilePath("2026-11", "mini-0c0c", dir)), path.join("computers", "mini-0c0c", "2026-11.md"));
    assert.equal(path.relative(dir, logPath("mini-0c0c", dir)), "log.mini-0c0c.jsonl");
    assert.equal(path.relative(dir, logPath("desk-1a2b", dir)), path.join("computers", "desk-1a2b", "log.jsonl"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a computer tidies only its own flat files into its folder", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "time-tracker-tidy-"));
  try {
    plant(dir, {
      "2026-09.desk-1a2b.md": "september",
      "2026-10.desk-1a2b.md": "october, flat",
      "computers/desk-1a2b/2026-10.md": "october, newer",
      "log.desk-1a2b.jsonl": '{"at":"1"}\n',
      "computers/desk-1a2b/log.jsonl": '{"at":"2"}\n',
      "2026-10.desk-1a2b.pdf": "",
      "weekly/2026-10-05.desk-1a2b.pdf": "",
      // Another computer's: it is still writing these, so they stay.
      "2026-10.mini-0c0c.md": "theirs",
      "log.mini-0c0c.jsonl": "",
      "weekly/2026-10-05.mini-0c0c.pdf": "",
    });
    const done = tidyOwnStrays("desk-1a2b", dir);
    assert.deepEqual(tree(dir), [
      "2026-10.desk-1a2b.md",
      "2026-10.mini-0c0c.md",
      path.join("computers", "desk-1a2b", "2026-09.md"),
      path.join("computers", "desk-1a2b", "2026-10.md"),
      path.join("computers", "desk-1a2b", "log.jsonl"),
      "log.mini-0c0c.jsonl",
      path.join("weekly", "2026-10-05.mini-0c0c.pdf"),
    ]);
    // The folder's copy wins; a flat one that differs is left for a person.
    assert.deepEqual(done.kept, ["2026-10.desk-1a2b.md"]);
    assert.equal(readFileSync(path.join(dir, "computers/desk-1a2b/2026-10.md"), "utf8"), "october, newer");
    // The flat log is the older one, so it goes first.
    assert.equal(readFileSync(path.join(dir, "computers/desk-1a2b/log.jsonl"), "utf8"), '{"at":"1"}\n{"at":"2"}\n');
    // Run again: nothing more to do.
    assert.deepEqual(tidyOwnStrays("desk-1a2b", dir), { moved: [], deleted: [], kept: ["2026-10.desk-1a2b.md"] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("setup sorts a flat tracking folder into computers/ and reports/", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "time-tracker-folders-"));
  try {
    plant(dir, {
      "config.json": "{}",
      "readme.md": "",
      "engine/config.mjs": "",
      "2026-09.desk-1a2b.md": "a",
      "2026-10.desk-1a2b.md": "b",
      "log.desk-1a2b.jsonl": "",
      "2026-10.desk-1a2b.pdf": "",
      "2026-10.mini-0c0c.md": "c",
      "log.mini-0c0c.jsonl": "",
      "2026-10.mini-0c0c.pdf": "",
      "2026-10.ann.lap-9f9f.md": "older version",
      "weekly/2026-10-05.desk-1a2b.pdf": "",
      "weekly/2026-09/2026-09-28.desk-1a2b.pdf": "",
      "client/2026-10.pdf": "old",
      "client/weekly/2026-10-05.pdf": "",
      "reports/2026-10.pdf": "new",
    });
    migrateToFolders(dir);
    assert.deepEqual(tree(dir), [
      "2026-10.ann.lap-9f9f.md",
      path.join("computers", "desk-1a2b", "2026-09.md"),
      path.join("computers", "desk-1a2b", "2026-10.md"),
      path.join("computers", "desk-1a2b", "log.jsonl"),
      path.join("computers", "mini-0c0c", "2026-10.md"),
      path.join("computers", "mini-0c0c", "log.jsonl"),
      "config.json",
      path.join("engine", "config.mjs"),
      "readme.md",
      path.join("reports", "2026-10.pdf"),
      path.join("reports", "weekly", "2026-10-05.pdf"),
    ]);
    assert.equal(readFileSync(path.join(dir, "reports/2026-10.pdf"), "utf8"), "new");
    assert.ok(!existsSync(path.join(dir, "client")));
    // Sorted already: a second run changes nothing.
    assert.deepEqual(migrateToFolders(dir), { moved: [], deleted: [], kept: [] });
    assert.deepEqual(flatLeftovers(readdirSync(dir)), []);
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
  assert.deepEqual(
    flatLeftovers(["2026-10.desk-1a2b.md", "log.desk-1a2b.jsonl", "2026-10.desk-1a2b.pdf", "weekly", "client", "computers", "reports", "config.json", "2026-10.ann.lap-9f9f.md"]),
    ["2026-10.desk-1a2b.md", "2026-10.desk-1a2b.pdf", "client", "log.desk-1a2b.jsonl", "weekly"],
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
  const rows = weekRows(totals, { week: 40 * HOUR, month: 160 * HOUR }, "2026-10");
  assert.equal(rows.length, 5);
  assert.deepEqual([rows[0].done, rows[0].left, rows[0].before], [30 * HOUR, 10 * HOUR, { start: "2026-09-28", end: "2026-09-30", seconds: 24 * HOUR }]);
  assert.deepEqual([rows[1].done, rows[1].left], [20 * HOUR, 20 * HOUR]);
  assert.deepEqual([rows[4].done, rows[4].left, rows[4].after.start], [0, 40 * HOUR, "2026-11-01"]);
  // No budget: the hours, with no cap and nothing left.
  assert.deepEqual([weekRows(totals, null, "2026-10")[1].cap, weekRows(totals, null, "2026-10")[1].left], [null, null]);
});

test("a run on the 1st writes last month too, and one PDF for the whole week, all in reports/", () => {
  const relative = (job) => path.relative(TRACKING_DIR, job.pdf);
  const jobs = plan({ today: "2026-10-01", month: "2026-10", explicit: false, allWeeks: false });
  assert.deepEqual(jobs.map(relative), [
    path.join("reports", "2026-09.pdf"),
    path.join("reports", "2026-10.pdf"),
    path.join("reports", "weekly", "2026-09-28.pdf"),
  ]);
  assert.equal(jobs[2].period, "Week of 28 September - 4 October 2026");
  assert.ok(jobs.every((job) => job.html.startsWith(CACHE_DIR)));
  // Every week begun so far, once each.
  const all = plan({ today: "2026-10-08", month: "2026-10", explicit: false, allWeeks: true }, () => false);
  assert.deepEqual(all.map(relative), [
    path.join("reports", "2026-10.pdf"),
    path.join("reports", "weekly", "2026-09-28.pdf"),
    path.join("reports", "weekly", "2026-10-05.pdf"),
  ]);
});

test("the stat boxes show done, left and the total", () => {
  const labels = (stats) => stats.map((entry) => `${entry.value} ${entry.label}`);
  const week = { done: 26.5 * HOUR, cap: 40 * HOUR, left: 13.5 * HOUR };
  assert.deepEqual(labels(statsFor({ kind: "week", figures: week, total: 26.5 * HOUR, dayCount: 4 })), [
    "26h 30m Done this week",
    "13h 30m Remaining",
    "40h Week total",
  ]);
  assert.deepEqual(
    labels(statsFor({ kind: "month", figures: { done: 170 * HOUR, cap: 160 * HOUR, left: -10 * HOUR }, total: 170 * HOUR, dayCount: 20 })),
    ["170h Done so far", "10h Over budget by", "160h Month total"],
  );
  assert.deepEqual(labels(statsFor({ kind: "month", figures: null, total: 10 * HOUR, dayCount: 2 })), [
    "10h Total",
    "2 Tracked days",
    "5h Average day",
  ]);
});

test("the PDF names no computer and carries no times or sessions", () => {
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
  const view = (days) => ({
    project: "acme-shop",
    period: "Week of 14 - 20 September 2026",
    kind: "week",
    today: TODAY,
    days,
    categories: ["Development", "Research"],
    stats: [],
    weeks: null,
  });
  const client = renderHtml(view(mergeDays([presentDays(own).days])));
  for (const leak of ["studio", "4c11d0a2", "fix checkout", "webhook", "09:10", "12:00"]) {
    assert.equal(client.includes(leak), false, leak);
  }
  assert.match(client, /Research &amp; exploration/);
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
  const totals = new Map([["2026-10-05", 34 * HOUR], ["2026-10-07", 7 * HOUR]]);
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

test("a budget exception sets the week's cap and can lift the month's, only inside its days", () => {
  const config = {
    ...BUDGET,
    budgetExceptions: [{ from: "2026-10-12", to: "2026-10-31", weeklyHours: 40, monthlyHours: null, note: "From 12 October, 40 hours a week." }],
  };
  // 120h of October recorded before the exception: the month cap still closes 5-11 Oct at 160h...
  const before = new Map([["2026-10-01", 80 * HOUR], ["2026-10-05", 40 * HOUR]]);
  assert.equal(budgetFrom(before, config, "2026-10-08").month.left, 40 * HOUR);
  // ...and from 12 Oct each week has its own 40h with no month cap.
  const totals = new Map([...before, ["2026-10-13", 30 * HOUR]]);
  const budget = budgetFrom(totals, config, "2026-10-14");
  assert.equal(budget.month.cap, null);
  assert.equal(budget.left, 10 * HOUR);
  assert.equal(budget.exhausted, false);
  assert.match(describeBudget(budget), /October: 150h used, no month cap\./);
  // The week crossing into November keeps the exception's cap; November is back to normal.
  assert.deepEqual(capsOn(config, "2026-10-26"), { week: 40 * HOUR, month: null });
  assert.deepEqual(capsOn(config, "2026-11-02"), { week: 40 * HOUR, month: 160 * HOUR });
  assert.equal(budgetFrom(new Map([["2026-11-01", HOUR]]), config, "2026-11-01").month.cap, 160 * HOUR);
  // The weeks table takes each week's own cap.
  const rows = weekRows(totals, weekCaps({ ...config, budgetExceptions: [{ ...config.budgetExceptions[0], weeklyHours: 30 }] }), "2026-10");
  assert.deepEqual(rows.map((row) => row.cap / HOUR), [40, 40, 30, 30, 30]);
  // The note reaches every PDF touching October, not September's.
  assert.deepEqual(exceptionNotes(config, "2026-09-28", "2026-10-04"), ["From 12 October, 40 hours a week."]);
  assert.deepEqual(exceptionNotes(config, "2026-10-01", "2026-10-31"), ["From 12 October, 40 hours a week."]);
  assert.deepEqual(exceptionNotes(config, "2026-09-01", "2026-09-30"), []);
  // A malformed entry is ignored.
  assert.deepEqual(capsOn({ ...BUDGET, budgetExceptions: [{ from: "12 Oct", weeklyHours: 80 }] }, "2026-10-12"), { week: 40 * HOUR, month: 160 * HOUR });
});

test("a weekday gets a fifth of its week, a weekend no day cap", () => {
  assert.equal(dayCapOn(BUDGET, "2026-10-12"), 8 * HOUR);
  assert.equal(dayCapOn(BUDGET, "2026-10-16"), 8 * HOUR);
  assert.equal(dayCapOn(BUDGET, "2026-10-17"), null);
  assert.equal(dayCapOn(BUDGET, "2026-10-18"), null);
  assert.equal(dayCapOn({}, "2026-10-12"), null);
  // dailyHours replaces the fifth, but an exception setting the week's hours wins inside it.
  const config = { ...BUDGET, dailyHours: 6, budgetExceptions: [{ from: "2026-10-19", to: "2026-10-25", weeklyHours: 20 }] };
  assert.equal(dayCapOn(config, "2026-10-12"), 6 * HOUR);
  assert.equal(dayCapOn(config, "2026-10-21"), 4 * HOUR);
  assert.equal(dayCapOn({ ...config, budgetExceptions: [{ from: "2026-10-19", to: "2026-10-25", monthlyHours: null }] }, "2026-10-21"), 6 * HOUR);
});

test("a used-up day pauses prompts until tomorrow, but not manual hours", () => {
  const budget = budgetFrom(new Map([["2026-10-12", 8 * HOUR]]), BUDGET, "2026-10-12");
  assert.deepEqual(budget.today, { date: "2026-10-12", used: 8 * HOUR, cap: 8 * HOUR, left: 0 });
  assert.equal(budget.exhausted, true);
  assert.deepEqual(budget.over, []);
  assert.equal(budget.reopens, "2026-10-13");
  assert.equal(roomProblem(budget, 3 * HOUR), null);
  assert.match(describeBudget(budget), /^Today \(Mon 12 Oct\): 8h of 8h used, 0m left\. This week/);
  assert.match(blockedMessage(budget), /today's hours are used up/);
  assert.match(blockedMessage(budget), /paused until Tue 13 Oct/);
  assert.deepEqual(budgetFrom(new Map([["2026-10-12", 9 * HOUR]]), BUDGET, "2026-10-12").over, ["day"]);
  // Friday used up with the week not: Saturday is open again.
  assert.equal(budgetFrom(new Map([["2026-10-16", 8 * HOUR]]), BUDGET, "2026-10-16").reopens, "2026-10-17");
  // Day and week both used up: next Monday.
  const both = budgetFrom(new Map([["2026-10-12", 32 * HOUR], ["2026-10-16", 8 * HOUR]]), BUDGET, "2026-10-16");
  assert.equal(both.reopens, "2026-10-19");
  assert.match(blockedMessage(both), /today's and this week's hours are/);
});

test("a weekend day is held only by the week and the month", () => {
  const budget = budgetFrom(new Map([["2026-10-17", 10 * HOUR]]), BUDGET, "2026-10-17");
  assert.deepEqual(budget.today, { date: "2026-10-17", used: 10 * HOUR, cap: null, left: null });
  assert.equal(budget.exhausted, false);
  assert.match(describeBudget(budget), /^Today \(Sat 17 Oct\): 10h used, no daily cap at weekends\. /);
});

test("the PDF shows a weekday's cap after its total, and nothing at weekends", () => {
  const day = (date, hours) => ({ date, seconds: hours * HOUR, tasks: [{ name: "Checkout", type: "Development", seconds: hours * HOUR }] });
  const html = renderHtml({
    project: "acme-shop",
    period: "Week of 12 - 18 October 2026",
    kind: "week",
    today: "2026-10-18",
    days: [day("2026-10-12", 6), day("2026-10-13", 9), day("2026-10-17", 3)],
    categories: ["Development"],
    stats: [],
    weeks: null,
    dayCap: (date) => dayCapOn(BUDGET, date),
  });
  assert.match(html, /6h<span class="day-cap"> of 8h<\/span><\/span>/);
  assert.match(html, /9h<span class="day-cap"> of 8h<\/span><span class="tag over">over by 1h<\/span>/);
  assert.match(html, /3h<\/span>\s*<\/div>/);
  // No budget, no caps.
  assert.equal(renderHtml({ project: "x", period: "p", kind: "week", today: "2026-10-18", days: [day("2026-10-12", 6)], categories: [], stats: [], weeks: null }).includes("day-cap\">"), false);
});

test("every computer's timesheet counts toward the one budget, upkeep rows not at all", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "time-tracker-budget-"));
  try {
    const month = (days) =>
      renderMonthFile({ month: "2026-10", days: days.map(([date, seconds]) => ({ date, seconds, tasks: [{ name: "Work", type: "Development", seconds }] })) });
    mkdirSync(path.join(dir, "computers", "desk-1a2b"), { recursive: true });
    writeFileSync(path.join(dir, "computers", "desk-1a2b", "2026-10.md"), month([["2026-10-05", 10 * HOUR]]));
    writeFileSync(path.join(dir, "2026-10.bob.lap-9f9f.md"), month([["2026-10-05", 5 * HOUR], ["2026-10-06", 2 * HOUR]]));
    writeFileSync(
      path.join(dir, "2026-10.studio-3f9a.md"),
      renderMonthFile({ month: "2026-10", days: [{ date: "2026-10-06", seconds: 2 * HOUR, tasks: [{ name: "Work", type: "Development", seconds: HOUR }, { name: "Timesheet update", seconds: HOUR }] }] }),
    );
    const onDisk = recordedDays(["2026-10"], { dir });
    assert.equal(onDisk.get("2026-10-05"), 15 * HOUR);
    assert.equal(onDisk.get("2026-10-06"), 3 * HOUR);
  
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

// --- dated multipliers -----------------------------------------------------

const rate = (hoursMultiplier, subagentMultiplier = 1.2) => ({ hoursMultiplier, subagentMultiplier });
const dated = (from, hours, subagent = 1.2) => ({ from, ...rate(hours, subagent) });

test("each day takes the multipliers in force on it", () => {
  const history = [dated("2026-09-01", 1.5), dated("2026-10-16", 2, 2)];
  assert.deepEqual(rateFor(history, "2026-08-20"), rate(1.5));
  assert.deepEqual(rateFor(history, "2026-10-15"), rate(1.5));
  assert.deepEqual(rateFor(history, "2026-10-16"), rate(2, 2));
  assert.deepEqual(rateFor(history, "2026-11-01"), rate(2, 2));
});

test("an edited multiplier is dated from today, and a second edit that day replaces it", () => {
  const today = "2026-10-16";
  const base = { trackFrom: "2026-09-01", multiplierHistory: [dated("2026-09-01", 1.5)] };
  assert.deepEqual(effectiveHistory({ ...base, ...rate(1.5) }, today), [dated("2026-09-01", 1.5)]);
  assert.deepEqual(effectiveHistory({ ...base, ...rate(2, 2) }, today), [dated("2026-09-01", 1.5), dated(today, 2, 2)]);

  const changed = { ...base, multiplierHistory: [dated("2026-09-01", 1.5), dated(today, 2, 2)] };
  assert.deepEqual(effectiveHistory({ ...changed, ...rate(2.5, 2) }, today), [
    dated("2026-09-01", 1.5),
    dated(today, 2.5, 2),
  ]);
  // Put back the same day: no entry for today at all.
  assert.deepEqual(effectiveHistory({ ...changed, ...rate(1.5) }, today), [dated("2026-09-01", 1.5)]);
  // No dated list yet: today's values count from trackFrom.
  assert.deepEqual(effectiveHistory({ trackFrom: "2026-09-01", ...rate(2, 1.2) }, today), [dated("2026-09-01", 2)]);
});

test("the dated list is rebuilt from config.json's commits", () => {
  const commits = [
    { day: "2026-08-20", rate: rate(1.5) },
    { day: "2026-09-10", rate: rate(1.5) },
    { day: "2026-10-01", rate: rate(2) },
    { day: "2026-10-01", rate: rate(2.5) },
  ];
  assert.deepEqual(seedHistory({ trackFrom: "2026-09-01", commits, current: rate(3), today: "2026-10-16" }), [
    dated("2026-09-01", 1.5),
    dated("2026-10-01", 2.5),
    dated("2026-10-16", 3),
  ]);
  assert.deepEqual(seedHistory({ trackFrom: "2026-09-01", commits: [], current: rate(2), today: "2026-10-16" }), [
    dated("2026-09-01", 2),
  ]);
});

test("configCommits reads each committed multiplier with its commit's day", () => {
  const repo = mkdtempSync(path.join(tmpdir(), "rates-git-"));
  try {
    const file = path.join(repo, "pm", "tracking", "config.json");
    mkdirSync(path.dirname(file), { recursive: true });
    const commit = (hours, when) => {
      writeFileSync(file, JSON.stringify({ hoursMultiplier: hours, subagentMultiplier: 1.2 }));
      const env = { ...process.env, GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when };
      const git = (...args) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: repo, env, stdio: "ignore" });
      git("add", "-A");
      git("commit", "-qm", `x${hours}`);
    };
    execFileSync("git", ["init", "-q"], { cwd: repo });
    commit(1.5, "2026-09-01T12:00:00Z");
    commit(2, "2026-10-10T23:30:00Z");
    assert.deepEqual(configCommits("UTC", file, repo), [
      { day: "2026-09-01", rate: rate(1.5) },
      { day: "2026-10-10", rate: rate(2) },
    ]);
    // The day is local: 23:30 UTC is already the 11th in Karachi.
    assert.equal(configCommits("Asia/Karachi", file, repo)[1].day, "2026-10-11");
    assert.deepEqual(configCommits("UTC", path.join(repo, "missing.json"), repo), []);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("today's change leaves yesterday as recorded and scales today at the new rate", () => {
  const yesterday = "2026-09-29";
  const existing = {
    month: "2026-09",
    days: [
      { date: yesterday, seconds: 6 * 3600, tasks: [{ name: "Checkout", seconds: 6 * 3600 }] },
      { date: TODAY, seconds: 3 * 3600, tasks: [{ name: IN_PROGRESS, seconds: 3 * 3600 }] },
    ],
  };
  const history = [dated("2026-09-01", 1.5), dated(TODAY, 2, 2)];
  const measured = [
    { date: yesterday, blocks: [block(0, 4 * 60, yesterday)] },
    { date: TODAY, blocks: [block(0, 2 * 60, TODAY)] },
  ];
  const { days } = rebuild(existing, "2026-09", measured, TODAY, 20, 1, 1, {
    rateOn: (date) => rateFor(history, date),
    writtenAt: () => rate(1.5),
  });
  assert.deepEqual(days[0], existing.days[0]);
  assert.equal(days[1].seconds, 4 * 3600);
  assert.deepEqual(days[1].tasks, [{ name: IN_PROGRESS, seconds: 4 * 3600 }]);
});

test("a backdated multiplier rescales a named day's rows with no Unlabelled row", () => {
  const existing = { month: "2026-09", days: [namedDay(6 * 3600, [["Checkout", 3 * 3600], ["Emails", 3 * 3600]])] };
  const measured = [{ date: DAY, blocks: [block(0, 4 * 60)] }];
  const { days } = rebuild(existing, "2026-09", measured, TODAY, 20, 1, 1, {
    rateOn: () => rate(2),
    writtenAt: () => rate(1.5),
  });
  assert.equal(days[0].seconds, 8 * 3600);
  assert.deepEqual(days[0].tasks, [
    { name: "Checkout", seconds: 4 * 3600 },
    { name: "Emails", seconds: 4 * 3600 },
  ]);
});

test("a re-rated day still being worked keeps its share and grows a placeholder", () => {
  const existing = {
    month: "2026-09",
    days: [{ date: TODAY, seconds: 3 * 3600, tasks: [{ name: "Checkout", seconds: 3 * 3600 }] }],
  };
  // Written at 1.5 from 2h; now 3h measured, at 2.
  const measured = [{ date: TODAY, blocks: [block(0, 3 * 60, TODAY)] }];
  const { days } = rebuild(existing, "2026-09", measured, TODAY, 20, 1, 1, {
    rateOn: () => rate(2),
    writtenAt: () => rate(1.5),
  });
  assert.deepEqual(days[0].tasks, [
    { name: "Checkout", seconds: 4 * 3600 },
    { name: IN_PROGRESS, seconds: 2 * 3600 },
  ]);
});

test("a re-rated day with no transcripts left scales by the ratio, manual rows from the hours given", () => {
  const existing = {
    month: "2026-09",
    days: [
      {
        date: DAY,
        seconds: 9 * 3600,
        tasks: [
          { name: "Checkout", seconds: 2 * 3600 + 15 * 60 },
          { name: "Emails", seconds: 3 * 3600 + 45 * 60 },
          { ...manualRow("Figma", 3 * 3600), givenSeconds: 2 * 3600 },
        ],
      },
    ],
  };
  const { days } = rebuild(existing, "2026-09", [], TODAY, 20, 1, 1, {
    rateOn: () => rate(2),
    writtenAt: () => rate(1.5),
  });
  assert.equal(days[0].seconds, 12 * 3600);
  assert.deepEqual(days[0].tasks, [
    { name: "Checkout", seconds: 3 * 3600 },
    { name: "Emails", seconds: 5 * 3600 },
    { ...manualRow("Figma", 4 * 3600), givenSeconds: 2 * 3600 },
  ]);
  // Same rate as written: nothing moves.
  const kept = rebuild(existing, "2026-09", [], TODAY, 20, 1, 1, { rateOn: () => rate(2), writtenAt: () => rate(2) });
  assert.deepEqual(kept.days, existing.days);
});

test("the first run drops an Unlabelled row a multiplier on the wrong day left", () => {
  // Named at 1.5 from 4h; a later run at 2 parked the gap under Unlabelled.
  const existing = { month: "2026-09", days: [namedDay(8 * 3600, [["Checkout", 6 * 3600], [UNLABELLED, 2 * 3600]])] };
  const measured = [{ date: DAY, blocks: [block(0, 4 * 60)] }];
  const options = { rateOn: () => rate(1.5) };
  const repaired = rebuild(existing, "2026-09", measured, TODAY, 20, 1, 1, { ...options, writtenAt: () => undefined });
  assert.equal(repaired.days[0].seconds, 6 * 3600);
  assert.deepEqual(repaired.days[0].tasks, [{ name: "Checkout", seconds: 6 * 3600 }]);

  // Once the rate is known, a drop is expired transcripts and the record stands.
  const warn = console.warn;
  console.warn = () => {};
  try {
    const kept = rebuild(existing, "2026-09", measured, TODAY, 20, 1, 1, { ...options, writtenAt: () => rate(1.5) });
    assert.deepEqual(kept.days, existing.days);
  } finally {
    console.warn = warn;
  }
});

test("config.json and the rate ledger keep their layout through a round trip", () => {
  const template = readFileSync(new URL("../templates/config.json", import.meta.url), "utf8")
    .replace("{{TIMEZONE}}", "UTC")
    .replaceAll("{{TRACK_FROM}}", "2026-09-01")
    .replaceAll("{{HOURS_MULTIPLIER}}", "1.5")
    .replace("{{MONTHLY_HOURS}}", "80");
  assert.equal(configJson(JSON.parse(template)), template);

  const ledger = parseLedger('{ "2026-09-02": [1.5, 1.2], "2026-09-01": [2, 2], "bad": [1, 1], "2026-09-03": [0, 1] }');
  assert.equal(renderLedger(ledger), '{\n  "2026-09-01": [2, 2],\n  "2026-09-02": [1.5, 1.2]\n}\n');
  assert.deepEqual(parseLedger(renderLedger(ledger)), ledger);
});

test("check lists the dated multipliers and flags a future or repeated date", () => {
  const lines = multiplierLines(
    { multiplierHistory: [dated("2026-09-01", 1.5), dated("2026-10-16", 2, 2), dated("2026-10-16", 3)] },
    "2026-10-10",
  );
  assert.equal(lines[0][0], "ok");
  assert.match(lines[0][1], /1\.5 \/ 1\.2 from 2026-09-01, 2 \/ 2 from 2026-10-16/);
  assert.ok(lines.some(([status, text]) => status === "warn" && /repeats a date/.test(text)));
  assert.ok(lines.some(([status, text]) => status === "warn" && /future/.test(text)));
  assert.equal(multiplierLines({}, "2026-10-10")[0][0], "ok");
});
