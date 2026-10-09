# Source playbooks

Read the section for your source type, then "Outside research", which applies to every teardown.

`ORCA` below is `orca`, or `/Applications/Orca.app/Contents/Resources/bin/orca` when `orca` is not on PATH. Add `--page <id>` to every browser command when you were given a tab.

## Web and SaaS (Orca browser)

**The loop, per screen:**

```
ORCA goto --url <url> --page <id> --json            # or click your way there
ORCA wait --load networkidle --page <id> --json
ORCA snapshot --page <id>                           # refs for clicking, ARIA tree
zsh $SKILL_DIR/scripts/shot.zsh <screenshots>/<product>-<screen>-default-<date>.jpg --page <id>
zsh $SKILL_DIR/scripts/elements.zsh --page <id>     # JSON: headings, copy, links, buttons, forms, tables...
```

**Reading `elements.zsh` output:**

- `forms[].fields[]` gives each field's label, control, placeholder, required, options, min, max, pattern, `help` (from `aria-describedby`) and `error`. Fields outside any `<form>` are in `fieldsOutsideForms`. A field with no `label` is an accessibility finding; take its name from the screenshot.
- `buttons[].classHint` and the screenshot together tell you the button kind (primary, secondary, destructive and so on). `iconOnly: true` with no text is an icon button; name it from `aria-label` or describe the icon.
- `copy[]` is verbatim text grouped by block. Region tells you where it sits. Drop repeated chrome (cookie banners, the footer) after the first screen; say so once.
- `dialogs[]` and `messages[]` only hold what is open or showing at that moment. Capture them while the overlay or toast is visible.
- The snapshot catches controls the DOM walk can miss: custom dropdowns, switches and date pickers built from divs. Reconcile the two lists.

**Reaching states:**

| State | How |
|---|---|
| Validation | Submit the form empty, then with bad values: a malformed email, too short, too long, out of range, a past date. Capture each message. |
| Empty | Look at a new section with no data, a search with no results, or a filter that matches nothing. |
| Populated | Create one or two `teardown-test-*` records. |
| Loading | Often too quick to capture. Describe skeletons or spinners if you saw them; don't fake it. |
| Hover, tooltip | `ORCA hover --element @eN`, then shot. |
| Menus, dropdowns, modals, drawers | Open each one, then shot and extract while it is open. Close with Escape or Cancel. |
| Tabs, steps, wizards | Visit every tab and every step. Go back to see if the data is kept. |
| Long content | Use `shot.zsh --full` for scrolling pages. Scroll down once first so lazy content loads. |
| Responsive | Not needed; desktop only. |

**Practical notes:**

- Dismiss cookie banners with the minimal choice ("Necessary only" or "Reject") before the first screenshot, and note what the banner said once.
- If a click opens a new tab, run `ORCA tab list --json` to find its `browserPageId` and continue there.
- `browser_stale_ref` means the page changed. Snapshot again.
- **No ref for an element.** Some elements get no `@eN` in the snapshot, such as plain labels or rows. Target them with a CSS selector through `exec`, for example:
  - `ORCA exec --command 'dblclick ".todo-list li label"' --page <id>`
  - `ORCA exec --command 'hover ".row:first-child"' --page <id>`

  `click` and `fill` work the same way.
- **Your own `eval` code.** `ORCA eval` keeps one global scope across calls, so a second `const d = ...` fails with "already been declared". Wrap your own expressions as `(() => { ... })()`.
- **Code as a source.** For a public front-end app, when behaviour can't be triggered safely (deletes, clears), the shipped JavaScript can show what it does. Look at the page's script URLs in `ORCA network`, then read the relevant handler. Mark such claims *confirmed (code)*, and never use this on a product where you are logged in to someone's account.
- The first line of `orca snapshot` sometimes reads `undefined - undefined`. That is cosmetic; the tree below it is fine.
- If a session expires, log in again with `secrets.zsh fill`. Report MFA or a captcha as a blocker; don't try to get around it.
- Paywalled or plan-gated features: capture the upsell screen and its copy, note what the plan names unlock, and treat the feature itself as a gap unless the docs show it.

## Figma files

Use the **Figma connector** when it is available, for exact structure and text. Use **Orca's browser** for the screenshot files, because the connector returns images inline, not as files.

1. **Get the file key and node ids from the link.**
   - `figma.com/design/<fileKey>/<name>?node-id=<a-b>` (or `/file/`). In the API, the node id is written `a:b`.
   - If the Figma tools ask for a session first, start one with the file key (`create_session`) and reuse its id.
2. **Map the file.** Use `get_metadata` on the file or page to list the pages and top-level frames. Frames are the screens. Group them into modules by page name, frame name prefix or section, and confirm the grouping when the main session asks.
3. **For each frame:**
   - **Text.** `get_design_context` (or `get_metadata` with text) gives every text layer verbatim, plus component and instance names such as "Button/Primary", "Input/Default" or "Select/Open". Instance names usually say the control type and state, so use them for the Buttons and Forms tables. Variants such as `State=Error` or `Disabled=true` are states.
   - **Screenshot.** Open `https://www.figma.com/proto/<fileKey>?node-id=<a-b>&scaling=contain` (or the design URL) in Orca, wait, then save it with `shot.zsh`. A private file needs a Figma login in the same Orca profile. Ask the user to sign in in the Orca window once.
   - **Flows.** Prototype connections give the user flows. In proto view, click hotspots to follow them and capture each destination.
4. **Separate design from build.** Note what is annotation, what is a placeholder (lorem ipsum, "Label") and what is final copy. Record frames marked as work in progress or drafts.
5. **Without the connector,** do everything in Orca. Navigate the canvas by `node-id` URLs, read text from the screenshots and from the layer panel in snapshots, and mark copy *(read from screenshot)*.

## Native mobile apps

Public research first, then ask the user for captures to fill what is left.

1. **Store listings** (App Store and Google Play). Open them in Orca:
   - Save the listing page with `shot.zsh`.
   - Open each store screenshot and capture it; these are the app's own marketing screens. Mark them *(store screenshot, may be idealised)*.
   - Record the description, the "What's new" history and the ratings.
2. **Mobbin**, if a Mobbin connector or a logged-in Mobbin session exists. Search the app, open its flows for this module, capture each screen, and transcribe its elements. Cite the Mobbin flow URLs.
3. **Video walkthroughs** (YouTube and similar). Open them in Orca, pause on each relevant screen, and capture it with `shot.zsh`. Note the timestamp in the caption. Prefer recent videos and record the upload date.
4. **Web app or help centre.** Many mobile apps have a web version or help articles with screenshots of the app. Use them.
5. **Then the user.** List every screen and state still unseen, and ask for screen recordings or screenshots from a phone. For what they send:
   - Save stills as `.jpg` in `screenshots/` with the usual naming.
   - Transcribe the elements, marked *(transcribed from capture)*.

Elements read from images are less exact than DOM extraction. Say so in "Access and method".

## Outside research (every teardown)

Go beyond the product itself to explain behaviour you can't see and to find real user sentiment.

| Source | What to look for |
|---|---|
| Help centre, docs, API docs | Rules, limits, permissions, edge cases, settings you couldn't reach |
| Changelog and release notes | Recent changes to the module, and what is new or deprecated |
| Reviews (G2, Capterra, TrustRadius, app stores) | Praise and complaints about this module specifically |
| Forums (Reddit, community forums, Stack Overflow) | Workarounds, missing features, confusion |
| Videos and demos (YouTube, webinars, product tours) | Flows behind logins or paywalls, and how vendors pitch the module |
| General web search | Comparisons, teardown articles, case studies |

**How:**

- Use web search and page fetch tools if the platform has them. Use Orca for pages that need JavaScript or a login.
- Cite inline as `([source](url))`.
- Tag each claim:
  - *confirmed*: seen in the product, or stated by the vendor's docs
  - *inferred*: your reasoning from evidence
  - *unverified*: a single third-party claim

  Prefer a primary source plus one independent one before calling something confirmed. When sources disagree, say so.
- Record the date of reviews and videos. Anything older than two years is flagged as possibly out of date.
