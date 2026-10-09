---
name: product-teardown
description: Deep, module-by-module research of a website, SaaS product, Figma file or mobile app through Orca's browser - every screen and state captured as JPEG screenshots, every heading, line of copy, button and form field extracted for redesign, functionality and UX written up in the project's research tree, with competitor fallback and outside research when the product alone is not enough. Use when asked to research, tear down, audit or document how a product or one of its modules works.
---

# Product Teardown

This skill takes a product apart one module at a time and writes down exactly how each module works and how it feels to use. It drives Orca's embedded browser to visit every screen and state, saves a JPEG screenshot of each, and extracts every heading, line of copy, button and form field, so a page can later be redesigned from the write-up alone. It then adds what the product's docs, reviews and videos say. When the product does not show enough, it studies close competitors or alternatives in the same way.

Everything lands in the project's research tree, inside the module's own folder. The skill works in any project, new or old, with or without the research workspace set up.

`SKILL_DIR` below means the folder this file is in (for example `.claude/skills/product-teardown`). The scripts run with `zsh "$SKILL_DIR/scripts/<name>.zsh"` from the project root.

## When to Use This Skill

- "Research how <product> does <module>", "tear down <product>", "document this SaaS module by module"
- Documenting your own existing product before a redesign or rebuild
- Studying a reference product, a Figma file or a mobile app for inspiration
- A module has too little information, and you want close competitors studied instead

## Ground Rules

1. **Never invent.** Write only what you saw, extracted or read in a cited source. Tag everything else as *(inferred)* or *(unverified)*. Gaps go in the gaps section and in `notes.md`, not into the prose.
2. **Copy is verbatim.** Headings, labels, buttons, messages and help text are quoted exactly as shown, including typos and casing.
3. **Every screen and state.** Default, empty, loading, error, validation, success, disabled, hover and focus where meaningful, every modal, drawer, menu, popover, toast and confirmation. If a state can't be reached, say why.
4. **Desktop only** for web products, at the browser's normal desktop width.
5. **Screenshots are JPEG**, saved with `shot.zsh`, and never overwrite an existing file.
6. **Safe actions only** (see "Safety" below).
7. **Credentials never reach a document,** a screenshot caption, a commit or the chat summary.
8. **Follow the workspace rules.** If the project has `project-management/rules/file-naming-rule.md` or a research `README.md`, read it first and follow it. Otherwise use the naming below: kebab-case, no numbers in folder names, descriptive file names, dates as `YYYY-MM-DD`, no em dashes in file content, and never overwrite a dated file (write a new one).

## Safety

Inside a logged-in product the skill **may**:

- click through everything, open every menu and dialog
- fill and submit forms to reach states, creating sample records whose names start with `teardown-test`

It **never**:

- deletes anything, including its own test records
- pays, upgrades, starts a trial that bills, or enters payment details
- invites, messages or emails real people, or shares anything outside the account
- changes account, billing, security, team or permission settings
- connects integrations or generates API keys

Delete, clear, archive and remove actions are opened up to their confirmation, captured, and cancelled. One with no confirmation step is not triggered; it is documented from its copy, the docs or (for public front-end apps) the shipped code, and listed as "not exercised". Reloading and back/forward are fine.

Every record it creates is listed in the module's `notes.md` under "Test data created", so the user can clean up. It doesn't take a screenshot of a page that shows API keys, tokens or other people's personal data. It describes that page in text instead, with the values replaced by placeholders.

## Workflow

### Step 0 - Preflight

1. **Orca.** Run `orca tab list --json`. If `orca` is not on PATH, try `/Applications/Orca.app/Contents/Resources/bin/orca`. If neither works, stop: this skill needs Orca's browser. Do not fall back to another browser.
2. **Figma connector.** Note whether the Figma MCP tools (`get_metadata`, `get_design_context`, `get_screenshot`) are available.
3. **Research root.** Use the first of these that exists:
   - `project-management/research/`
   - a legacy `research/` at the project root (older workspaces)
   - otherwise `project-management/research/`, created on demand

   Modules live in `<root>/internal/product-knowledge/modules/<module>/` and competitor profiles in `<root>/external/competitor-analysis/profiles/`. Create only the folders this run writes into. Do not scaffold the rest of the workspace.
4. Read `<root>/internal/product-knowledge/modules/README.md` and any project naming rules if they exist.

### Step 1 - Intake

Ask the user, in as few questions as possible:

- **What to research:**
  - live URLs (marketing site, app, docs)
  - Figma links
  - the app's name and store links for native mobile apps
- **Whose product it is:**
  - *Own product* (the user's or their client's): the skill also writes the module definition and user flows.
  - *Reference product*: research files only. It never defines the user's modules from someone else's product.
- **A login,** if the product needs one:
  - Use a saved login if there is one: `zsh "$SKILL_DIR/scripts/secrets.zsh" has <product>`.
  - Otherwise ask for one, recommending a test account rather than a real one, and save it with `printf '%s\n%s\n' "<user>" "<password>" | zsh "$SKILL_DIR/scripts/secrets.zsh" set <product> --url <login-url>`.

    The login is stored in `.claude/product-teardown.local.env`, which is mode 600 and git-ignored. Tell the user where it went.
- **Which modules,** if they already know. Otherwise step 2 proposes them.

`<product>` is a kebab-case slug of the product's name (`acme-crm`), used in file names throughout.

**Browser profile.** Run `orca tab profile list --json`. Reuse the profile labelled `teardown-<product>`, or create one with `orca tab profile create --label teardown-<product> --json`. Open every tab for this product with `orca tab create --url <url> --profile <id> --json`, so one login is shared by all the module agents and remembered between runs.

### Step 2 - Map the product and agree the modules

1. **Log in if needed.**
   - Run `orca snapshot` to find the username and password fields.
   - Fill them with `zsh "$SKILL_DIR/scripts/secrets.zsh" fill <product> --user-ref @eN --pass-ref @eM`. This types the saved login without printing it.
   - Click the submit button.
   - Handle MFA or a captcha by asking the user to finish it in the Orca window, then continue.
2. Walk the main navigation, the account menu, the settings and the footer. Read the sitemap and docs index if there is one.
3. Propose a module list: name (kebab-case), one-line purpose, and entry URL or route. Put any modules that already have folders under `modules/` first, under their existing names.
4. **Wait for the user to confirm or edit the list.** Rename nothing yet, and don't invent modules the product doesn't have.

### Step 3 - Dispatch the module research

Run one subagent per module, **at most 3 at a time**. When one finishes, start the next.

- Before dispatching, create `<module folder>/research/screenshots/` for each module. The agents write only the teardown and the screenshots; `notes.md`, the module definition, the changelogs and the index are written by this session in step 6, from their reports.

- Give each one the brief from `references/module-brief.md`, filled in with everything it needs. The subagent sees nothing else, so leave nothing implied.
- Give each one **its own tab**. Create it with `orca tab create --url <module entry> --profile <id> --json`, and pass its `browserPageId` as `--page <id>` on every browser command.
- In Claude Code, use the Agent tool (general-purpose agents). On a platform without subagents, run the modules one after another yourself, following the same brief.

Each agent returns a short report: screens and states covered, files written, test data created, gaps, and whether the module came back **thin**. Thin means fewer than a handful of screens could be reached, the module is missing or paywalled, or key behaviour could not be seen.

Source-specific playbooks (web and SaaS, Figma, native mobile, and outside research) are in `references/sources.md`. The brief tells each agent to read it.

### Step 4 - Fallback for thin modules

For each thin module:

1. Run a web search for products that do the same job, including direct competitors, adjacent tools, and mobile apps when relevant.
2. Propose **3 to 5** of them to the user, each with a one-line reason and its public URL. The user confirms, removes or adds alternatives, and may give live URLs, Figma files or logins of their own.
3. Dispatch competitor agents with the same brief in *competitor* mode, at most 3 at a time:
   - Their findings go into the module teardown's "How others do it" section, including the full screen element inventory for each competitor screen.
   - Their screenshots go in the module's `screenshots/` folder, prefixed with the competitor's slug.
4. **Competitor profiles:**
   - If `external/competitor-analysis/profiles/<competitor>.md` does not exist, create it from `references/competitor-profile-lite.md`.
   - If it exists, show the user a proposed `## Module teardown: <module>` section and add it only after they approve. Never rewrite the rest of an existing profile.

### Step 5 - Native mobile gap fill

For native apps, the agents first use public sources (see `references/sources.md`). Then list the screens and states nobody could see and ask the user for screen recordings or screenshots from a phone. Analyse what they send:

- Save the stills as JPEG into the module's `screenshots/`.
- Transcribe their elements into the inventory, marked *(transcribed from capture)*.

### Step 6 - Finish

1. **Own-product mode only:**
   - Create or update `<module>.md` (definition: purpose, personas, key screens, status).
   - Create or update `userflows.md` (Mermaid flows), from what the teardown confirmed.
   - Never overwrite the user's own text in these files. Add to it, and mark anything that conflicts.
2. Append to each module's `notes.md`, creating it if missing:
   - open questions and gaps
   - "Test data created": each record's name, where it is, and the date
3. Add any new module to the "Current Modules" list in `modules/README.md`, if that file exists.
4. Add an entry to each changelog that exists:
   - `<root>/CHANGELOG.md`
   - `<root>/internal/CHANGELOG.md`, for the teardowns
   - `<root>/external/CHANGELOG.md`, for competitor profiles

   Follow each file's own entry format and numbering (`R-`, `I-`, `E-`).
5. If `master-doc.md` sync is in use in this workspace, note that the module research changed. Never edit `master-doc.md` by hand.
6. Summarise for the user:
   - per module: screens and states captured, the teardown path, competitors studied, gaps, test data to clean up
   - where the login is stored

## Output Layout

```
<root>/internal/product-knowledge/modules/<module>/
├── <module>.md            own-product mode only
├── userflows.md           own-product mode only
├── notes.md               gaps, open questions, test data created
└── research/
    ├── teardown-<product>-<YYYY-MM-DD>.md
    └── screenshots/
        ├── <product>-<screen>-<state>-<YYYY-MM-DD>.jpg
        └── <competitor>-<screen>-<state>-<YYYY-MM-DD>.jpg

<root>/external/competitor-analysis/profiles/<competitor>.md
```

- **Screen and state names** are short kebab-case words, for example `invoice-list-empty`, `invoice-create-validation-error` or `settings-billing-default`.
- **Full-page captures** end in `-full`.
- **A re-run on the same day:** add `-v2` to the teardown name (`teardown-acme-crm-2026-10-09-v2.md`) and to new screenshots.
- **Linking:** the teardown links each screenshot with a relative path, `![Invoice list, empty](screenshots/acme-crm-invoice-list-empty-2026-10-09.jpg)`.

## Scripts

| Script | What it does |
|---|---|
| `shot.zsh <out.jpg> [--full] [--page <id>]` | Saves a JPEG of the tab's viewport (or the whole page) and prints the path. It refuses to overwrite a file. |
| `elements.zsh [--page <id>]` | Prints JSON listing the page's headings, copy, navigation, tabs, links, buttons, forms with every field (labels, types, placeholders, required, options, validation, help and error text), tables, images, open dialogs and live messages. Hidden elements are skipped and secret values masked. |
| `secrets.zsh path\|list\|has\|user\|set\|fill` | Manages the local login file. `fill` types a saved login into the fields a snapshot found, so the password never appears in the transcript. |

`elements.zsh` reads the DOM; `orca snapshot` reads the accessibility tree. Use both. The snapshot catches custom controls built without native inputs, and it gives the refs needed to click and fill.

## References

- `references/module-brief.md` - the brief given to each module or competitor agent
- `references/teardown-template.md` - section order and the screen element inventory format
- `references/sources.md` - playbooks for web and SaaS, Figma, native mobile and outside research
- `references/competitor-profile-lite.md` - skeleton for a competitor with no profile yet
