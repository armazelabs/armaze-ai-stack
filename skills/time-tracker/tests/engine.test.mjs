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
import {
  cutHoles,
  isTrackerPrompt,
  readPrompts,
  readTimestamps,
  trackerStretches,
} from "../templates/tracking/engine/collect.mjs";
import { UNLABELLED, rebuild } from "../templates/tracking/engine/month-file.mjs";
import { isTrackerRow, withoutTrackerRows } from "../templates/tracking/engine/report.mjs";

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

test("main-session time is multiplied, agent-only time is added at its actual length", () => {
  const mainBlocks = [block(0, 60)];
  const allBlocks = mergeBlocks([...mainBlocks, block(120, 150)]);
  const measured = [
    { date: DAY, blocks: mainBlocks, unscaledSeconds: uncoveredSeconds(allBlocks, mainBlocks) },
  ];
  const { days } = rebuild(null, "2026-09", measured, TODAY, 20, 1.5);
  // 60 min x 1.5 = 90 min, plus 30 min of agent work unmultiplied.
  assert.equal(days[0].seconds, 90 * 60 + 30 * 60);
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
