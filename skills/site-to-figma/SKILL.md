---
name: site-to-figma
description: Extract a live website's whole design system through Orca's browser - colours, light and dark themes, fonts, type scale, spacing, radii, shadows, logo, icons and core components - and build it into a Figma file as real variables, text and effect styles and component sets, then recreate the given page in Figma tied to those tokens. Saves W3C design tokens in the project too. Use when asked to pull, extract, copy or rebuild a site's design system, theme or styles into Figma, or to recreate a web page in Figma from its URL.
---

# Site to Figma

This skill reads a website's design system from the live pages instead of redrawing it. It opens the site in Orca's embedded browser and reads the computed styles, CSS variables, @font-face fonts, hover and focus rules, and the dark theme when the site has one. From those it builds:

- **In Figma:** variable collections (a raw palette, colour meanings with Light and Dark modes, spacing and radius, font families), text styles, shadow styles, a documentation board, the logo and icons as components, and Button, Input, Badge and Card component sets. It then captures the starting page and ties the capture to those variables and styles.
- **In the project:** `tokens.json` (W3C design tokens), a review of what was found, screenshots and the raw scans, under `project-management/design-system/<site>/`.

`SKILL_DIR` below means the folder this file is in (for example `.claude/skills/site-to-figma`). The scripts run with `zsh "$SKILL_DIR/scripts/<name>.zsh"` from the project root.

## When to Use This Skill

- "Extract the design system from <url> into Figma", "pull the colours, fonts and tokens from this site"
- "Rebuild this page in Figma", "recreate <url> in Figma with proper variables"
- Starting a redesign from a live site, or documenting your own live product's styles
- Re-running on the same site later to update the Figma file in place

## Ground Rules

1. **Never invent.** Every token comes from the scans. Meanings the skill had to guess (status colours) are marked *guessed* in the review and in the variable's description. If something is missing, say so; don't fill it in.
2. **Orca only** for the browser (`orca` CLI). No other browser, no Playwright. The Figma side goes through the Figma MCP tools.
3. **Read-only on the site.** Look, scroll, open menus, log in when needed. Never submit other forms, buy, sign up, post, or change settings.
4. **One stop before Figma.** Nothing is written to Figma until the user has seen the review and agreed.
5. **Pass the generated Figma code as it is.** `figma-code.zsh` prints the code for each step with the data inside it. Send that output unchanged as the `code` of `use_figma`. Don't retype or rewrite it. If a step fails, read the error, and fix the template or the data rather than improvising a different script.
6. **Re-runs update, never wipe.** Existing variables and styles are updated only if site-to-figma made them and nobody edited them since. Everything else is kept and reported. Nothing is deleted.
7. **Credentials never reach a document,** a screenshot caption, a commit or the chat.

## Workflow

### Step 0 - Preflight

1. **Figma.** Call the Figma MCP `whoami`. If the Figma tools are missing or `whoami` fails, **stop before scanning**. Tell the user to connect the Figma MCP server (the Figma plugin for Claude Code, or `claude mcp add` for Figma's remote server) and run the skill again. Note the plans where the user has an edit seat (`Full` or `Dev`). Those are the only plans a new file can go in.
2. **Orca.** Run `orca tab list --json`. If `orca` is not on PATH, try `/Applications/Orca.app/Contents/Resources/bin/orca`. If neither works, stop: this skill needs Orca's browser.
3. **Folder.** `<site>` is a kebab-case slug of the site's host (`vercel.com` becomes `vercel`). The site folder is `project-management/design-system/<site>/`. If it already holds `figma.json`, this is a **re-run**: read it for the Figma file and the earlier ids.

### Step 1 - Intake

Ask only what you can't infer:

- **The URL** to start from. This is also the page that gets recreated.
- **A Figma file link** to build into. Otherwise a new file is created in the user's drafts. If the user has more than one plan with an edit seat, ask which plan. On a re-run, reuse the file in `figma.json` unless told otherwise.
- **A login**, only if the pages need one. Use a saved login if there is one: `zsh "$SKILL_DIR/scripts/secrets.zsh" has <site>`. Otherwise ask for one, recommending a test account, and save it with `printf '%s\n%s\n' "<user>" "<password>" | zsh "$SKILL_DIR/scripts/secrets.zsh" set <site> --url <login-url>`. It goes to `.claude/site-to-figma.local.env` (mode 600, git-ignored). Tell the user where it went.

### Step 2 - Open the site and scan the starting page

1. **Profile.** Run `orca tab profile list --json`. Reuse the profile labelled `site-to-figma-<site>`, or create it with `orca tab profile create --label site-to-figma-<site> --json`.
2. **Tab.** Open the URL with `orca tab create --url <url> --profile <id> --json`, and keep its `browserPageId`.
3. **Login, if needed.** Run `orca snapshot --page <id>` to find the fields, then `zsh "$SKILL_DIR/scripts/secrets.zsh" fill <site> --user-ref @eN --pass-ref @eM --page <id>`, and click submit. Ask the user to finish any MFA or captcha in the Orca window.
4. **Cookie banners and pop-ups.** Close them (choose "reject" or "necessary only" where offered) so they don't pollute the colours.
5. **Scan folder.** The scan folder is `<site dir>/scans/<YYYY-MM-DD>/`. If it exists from an earlier run today, add `-2`, `-3` and so on.
6. **Scan.** Run `zsh "$SKILL_DIR/scripts/scan.zsh" --page <id> --out <scan dir> --name home`. Use the page's own slug instead of `home` when the URL is not the home page. The script scrolls the page and reads its styles, logo and icons. It saves a full-page JPEG, then switches the tab to dark and does the same again if the site has a dark theme.

### Step 3 - Scan a few more pages in parallel

1. **Pick the pages.** From the `nav` list in `<scan dir>/raw/<page>.light.json`, pick **3 to 5** pages that show other parts of the design: pricing, a docs or blog article, a form (contact, sign-up, search), a product or feature page, a dashboard page for logged-in apps. Skip legal pages and near-duplicates. Tell the user which pages you picked.
2. **One agent per page.** In Claude Code, use the Agent tool (general-purpose agents), all in one message. Give each its own tab: create it with `orca tab create --url <page url> --profile <id> --json`. Brief each agent with `references/scan-brief.md`, filled in. On a platform without subagents, scan the pages one after another yourself.
3. **Check the reports.** Each agent reports the files written and anything odd. Rerun a failed page once yourself.

### Step 4 - Turn the scans into a design system

Run `zsh "$SKILL_DIR/scripts/synth.zsh" --scan <scan dir> --out <site dir> --page <any open tab id> --site <url>`.

This writes `tokens.json`, `figma-spec.json`, `review.md` and `assets.jsonl` into the site folder. `references/token-synthesis.md` explains how the colours are merged and named, how meanings are chosen, and how type styles, scales and components are derived. Read it when the user asks why something came out as it did.

### Step 5 - Review stop

Show the user `review.md`, shortened if it is long. Always include:
- the colour meanings with their light and dark values
- the fonts, and which will need a stand-in in Figma
- the text styles
- spacing, radius and shadows
- the components found
- the warnings
- on a re-run, the "Changes since the last run" section

Then ask the user to approve or to change things. Changes go into `<site dir>/overrides.json`, never by hand-editing the generated files (format: `references/overrides.md`). After writing the overrides, run Step 4 again and show what changed. Repeat until the user approves.

### Step 6 - Build the design system in Figma

Load the `figma-use` skill first (and `figma-generate-library` if it is available). Pass `skillNames: "figma-use"` on every `use_figma` call.

1. **The file.** For a new file, load `figma-create-new-file`, then call `create_new_file` (`editorType: design`, named `<Site> design system`). Then call `create_session` with the file key, and reuse its id as `sessionId` on every Figma call.
2. **Each step.** Generate the code with `zsh "$SKILL_DIR/scripts/figma-code.zsh" <step> --dir <site dir>` and send it unchanged to `use_figma`. Keep each result. Go in this order:
   1. `inspect`: what the file already holds (always; it matters on re-runs and for files the user gave you)
   2. `variables`
   3. `styles`
   4. `foundations`
   5. `assets`: the generator prints `assets batch 1 of N` on stderr; run `--batch 2` … `--batch N` the same way
   6. `components`: keep the returned `ids.Button` for Step 7
3. **Check visually.** Take one screenshot (`get_screenshot`) of the Foundations board and one of the Components page. Fix only what is actually wrong. `references/figma-build.md` covers each step's output, the update rules and the known failure modes.

### Step 7 - Recreate the starting page

1. **Get a capture id.** Call `generate_figma_design` with the file key and no `captureId`. Note the capture id, and the endpoint `https://mcp.figma.com/mcp/capture/<id>/submit?...` from its instructions. Ignore its Playwright steps: Orca does the capture.
2. **Capture.** Point the tab back at the starting URL, close any pop-ups, then run `zsh "$SKILL_DIR/scripts/capture.zsh" --page <id> --capture-id <capture id> --endpoint '<endpoint>'`. It brings the tab on screen in Orca for a few seconds, which the capture needs.
3. **Wait for it.** Poll `generate_figma_design` with the file key and `captureId` every 5 seconds until it reports completed. Take the captured frame's node id from the returned URL (`node-id=5-2` means `5:2`). The capture already binds most colours to the file's variables.
4. **Rebind.** Run `figma-code.zsh rebind --dir <site dir> --node <frame id>` through `use_figma`. It applies text styles, shadow styles and radius and spacing variables, and binds any colours the capture left raw.
5. **Swap.** Run `figma-code.zsh swap --dir <site dir> --node <frame id> --set <Button set id>`. It replaces captured buttons with Button instances only where colour, height and radius all match.
6. **Check.** Take one screenshot of the frame to check it.

### Step 8 - Finish

1. **`figma.json`.** Write `<site dir>/figma.json`: `{ "fileKey", "url", "planKey", "buttonSetId", "captures": [{ "date", "url", "nodeId" }] }`.
2. **`report.md`.** Write `<site dir>/report.md` from the step results, following the template in `references/figma-build.md`:
   - the Figma link
   - what was created, updated and kept
   - font stand-ins
   - colours the capture left unmatched
   - a raster logo, if any (it is not imported)
   - what to do next
3. **Summarise for the user.** Give the Figma link (and the node links for Foundations, Components and the captured page), counts, stand-in fonts the user may want to install, and where the tokens and the login file are.

## Output Layout

```
project-management/design-system/<site>/
├── tokens.json          W3C design tokens (regenerated each run)
├── figma-spec.json      the same, shaped for the Figma steps
├── review.md            what was found (Step 5)
├── assets.jsonl         logo and icons as SVG
├── overrides.json       the user's review changes, if any
├── figma.json           the Figma file and node ids, for re-runs
├── report.md            what the Figma build did
└── scans/<YYYY-MM-DD>/
    ├── raw/<page>.light.json, <page>.dark.json, <page>.assets.json
    ├── screenshots/<page>-light.jpg, <page>-dark.jpg
    └── figma-spec.previous.json   the spec before this run (on re-runs)
```

In Figma: the pages **Foundations** (the board `site-to-figma · Foundations`, rebuilt on every run), **Assets**, **Components**, and the captured page on the first page.

## Scripts

| Script | What it does |
|---|---|
| `scan.zsh --page <id> --out <dir> --name <page>` | Scrolls the page and extracts styles (light, then dark if the site has it), the logo and icons, and full-page JPEGs. Never overwrites. |
| `synth.zsh --scan <dir> --out <site dir> --page <id>` | Merges the scans into `tokens.json`, `figma-spec.json`, `review.md` and `assets.jsonl`. Reads `overrides.json`. |
| `figma-code.zsh <step> --dir <site dir>` | Prints the `use_figma` code for `inspect`, `variables`, `styles`, `foundations`, `assets` (`--batch n`), `components`, `rebind` (`--node`) or `swap` (`--node --set`). |
| `capture.zsh --page <id> --capture-id <id> --endpoint <url>` | Runs Figma's page capture in the Orca tab and uploads it. |
| `secrets.zsh path\|list\|has\|user\|set\|fill` | The local login file. `fill` types a saved login into the page without printing it. |
| `shot.zsh <out.jpg> [--full] [--page <id>]` | One JPEG screenshot of a tab. |

The JavaScript beside them runs in the page (`extract-styles.js`, `extract-assets.js`, `scroll.js`) or in an Orca tab as plain computation (`synth.js`, `merge-assets.js`). The Figma step templates are in `scripts/figma/`.

## References

- `references/scan-brief.md` - the brief for each page-scanning agent
- `references/token-synthesis.md` - how scans become tokens, meanings, styles and components
- `references/overrides.md` - the `overrides.json` format for review changes
- `references/figma-build.md` - the Figma steps, update rules, troubleshooting and the report template
