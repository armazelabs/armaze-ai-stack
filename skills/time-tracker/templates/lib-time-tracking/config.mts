// Paths and settings shared by the collector and the reporter.
//
// Every path is derived at runtime from this file's own location and the user's
// home directory rather than being hard-coded, because the timesheet has to work
// on whichever machine you happen to be using - a second Mac will not have the
// same home directory or checkout path.

import { homedir } from "node:os";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export type Config = {
  /** Tracking begins on this `YYYY-MM-DD`; earlier transcripts are ignored. */
  startDate: string;
  timeZone: string;
  idleGapMinutes: number;
  /** Measured hours are scaled by this factor before being recorded. */
  hoursMultiplier: number;
  /** Days that count as work, Sunday=0. */
  workdays: number[];
  /**
   * Marker written into the scheduled run's own prompt. Sessions containing it
   * are skipped so the tracker never bills its own runtime as work.
   */
  sentinel: string;
};

/** Repo root, two directories up from `lib/time-tracking/`. */
export const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "../../..");

export const PM_DIR = path.join(REPO_ROOT, "project-management");
export const CACHE_DIR = path.join(PM_DIR, "cache");
export const CONFIG_PATH = path.join(PM_DIR, "config.json");

/**
 * Where Claude Code keeps this project's transcripts. It encodes the checkout
 * path into the directory name, so this is computed rather than configured.
 */
export function transcriptDir(repoRoot: string = REPO_ROOT): string {
  const encoded = repoRoot.replaceAll("/", "-").replaceAll(".", "-");
  return path.join(homedir(), ".claude", "projects", encoded);
}

/** The cross-project prompt log, used to label blocks with what was asked. */
export function historyPath(): string {
  return path.join(homedir(), ".claude", "history.jsonl");
}

export function monthFilePath(month: string): string {
  return path.join(PM_DIR, `${month}.md`);
}

export function loadConfig(): Config {
  return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Config;
}

/** `YYYY-MM` for a `YYYY-MM-DD` day. */
export function monthOf(day: string): string {
  return day.slice(0, 7);
}

/**
 * Display name for the report title. Read from the checkout's own
 * `package.json` so the PDF stays correct if the project is renamed, rather
 * than being fixed at the moment this was set up.
 */
export function projectName(): string {
  try {
    const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")) as {
      name?: string;
    };
    if (pkg.name) return pkg.name;
  } catch {
    // No package.json, or it has no name - fall back to the folder name.
  }
  return path.basename(REPO_ROOT);
}
