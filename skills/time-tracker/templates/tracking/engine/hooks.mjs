// The Claude Code hooks: every session checks in with the tracker.
//
//   node <tracking>/engine/hooks.mjs session-start   # SessionStart
//   node <tracking>/engine/hooks.mjs session-end     # SessionEnd
//   node <tracking>/engine/hooks.mjs prompt          # UserPromptSubmit
//
// Setup wires these into the project's .claude/settings.json.
//
// - session-start re-measures the hours (a normal collect) and tells the
//   session - and the person, as a one-line message - how much of the week's
//   and the month's budget is used and left.
// - session-end re-measures, so the timesheet is current when a session
//   closes.
// - prompt re-measures in memory only, then refuses the prompt once the week
//   or the month has used up the project's budget. "update tracker" and the
//   other tracker requests still go through, so the days can be named and the
//   PDFs rendered after the hours run out, and TIME_TRACKER_OVERRIDE=1 in the
//   environment lets everything through.
//
// Naming days, manual hours and PDFs stay in "update tracker": they need
// Claude, and a hook has no one to ask.
//
// A hook must never break a session. Anything that goes wrong - not set up,
// no computer name, no transcripts - is swallowed and the session carries on;
// the one deliberate failure is the prompt block, exit code 2.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { toLocalDay } from "./blocks.mjs";
import { blockedMessage, budgetCaps, budgetFor, describeBudget, noteOverBudget } from "./budget.mjs";
import { collect, isTrackerPrompt } from "./collect.mjs";
import { loadConfig } from "./config.mjs";

/** Run `fn` with console output swallowed: a hook's stdout is read by Claude Code. */
function quietly(fn) {
  const saved = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = () => {};
  try {
    return fn();
  } catch {
    return null;
  } finally {
    Object.assign(console, saved);
  }
}

function readInput() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return {};
  }
}

/** Whether a prompt is allowed through while the budget is used up. */
export function promptExempt(prompt, env = process.env) {
  return env.TIME_TRACKER_OVERRIDE === "1" || isTrackerPrompt(prompt);
}

function sessionStart(config) {
  const result = quietly(() => collect());
  const today = toLocalDay(Date.now(), config.timeZone);
  const budget = quietly(() => budgetFor(config, today));
  if (!budget) return;
  if (result?.computer && budget.over.length > 0) quietly(() => noteOverBudget(result.computer.fileId, config, budget));
  const summary = describeBudget(budget);
  const context = budget.exhausted
    ? `Time tracker - the project's hour budget is used up. ${summary} New prompts are refused until it ` +
      'reopens; "update tracker" still works, and TIME_TRACKER_OVERRIDE=1 lets work through.'
    : `Time tracker - project hour budget. ${summary}`;
  process.stdout.write(
    `${JSON.stringify({
      systemMessage: `Time tracker: ${summary}`,
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context },
    })}\n`,
  );
}

function sessionEnd(config) {
  const result = quietly(() => collect());
  const budget = quietly(() => budgetFor(config));
  if (result?.computer && budget?.over.length > 0) quietly(() => noteOverBudget(result.computer.fileId, config, budget));
}

function prompt(config, input) {
  if (promptExempt(input.prompt)) return;
  // Re-measured in memory, so the minutes since the last collect count
  // without the timesheet being rewritten on every prompt. A computer that
  // cannot measure (no name yet) is checked against the files alone.
  const result = quietly(() => collect({ write: false }));
  const today = result?.todayDay ?? toLocalDay(Date.now(), config.timeZone);
  const fresh = result?.computer ? { id: result.computer.fileId, months: result.months } : null;
  const budget = quietly(() => budgetFor(config, today, { fresh }));
  if (!budget?.exhausted) return;
  process.stderr.write(`${blockedMessage(budget)}\n`);
  process.exit(2);
}

function main() {
  const event = (process.argv[2] ?? "").toLowerCase();
  const input = readInput();
  const config = quietly(() => loadConfig());
  // No budget, no checks: the hooks only measure at the session's edges.
  if (!config?.trackFrom) return;
  if (event === "session-start") {
    if (budgetCaps(config)) sessionStart(config);
    else quietly(() => collect());
  } else if (event === "session-end") {
    sessionEnd(config);
  } else if (event === "prompt") {
    if (budgetCaps(config)) prompt(config, input);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch {
    // Never break the session over the tracker.
  }
}
