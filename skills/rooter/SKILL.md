---
name: rooter
description: Builds and maintains a Rooter - one permanent client-facing entry point at the root of a deployed project that hands the client on to the right experience. Analyses the project to find its real client-facing destinations (website versions, product vs design system, a mobile app, an external deck or Figma file, and the personas under any of them), checks that every link resolves, asks the user to tick the ones that belong in a real multi-select - shown on every run, first time or tenth, rather than filtering silently - then proposes the resulting tree and only builds after confirmation. Each row carries a kind icon and tag (app, system, deck, version, mobile) and an optional status (chosen, new, in progress, archived). Collapses to a straight redirect when there is only one destination - unless a single-destination Rooter is asked for, which is supported and often right for a project about to grow. Config-driven, so "update Rooter and add V3" or "the client chose V2" is a one-line change. Use when asked to add, create, update or change a Rooter, a version chooser, a root chooser or a single entry-point page, to add/remove a version, persona, deck or design system from one, or to mark a destination chosen, in progress or archived.
---

# Rooter

A **Rooter** is the page at the root of a deployed project whose only job is:

> give the client one permanent URL, and help them reach the correct experience.

It is not a dashboard, a landing page or a product page. The client should never
have to hand-edit a URL between `/v1`, `/v2`, `/v3`, a persona route or a design
system route.

**One flow, every time.** Whether this is the first run or the tenth, the steps
are the same: analyse, show the checklist, confirm, build, verify. There is no
separate "create" and "update" path to choose between - whether a Rooter already
exists only changes what comes marked in the checklist.

| Run | What is marked |
| --- | --- |
| **First time** | What detection judges client-facing - `(recommended)` |
| **Later** | Whatever is in the Rooter today - `(in Rooter)` - plus anything newly found, `(recommended)` |

**Always show the checklist.** Even when the instruction names its destination
("add V3") - V3 arrives marked alongside everything already there, and you see
the whole Rooter before it changes rather than one row in isolation.

This is **triggered, never automatic.** Adding a version to a project is not by
itself a reason to run.

## The three rules

Everything else in this skill follows from these. When something is
underspecified, decide it the way these three would.

**1. Collapse is the default, not a prohibition.** With one destination, the
default is no chooser - the root redirects straight through, because a chooser
with one row asks a question that has one answer. This default applies **per
level**: a root with two options can sit above a mobile app whose persona level
collapsed to one.

But a **single-destination Rooter is legitimate and supported.** Build one
whenever the user asks for it, or when the project is clearly about to grow into
more - a first version with a second in progress, one persona of a set being
built. What it buys is the permanent URL: the client is given the Rooter link
once, and later destinations appear underneath it without the link ever
changing. Never refuse to build a Rooter on the grounds that there is only one
destination - propose the collapse, say what it costs, and let the user choose.

**2. Config-driven, never hardcoded.** The destinations live in one data file.
The page reads that file. Nothing about `v1`/`v2`/`v3`, a persona name, a route,
a kind or a status may be baked into the page component, so that adding a
destination - or marking one chosen - is an edit to data and nothing else.

**3. Only meaningful client-facing destinations - and the user decides which.**
Route enumeration is *input*, not output. But do not silently filter: ask, as a
real multi-select with sensible defaults marked, and let the user choose.
`references/detection.md` supplies the judgement; `references/checklist.md`
supplies the mechanics.

**The Rooter lives at `/`. Never ask where to put it.** One permanent URL means
the bare origin - `localhost:3000/`, `client.vercel.app/` - with no path to
remember or mistype. `/start`, `/rooter` and `/choose` are not options, and the
question is never put to the user.

If something already occupies the root - a product homepage, a marketing page -
**move it and take the root.** That is the one permitted edit to a destination
(see "Never"), and it is part of the build, not a question:

- Move the existing root page to a real route (`/app`, `/home`, whichever fits
  the project's naming), and add it to the Rooter as a destination.
- Update internal links, redirects and tests that pointed at `/`.
- Say exactly what moved in the report.

The tree confirmed in phase (d) is where the user sees this coming, and it is
the only approval needed.

**Personas are a sub-level, not an archetype.** A persona chooser hangs under
whichever destination has personas - a Product just as readily as a Mobile App -
and follows rule 1 on its own.

## References

- `references/detection.md` - **read first, every run.** How to classify the
  project, where destinations come from in each archetype, which kind each one
  is, what never becomes a destination, and how to scope a monorepo.
- `references/checklist.md` - how to ask the selection with `AskUserQuestion`,
  how defaults are marked (nothing can be pre-ticked), the 4-option limit and
  how to group around it.
- `references/config-schema.md` - the shape of the config file, kinds and their
  icons, statuses, external links, and the rule that the page never contains
  destination data.
- `references/page-anatomy.md` - the five slots, the row and its tag line,
  branding, accessibility and the responsive behaviour.
- `references/motion.md` - the row hover, its exact values, and what stays
  still.
- `assets/icons/` - the fixed kind icons (`app`, `system`, `deck`, `version`,
  `mobile`), copied into the target project, never linked to.

## Never

- Never make a structural change before the user confirms - unless they said not
  to ask (see "Confirmation").
- Never modify the destinations themselves, with **one exception**: relocating a
  page that occupies `/`, so the Rooter can take the root. The Rooter points at
  experiences; it does not otherwise touch their code.
- Never ask where the Rooter should live. It lives at `/`.
- Never commit. Leave the working tree for the user to review.
- Never mark the product changelog as a default - see `references/detection.md`
  §4.
- Never add a link you could not resolve without saying so.
- Never guess the project name for the footer. Confirm it, or ask.

---

# The flow

## (a) Analyse

Four things, together:

- **The project.** Follow `references/detection.md` - the archetype, the
  candidate destinations, each one's route and kind.
- **The existing Rooter config**, if there is one. That is what gets marked
  `(in Rooter)` in the checklist.
- **Whether every link resolves.** Reuse a dev server that is already running,
  or start the project's own dev script (`package.json` `dev`, or the
  framework's equivalent) in the background. Request each candidate route and
  every `href` in the existing config: internal ones should answer 2xx or 3xx;
  external ones get a `HEAD`, falling back to `GET` where the host refuses
  `HEAD`. A failure goes into that option's `description` in the checklist.
- **The project's name**, for the footer (`Copyright © {year} {project}`). Take
  it from the existing config's `project` if there is one; otherwise from what
  the product calls itself - the `<title>` or brand component, the logo's
  wordmark, `CLAUDE.md` / `README.md`. A `package.json` `name` or repo slug
  (`floorzap-web`) is a hint, not an answer. Note how confident you are; (d)
  uses it.

If the project cannot be served - no dev script, a build that fails, a port you
cannot bind - say so in one line and resolve routes from the file tree and build
output instead. Never block the run on it, and never report a static guess as a
checked result.

Do not write anything yet.

## (b) Ask which destinations belong

**Do not decide which destinations belong in the Rooter. Find the candidates and
let the user tick them**, with `AskUserQuestion`, `multiSelect: true` - a real
tick-box selection, never a list to answer in prose. The judgement in
`references/detection.md` decides what is **marked**; it does not silently
filter. All the mechanics - marking, the 4 × 4 limit, grouping, personas,
**Other**, an empty answer - are in `references/checklist.md`.

One line of context, then the question:

```text
Astro · 3 version trees under src/versions/, all answering 200. 11 machine
routes (/api/*, 404, sitemap) aren't listed — say the word if you want any.
Tick everything that should be in the Rooter.
```

```
AskUserQuestion({ questions: [{
  header: 'Destinations',
  question: 'Which of these belong in the Rooter?',
  multiSelect: true,
  options: [
    { label: 'Version 1 — Field & Plate (recommended)', description: '/v1/ · a complete version tree' },
    { label: 'Version 2 — Register (recommended)',      description: '/v2/ · a complete version tree' },
    { label: 'Version 3 — Broadside (recommended)',     description: '/v3/ · a complete version tree' },
    { label: 'Design system',                           description: '/ds/ · sparse — 2 pages' },
  ],
}]})
```

**Ask it every run**, including when the instruction already named its
destination.

## (c) Apply the collapse default, to the ticked set

Only now - counts come from what was **selected**, not what was found.

A level with fewer than two destinations collapses to a redirect **by default**.
If the user asked for a Rooter anyway, or ticked a single destination
deliberately, build it: a one-row Rooter is a supported shape, not an error, and
renders exactly as it would with more rows.

**An existing Rooter is never torn down.** If a removal drops the root to one
destination, the default flips to *keeping* the Rooter - the client already has
that URL, and collapsing it breaks a link that has been shared. Say so and ask.

An addition can also bring a collapsed level back: a second persona means the
persona chooser now renders where before the parent linked straight through.

If the **root** would collapse on a first run and nothing was said either way,
do not silently skip the work and do not silently build it. Ask with
`AskUserQuestion` - two options, single-select, the recommended one first:

```
{ header: 'One destination',
  question: 'Only one destination was selected. Build the Rooter anyway?',
  multiSelect: false,
  options: [
    { label: 'Build the one-row Rooter (recommended)',
      description: 'The client gets a permanent URL now; V2 appears under it later without the link changing.' },
    { label: 'Redirect straight to /v1',
      description: 'Nothing to choose, nothing in the way. A Rooter can be added when there is a second destination.' },
  ]}
```

Recommend the one-row Rooter where the project is visibly about to grow, the
redirect otherwise - and put the recommendation first, as above.

## (d) Draft the copy, then propose the tree

The checklist settled *which* destinations. It did not settle **nesting** - which
personas hang under which parent - the **words**, or each row's **kind and
status**. They all need one more look.

Draft the title, lede, and one description per selected destination. This is
writing, not detection: draft it from what the codebase actually showed you.
Rules for what the copy may claim are in `references/page-anatomy.md` - put
every destination name in **Title Case** (`Release Notes`, not `Release notes`),
including names that came from the user.

**Settle the project name before proposing.** If (a) found no clear name, or
found more than one (a brand in the title tag, another in the README), ask with
`AskUserQuestion` - single-select, the candidates as options, **Other** for
the right one:

```
{ header: 'Project name',
  question: 'What should the footer call this project? It reads "Copyright © 2026 <name>".',
  multiSelect: false,
  options: [
    { label: 'FloorZap', description: 'From the <title> and the logo wordmark' },
    { label: 'floorzap-web', description: 'From package.json - the repo name' },
  ]}
```

If (a) found one clear name, don't ask separately: it is in the proposal below,
and approving the proposal confirms it.

Then print the tree and the copy, and confirm with `AskUserQuestion` - so the
answer is a click, not a typed "yes":

```text
Proposed Rooter:

Root
├── Version 1
├── Version 2
└── Version 3

Title: Three landing-page designs, built to be compared.
Lede:  Same firm, same constraints, three arguments.

  version · chosen  Field & Plate — A chromatic dark field, rounded media plates, a hero video.
  version           Register — A hairline-ruled modular grid on paper, square everywhere.
  version · new     Broadside — A warm-ink stage at poster scale, display type crossing the plate.

Footer: Copyright © 2026 FloorZap   (name from the <title> — say if it's wrong)
```

```
{ header: 'Implement', question: 'Implement this Rooter?', multiSelect: false,
  options: [
    { label: 'Yes, build it', description: 'Write the config and the page. Nothing is committed.' },
    { label: 'Change something first', description: 'Tell me what to adjust — structure, nesting, kinds or wording.' },
  ]}
```

Nested levels are shown nested:

```text
Root
├── Mobile App
│   └── Select Persona
│       ├── Homeowner
│       ├── Professional
│       └── Admin
└── Design System
```

If they pick "change something first", ask what, then re-propose. Do not build a
structure they have not seen.

## (e) Build, or edit the config

**If a Rooter already exists, this is a config edit and nothing else.** Existing
destinations keep their routes, order and copy; the page component is not
touched. If a change cannot be made in the config, the config schema is wrong
and that is the thing to fix. A Rooter built before kinds existed is the one
case where the page is touched once: add the tag line, give every row a `kind`,
and say so in the report. The same goes for a Rooter whose footer predates the
copyright line: replace the free-text `footer` with `project` and render the
copyright from it. A destination name not yet in Title Case is a copy fix, done
in the same edit.

**If this is the first run**, create three things, and nothing else:

1. The **config file** - `references/config-schema.md`.
2. The **Rooter page at `/`**, rendering the five slots from the config -
   `references/page-anatomy.md` for the anatomy and the branding it should
   inherit, `references/motion.md` for the row hover. Copy the icons the config
   uses from `assets/icons/` into the project. If a page already held the root,
   move it first and carry its inbound links with it.
3. A **second-level page**, wherever a nested level renders under the collapse
   default. Same component, different config node.

Use the target project's own framework, router, language and idiom. Detect them;
do not assume Astro, React or anything else. If the project already had a root
redirect (in a framework config, a `vercel.json`, or similar), remove it - it is
what the Rooter replaces, and leaving it would shadow the new page.

## (f) Verify

Run the link check from (a) again, against the result:

- `/` serves the Rooter - not an old redirect, not the page that used to live
  there.
- Every second-level page answers.
- Every `href` in the config resolves, internal and external.
- A page moved off `/` answers at its new route.

Stop any server this run started. If the project could not be served in (a),
say that the result is unchecked rather than skipping this step quietly.

## (g) Report

Say what was created or changed, what each destination points at, what
collapsed and why, and the result of every link check - failures first. Do not
commit.

---

## Confirmation

Confirmation is required for any **structural** change - adding, removing,
reordering or re-nesting a destination. Marking a row `chosen` or `archived`
moves it, so it is structural too.

The one exception: the user explicitly waives it in the instruction, e.g.
*"Update Rooter and add V3 without confirmation."* Then make the change directly
and report what was done.

Fixing a typo in a description, correcting a route that already points at the
wrong place, changing a kind's tag word or marking a row `in-progress` is not
structural. Just do it.
