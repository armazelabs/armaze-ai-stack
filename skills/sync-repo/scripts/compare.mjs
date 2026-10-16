#!/usr/bin/env node
// Screenshots the same pages in the source app and the client mirror and diffs them
// pixel by pixel (see ../SKILL.md). Usage: compare.mjs [--all | --pages /a,/b]
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { chromium } from "playwright";
import { PNG } from "pngjs";

const SRC = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
// A project that started with .sync-repo/ keeps it; SYNC_REPO_DATA overrides both for a test run.
const OLD_DATA = path.join(SRC, ".sync-repo");
const DATA = process.env.SYNC_REPO_DATA ?? (fs.existsSync(OLD_DATA) ? OLD_DATA : path.join(SRC, "project-management/sync-repo"));
const REL = path.relative(SRC, DATA);
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));
// config.json is shared; local.json (gitignored) holds this machine's mirror folder.
const config = { ...readJson("config.json"), ...(fs.existsSync(path.join(DATA, "local.json")) ? readJson("local.json") : {}) };
const C = config.compare;

const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
const pages = process.argv.includes("--pages") ? arg("--pages").split(",").filter(Boolean) : C.pages;

const started = [];
const stopAll = () => started.forEach((child) => { try { process.kill(-child.pid); } catch {} });
process.on("exit", stopAll);
process.on("SIGINT", () => process.exit(130));
const die = (msg) => {
  console.error(msg);
  process.exit(1);
};
const TARGET = config.target ?? die(`No mirror folder set on this machine: write its path to ${REL}/local.json as {"target": "…"}.`);
if (!C?.command) die(`No compare.command in ${REL}/config.json: this project has nothing set up to compare.`);

// The working directory of whatever listens on `port`, or null when nothing does.
function listenerCwd(port) {
  try {
    const pid = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" }).trim().split("\n")[0];
    return execFileSync("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"], { encoding: "utf8" })
      .split("\n")
      .find((l) => l.startsWith("n"))
      .slice(1);
  } catch {
    return null;
  }
}

// Reuses a dev server already serving `root` on `port`; otherwise starts one, stopped on exit.
async function serve(root, port) {
  const app = path.join(root, C.app ?? ".");
  const url = `http://localhost:${port}`;
  const cwd = listenerCwd(port);
  if (cwd) {
    if (path.resolve(cwd) !== app) die(`Port ${port} is used by ${cwd}, not ${app}. Stop and tell the person running the sync.`);
    return { url, reused: true };
  }
  if (!fs.existsSync(path.join(root, "node_modules"))) die(`${root} has no node_modules: install its dependencies first.`);
  const [cmd, ...args] = C.command.map((s) => s.replaceAll("{port}", String(port)));
  const child = spawn(cmd, args, {
    cwd: app,
    env: { ...process.env, ...C.env },
    stdio: "ignore",
    detached: true,
  });
  started.push(child);
  for (let i = 0; i < 120; i++) {
    if (await fetch(url).then((r) => r.ok, () => false)) return { url, reused: false };
    await new Promise((r) => setTimeout(r, 500));
  }
  die(`The dev server in ${app} did not start on ${port}.`);
}

async function shot(context, url) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  // Data that arrives late shows loaders first; wait for them to go.
  if (C.loading)
    await page.waitForFunction((sel) => !document.querySelector(sel), C.loading, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(300);
  const png = await page.screenshot({ fullPage: true, animations: "disabled", caret: "hide" });
  await page.close();
  return png;
}

function diff(a, b) {
  const A = PNG.sync.read(a);
  const B = PNG.sync.read(b);
  if (A.width !== B.width || A.height !== B.height) return { pixels: Infinity, note: `size ${A.width}x${A.height} vs ${B.width}x${B.height}` };
  const out = new PNG({ width: A.width, height: A.height });
  const pixels = pixelmatch(A.data, B.data, out.data, A.width, A.height, { threshold: 0.1 });
  return { pixels, png: PNG.sync.write(out) };
}

// An app that picks its theme from the URL gets `?<themeParam>=<theme>` for every theme but the first.
const withTheme = (page, theme) =>
  C.themeParam && theme !== C.themes[0] ? `${page}${page.includes("?") ? "&" : "?"}${C.themeParam}=${theme}` : page;
const slug = (page) => page.replace(/^\/$/, "root").replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-");

const source = await serve(SRC, C.sourcePort);
const mirror = await serve(TARGET, C.mirrorPort);
const dir = path.join(os.tmpdir(), "sync-repo-compare", new Date().toISOString().replace(/[:.]/g, "-"));
fs.mkdirSync(dir, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const rows = [];
try {
  for (const vp of C.viewports)
    for (const theme of C.themes) {
      const options = { viewport: { width: vp.width, height: vp.height }, reducedMotion: "reduce", deviceScaleFactor: 1 };
      if (theme === "light" || theme === "dark") options.colorScheme = theme; // for apps that follow the system theme
      const [sc, mc] = [await browser.newContext(options), await browser.newContext(options)];
      for (const page of pages) {
        const url = withTheme(page, theme);
        let a, b, d;
        for (let attempt = 0; attempt < 2; attempt++) {
          [a, b] = await Promise.all([shot(sc, source.url + url), shot(mc, mirror.url + url)]);
          d = diff(a, b);
          if (d.pixels === 0) break; // a difference gets one retry, to rule out a flaky capture
        }
        const status = d.pixels === 0 ? "same" : C.expected[page] ? `expected (${C.expected[page]})` : "DIFFERENT";
        if (d.pixels !== 0) {
          const base = path.join(dir, `${slug(page)}-${vp.name}-${theme}`);
          fs.writeFileSync(`${base}-source.png`, a);
          fs.writeFileSync(`${base}-mirror.png`, b);
          if (d.png) fs.writeFileSync(`${base}-diff.png`, d.png);
        }
        rows.push({ page, viewport: vp.name, theme, status, detail: d.note ?? (d.pixels ? `${d.pixels} px` : "") });
        console.log(`${status.padEnd(10)} ${vp.name} ${theme} ${page} ${rows.at(-1).detail}`);
      }
      await Promise.all([sc.close(), mc.close()]);
    }
} finally {
  await browser.close();
}

const unexpected = rows.filter((r) => r.status === "DIFFERENT");
const table = [
  "| Page | Viewport | Theme | Result | Detail |",
  "|---|---|---|---|---|",
  ...rows.map((r) => `| \`${r.page}\` | ${r.viewport} | ${r.theme} | ${r.status} | ${r.detail} |`),
].join("\n");
const summary = `${rows.length} shots: ${rows.filter((r) => r.status === "same").length} same, ${rows.length - unexpected.length - rows.filter((r) => r.status === "same").length} expected, ${unexpected.length} DIFFERENT`;
fs.writeFileSync(path.join(dir, "report.md"), `# Source vs mirror\n\n${summary}\n\n${table}\n`);
console.log(`\n${summary}`);
console.log(`Source ${source.url} (${source.reused ? "reused" : "started"}), mirror ${mirror.url} (${mirror.reused ? "reused" : "started"})`);
console.log(`Report and images: ${dir}`);
process.exit(unexpected.length ? 1 : 0);
