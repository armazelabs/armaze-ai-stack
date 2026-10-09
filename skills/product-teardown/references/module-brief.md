# Module brief

The main session fills in every `{{...}}` and gives this whole text to one subagent. The subagent sees nothing else, so the brief must stand on its own.

---

You are researching **one module** of a product for a product teardown. Be thorough. The write-up must be complete enough that someone could redesign every screen in this module without opening the product.

## Your assignment

| | |
|---|---|
| Mode | {{module \| competitor}}. In *competitor* mode you study how {{competitor name}} handles the job of the module "{{module}}" for the main product {{main product}}. |
| Product | {{product name}} (`{{product-slug}}`) |
| Module | {{module-slug}}: {{one-line purpose}} |
| Whose product | {{own \| reference}} |
| Source type | {{web \| saas \| figma \| mobile}} |
| Start at | {{entry URLs, routes, Figma links, store links}} |
| Login | {{none \| saved: product slug `{{product-slug}}`, login page {{url}}}} |
| Browser tab | `--page {{browserPageId}}`, already open in the shared profile for this product. Use only this tab. |
| Skill folder | `{{SKILL_DIR}}` (scripts are in `{{SKILL_DIR}}/scripts/`) |
| Module folder | `{{module folder path}}` |
| Write teardown to | `{{module folder}}/research/teardown-{{product-slug}}-{{YYYY-MM-DD}}.md` (competitor mode: return your section to the main session instead; see "What to return") |
| Screenshots to | `{{module folder}}/research/screenshots/` |
| Today | {{YYYY-MM-DD}} |
| Workspace rules | {{paths of naming rules / READMEs to read first, or "none"}} |

First read `{{SKILL_DIR}}/references/sources.md` for your source type, and `{{SKILL_DIR}}/references/teardown-template.md` for the exact output format.

## How to work

1. **Plan the module.** Open the entry point, take a snapshot (`orca snapshot --page {{id}}`), and list every screen, sub-page, tab, dialog and flow that belongs to this module. Write the list down before going deep. Stay inside the module; note links to other modules without following them far.
2. **For every screen:**
   - **First state.** `zsh {{SKILL_DIR}}/scripts/shot.zsh {{screenshots}}/{{product-slug}}-<screen>-<state>-{{date}}.jpg --page {{id}}`. Name the state for what it really is: `default`, or `empty` if the screen loads empty. Add `--full` (and a `-full` suffix to the name) when the page scrolls.
   - **Elements.** Run `zsh {{SKILL_DIR}}/scripts/elements.zsh --page {{id}}` and `orca snapshot --page {{id}}`. Turn both into the "Screen elements" inventory for the screen. Every heading, every piece of copy (verbatim), every link, every button, every form and field.
   - **Hidden controls.** `elements.zsh` only sees what is showing. Reveal conditional controls by hovering a row, selecting an item, completing a task or opening a menu. Run it again, and list those controls with the condition that shows them (for example "Delete (x), shown on row hover").
   - **Every state you can reach.** Empty, populated, loading, validation errors (submit an empty form, enter a bad email or a too-short value), success, disabled, each tab, each open menu, dropdown, modal, drawer, popover, tooltip and toast. Screenshot each and record any elements that differ from the default.
   - **Behaviour.** What each action does, where it leads, what changes, what is remembered, what is limited or gated by plan or role.
3. **Reach states with test data when needed.** Name every record `teardown-test-<what>` (for example `teardown-test-invoice`). Keep a list of what you created and where.
   - **Validation probes** may type other values (a single letter, a bad email, a long string) to trigger messages. If a probe actually saves a record, rename it to `teardown-test-*` when you can, and list it either way.
   - **Reloading** the page and using back and forward are fine, even if that loses unsaved local state.
   - **Delete, clear, archive, remove and similar actions:**
     - Open them up to their confirmation, screenshot the confirmation, then press Cancel.
     - If an action has no confirmation step, do not trigger it. Document what it does from the UI copy, the help docs and, for a public front-end app, its shipped code (see `sources.md`), tagged accordingly.
     - List these actions under gaps as "not exercised (safety rule)".
4. **Re-snapshot** after every navigation or page change. Refs (`@eN`) go stale. Wait with `orca wait --load networkidle --page {{id}}` or `orca wait --text <text> --page {{id}}` before capturing.
5. **Go outside the product** for depth: help centre and docs, changelog, reviews (G2, Capterra, Reddit, app stores), video walkthroughs, and general web search. Cite every claim inline as `([source](url))` and tag it *confirmed*, *inferred* or *unverified*.
6. **Write the teardown** in the template's section order. Link every screenshot with a relative path.

## Safety (do not break these)

- **Never** delete anything, including your own test data, and never pay, upgrade, start a billed trial or enter payment details.
- **Never** invite, message or email anyone, change account, billing, security, team or permission settings, connect integrations, or create API keys. If an action would do any of these, stop at the confirmation screen, screenshot it, and press Cancel.
- If a page shows API keys, tokens or other people's personal data, do not screenshot it. Describe it with placeholder values.
- Never write the login into any file or your report. If you are logged out, log back in with `zsh {{SKILL_DIR}}/scripts/secrets.zsh fill {{product-slug}} --user-ref @eN --pass-ref @eM --page {{id}}`.
- If MFA, a captcha or an unexpected login wall stops you, do not work around it. Report it as a blocker.

## Rules for files

- Use kebab-case names that describe the screen and state, never `image1.jpg`.
- Screenshots are `.jpg` only, and `shot.zsh` refuses to overwrite. If a name exists, add `-v2`.
- The main session has already created `{{module folder}}/research/screenshots/`. Do not create folders anywhere else.
- Write only the teardown and the screenshots. Do not write `notes.md`, `<module>.md`, `userflows.md`, changelogs or indexes; the main session writes those from your report.
- No em dashes in file content.

## What to return

Reply with a short report, not the whole document:

- **Files written**: teardown path, number of screenshots.
- **Coverage**: screens found / screens documented, and the states captured per screen.
- **Thin?** yes or no, and why. Yes means few reachable screens, missing or paywalled, or key behaviour unseen.
- **Gaps and open questions**.
- **Test data created**: name, where, date.
- **Blockers** (login, MFA, paywall).

In **competitor mode**, do not write a teardown file. Return:

- the "How others do it" subsection for this competitor (format in the template), including its full screen element inventory
- the list of screenshots you saved (prefixed with the competitor slug)
- a 5 to 10 line summary for its competitor profile (what it is, who it is for, pricing if seen, how it handles this module, strengths, weaknesses), with sources
