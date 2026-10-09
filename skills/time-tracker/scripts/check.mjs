#!/usr/bin/env node
// Check that time tracking works in the project this is run from - and, with
// --fix, put right whatever setup can put right.
//
//   node <skill_dir>/scripts/check.mjs                 # check only
//   node <skill_dir>/scripts/check.mjs --fix           # check, fix, check again
//   node <skill_dir>/scripts/check.mjs --fix --monthly-hours 160 --machine laptop
//
// It lives in the skill rather than the project's engine so it can compare the
// project against the skill that is installed now: after `aistack update`, the
// project's engine is the stale copy, and this is what notices.
//
// The fix is always setup itself, run again - it is idempotent and already
// knows how to sync the engine, add missing settings and install the hooks.
// Two things it cannot invent are the project's monthly hours and this
// computer's name; when either is missing it prints `needs:` lines and exits
// 2, the skill asks the person, and runs it again with the answers.
//
// Exit codes: 0 everything works (warnings allowed), 1 something still fails,
// 2 needs an answer from the person before it can fix.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir, hostname } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { findInstalledTrackingDir, withTrackerHooks } from "./setup.mjs";

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE_ENGINE = path.join(SKILL_DIR, "templates", "tracking", "engine");
const SETUP = path.join(SKILL_DIR, "scripts", "setup.mjs");
const TARGET_ROOT = process.cwd();

/**
 * How the project's engine differs from the skill's templates: files changed,
 * missing, or left over from an older version. All empty means up to date.
 */
export function engineDrift(templateDir, engineDir) {
  const drift = { changed: [], missing: [], extra: [] };
  const shipped = readdirSync(templateDir).sort();
  for (const name of shipped) {
    const installed = path.join(engineDir, name);
    if (!existsSync(installed)) drift.missing.push(name);
    else if (!readFileSync(installed).equals(readFileSync(path.join(templateDir, name)))) drift.changed.push(name);
  }
  let present = [];
  try {
    present = readdirSync(engineDir);
  } catch {
    // No engine folder - every file is missing, which the loop above said.
  }
  drift.extra = present.filter((name) => !shipped.includes(name)).sort();
  return drift;
}

function flagValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

/**
 * What the tracking folder says about computers: this one's files still on
 * the older `<person>.<computer>` names (setup renames them), and other
 * computers whose timesheets are still on them (they have not upgraded).
 */
export function timesheetNames(names, machine) {
  const own = [];
  const others = new Set();
  for (const name of names) {
    const found = /^(?:\d{4}-\d{2}|log)\.([a-z0-9-]+)\.([a-z0-9-]+)\.(?:md|jsonl)$/.exec(name);
    if (!found) continue;
    if (found[2] === machine) own.push(name);
    else others.add(`${found[1]}.${found[2]}`);
  }
  return { own: own.sort(), others: [...others].sort() };
}

function machineName() {
  const name = readJson(path.join(homedir(), ".claude", "time-tracker", "machine.json"))?.name;
  return typeof name === "string" && /^[a-z0-9][a-z0-9-]*$/.test(name) ? name : null;
}

function suggestedMachine() {
  return (
    hostname()
      .replace(/\.local$/i, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "computer"
  );
}

/** Run an engine script the way a hook or a person would, from the project root. */
function runEngine(engineDir, script, args = [], input = "") {
  return spawnSync(process.execPath, [path.join(engineDir, script), ...args], {
    cwd: TARGET_ROOT,
    input,
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: TARGET_ROOT },
    timeout: 60_000,
  });
}

function firstLine(text) {
  return (text ?? "").trim().split("\n")[0] ?? "";
}

/**
 * Every check, in order. Each result is `{ status: "ok" | "warn" | "fail",
 * text, fixable }`; `needs` lists the answers a fix would need first.
 */
async function runChecks() {
  const results = [];
  const needs = [];
  const add = (status, text, fixable = false) => results.push({ status, text, fixable });

  // 1. Installed.
  const installed = findInstalledTrackingDir();
  if (!installed) {
    add("fail", "Time tracking is not set up in this project.", true);
    needs.push("monthly-hours");
    if (!machineName()) needs.push(`machine ${suggestedMachine()}`);
    return { results, needs };
  }
  const trackingRel = path.relative(TARGET_ROOT, installed.dir);
  const engineDir = path.join(installed.dir, "engine");
  const engineRel = path.relative(TARGET_ROOT, engineDir);
  if (trackingRel.split(path.sep).join("/") === "project-management/tracking") {
    add("ok", `Set up in ${trackingRel}/`);
  } else {
    add("fail", `Set up in ${trackingRel}/ - every Armaze skill keeps its files in project-management/.`, true);
  }

  // 2. Version.
  const drift = engineDrift(TEMPLATE_ENGINE, engineDir);
  const stale = drift.changed.length + drift.missing.length + drift.extra.length > 0;
  if (stale) {
    const parts = [
      drift.missing.length && `${drift.missing.length} new file(s) missing`,
      drift.changed.length && `${drift.changed.length} changed`,
      drift.extra.length && `${drift.extra.length} left over`,
    ].filter(Boolean);
    add("fail", `Older version than the installed time-tracker (${parts.join(", ")}).`, true);
  } else {
    add("ok", "Same version as the installed time-tracker");
  }

  // 3. Settings and this computer.
  const configPath = path.join(installed.dir, "config.json");
  const config = readJson(configPath);
  if (config === undefined) {
    add("fail", `${trackingRel}/config.json is missing or will not parse - fix it by hand.`);
  } else {
    const missing = ["trackFrom", "hoursMultiplier", "subagentMultiplier"].filter((key) => config[key] == null);
    if (missing.length > 0) add("fail", `Settings missing: ${missing.join(", ")}.`, true);
    const hours = Number(config.monthlyHours);
    if (config.monthlyHours == null || !Number.isFinite(hours) || hours <= 0) {
      add("fail", "No monthly hours set - the project has no hour budget.", true);
      needs.push("monthly-hours");
    } else if (missing.length === 0) {
      add(
        "ok",
        `${hours}h a month (${hours / 4}h a week), multipliers ${config.hoursMultiplier} / ` +
          `${config.subagentMultiplier} for subagents`,
      );
    }

    const machine = machineName();
    if (!machine) {
      add("fail", "This computer has no name yet.", true);
      needs.push(`machine ${suggestedMachine()}`);
    } else {
      const names = readdirSync(installed.dir);
      const { own, others } = timesheetNames(names, machine);
      if (own.length > 0) {
        add("fail", `This computer's timesheet still has the older per-person names (${own[0]}…).`, true);
      } else {
        add("ok", `This computer (${machine}) - its timesheet is ${trackingRel}/<month>.${machine}.md`);
      }
      if (others.length > 0) {
        add(
          "warn",
          `Not upgraded yet: ${others.join(", ")}. Their hours still count; each should run ` +
            '"aistack update" and "update time tracker setup".',
        );
      }
      if (config.people !== undefined) {
        add("warn", 'config.json still has "people", which nothing reads now - remove it once every computer has upgraded.');
      }
    }
  }

  // 4. Hooks: written, then actually run.
  const settingsPath = path.join(TARGET_ROOT, ".claude", "settings.json");
  const settings = existsSync(settingsPath) ? readJson(settingsPath) : {};
  let hooksInstalled = false;
  if (settings === undefined) {
    add("fail", ".claude/settings.json will not parse - fix it by hand, then check again.");
  } else if (JSON.stringify(withTrackerHooks(settings, engineRel)) === JSON.stringify(settings)) {
    hooksInstalled = true;
    add("ok", "Hooks installed: session start, session end, prompt check");
  } else {
    add("fail", "Hooks not installed, or out of date.", true);
  }

  // Everything below runs the project's engine, which only makes sense once
  // it is the current version.
  if (stale || config === undefined) {
    add("warn", "Hooks, hours and PDF not tested yet - the version has to be fixed first.");
    return { results, needs, engineDir, hooksInstalled };
  }

  if (hooksInstalled) {
    const start = runEngine(engineDir, "hooks.mjs", ["session-start"], "{}");
    let startOk = start.status === 0;
    if (startOk && start.stdout.trim()) {
      try {
        JSON.parse(start.stdout);
      } catch {
        startOk = false;
      }
    }
    const prompt = runEngine(engineDir, "hooks.mjs", ["prompt"], JSON.stringify({ prompt: "check time tracker" }));
    if (startOk && prompt.status === 0) add("ok", "Hooks run");
    else add("fail", `A hook failed when run: ${firstLine(start.stderr || prompt.stderr) || `exit ${start.status ?? prompt.status}`}`);
  }

  // 5. Hours, budget, PDF.
  const collected = runEngine(engineDir, "collect.mjs");
  if (collected.status !== 0) {
    add("fail", `Measuring hours failed: ${firstLine(collected.stderr || collected.stdout)}`);
  } else if (/No transcripts found/.test(collected.stdout)) {
    add("ok", "Hours: nothing to measure yet - work in Claude Code here and it will be");
  } else {
    const months = collected.stdout
      .split("\n")
      .filter((line) => /^\d{4}-\d{2}: /.test(line))
      .map((line) => line.replace(/ \(unchanged\)$/, ""));
    add("ok", `Hours measured${months.length > 0 ? ` - ${months[months.length - 1]}` : ""}`);
  }

  const budget = runEngine(engineDir, "budget.mjs");
  if (budget.status === 0 && /^This week/.test(budget.stdout)) {
    add(/over$|over\./.test(budget.stdout.trim()) ? "warn" : "ok", `Budget: ${firstLine(budget.stdout)}`);
  }

  try {
    const { findChrome } = await import(pathToFileURL(path.join(engineDir, "report.mjs")).href);
    add("ok", `PDFs: ${path.basename(findChrome())} found`);
  } catch {
    add("warn", "PDFs: no Chrome, Edge, Brave or Chromium found - hours are still recorded, PDFs will not render.");
  }

  return { results, needs, engineDir, hooksInstalled };
}

function print({ results }) {
  const mark = { ok: "✔", warn: "!", fail: "✘" };
  for (const result of results) console.log(`${mark[result.status]} ${result.text}`);
}

async function main() {
  const fix = process.argv.includes("--fix");
  const monthlyHours = flagValue("--monthly-hours");
  const machine = flagValue("--machine");

  console.log(`Time tracker check - ${path.basename(TARGET_ROOT)}`);
  console.log("");

  let report = await runChecks();
  const fixable = report.results.some((result) => result.status === "fail" && result.fixable);
  const needs = report.needs.filter(
    (need) => !(need === "monthly-hours" && monthlyHours) && !(need.startsWith("machine") && machine),
  );

  if (fix && fixable && needs.length > 0) {
    print(report);
    console.log("");
    for (const need of needs) console.log(`needs: ${need}`);
    process.exit(2);
  }

  let fixed = false;
  if (fix && (fixable || monthlyHours)) {
    const args = [SETUP];
    if (monthlyHours) args.push("--monthly-hours", monthlyHours);
    if (machine) args.push("--machine", machine);
    const setup = spawnSync(process.execPath, args, { cwd: TARGET_ROOT, encoding: "utf8" });
    if (setup.status !== 0) {
      print(report);
      console.log("");
      console.log("Fixing failed - setup said:");
      console.log((setup.stderr || setup.stdout).trim());
      process.exit(1);
    }
    fixed = true;
    const hooksWereMissing = !report.hooksInstalled;
    report = await runChecks();
    if (hooksWereMissing && report.hooksInstalled) report.hooksJustInstalled = true;
  }

  print(report);
  console.log("");
  const failures = report.results.filter((result) => result.status === "fail");
  if (fixed) console.log("Fixed by re-running setup.");
  if (report.hooksJustInstalled) {
    console.log("The hooks start with your next Claude Code session. Commit .claude/settings.json so teammates get them.");
  }
  if (failures.length === 0) {
    console.log("All good - time tracking is working.");
    return;
  }
  console.log(
    `${failures.length} problem${failures.length === 1 ? "" : "s"} left.` +
      (!fix && failures.some((result) => result.fixable) ? " Run again with --fix to fix them." : ""),
  );
  const unmet = report.needs.filter((need) => !(need === "monthly-hours" && monthlyHours));
  if (unmet.length > 0) {
    for (const need of unmet) console.log(`needs: ${need}`);
    process.exit(2);
  }
  process.exit(1);
}

// Guarded so `engineDrift` can be imported by the tests without checking anything.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
