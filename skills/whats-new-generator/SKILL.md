---
name: whats-new-generator
description: Builds and maintains a project's changelog. Scaffolds a complete "what's new" system into a project that has none - typed data layer, root CHANGELOG.md, changelog page, last-seen-version modal, nav or footer entry - then seeds real entries from git history and proposes a semver bump. Also updates an existing changelog with entries for recent commits, and writes reader-facing update posts. Adapts to the target's actual language, framework, router and components rather than assuming any of them. Use when asked to add a changelog, release notes or a "what's new" popup to a project, to update a changelog with recent work, or to draft a weekly/monthly update post.
---

# What's new generator

One skill, three jobs. Pick the mode from what the project already has and
what was asked, and say which mode you are in before starting.

| Mode | When | What to do |
| --- | --- | --- |
| **Scaffold** | Project has no changelog system | Phases (a)-(h) below, in full |
| **Update** | Changelog exists; asked to add recent work | Skip to "Update mode" |
| **Post** | Asked for an update post / release notes for readers | Skip to "Post mode" |

Update and Post modes are **triggered, not automatic** - finishing a task is
not by itself a reason to touch the changelog.

## The engine

The **`changelog-generator` skill** does the raw work in every mode: scanning git
history, filtering internal noise (docs-only, tooling, refactor, test and
version-bump commits), and translating technical commits into user-facing copy.

**Invoke it as a skill** - it is a separate, standalone skill, not a file in this
directory. Every mode below calls it for the copy, then layers its own rules on
top. Don't reimplement what it already does, and don't edit it to change output
here: it is a verbatim copy of an upstream skill, and the layering below is how
this skill adapts it.

Two things it does **not** cover, both handled by the references here:

- It reads a version from **`package.json` only**, which is correct for Node
  and wrong everywhere else. `references/stack-detection.md` section 1 maps
  every ecosystem to its real version source and supersedes that rule.
- It has **no semver policy** - nothing about when a change warrants a patch,
  minor or major, and its "bump the version" example never says how. The
  semver rules live in `references/entry-rules.md` ("Versioning"), which also
  covers pre-1.0, the reset rule, and keeping the manifest in sync.

The references say what to do with what it produces - each one assumes the
generator has already been called for the copy, then layers its own rules:

- `references/stack-detection.md` - **read this first in every mode.** Which
  ecosystem this is, where the version lives, what surface it has, which
  storage API, and how to scope a monorepo. It is what keeps this skill
  stack-agnostic.
- `references/entry-rules.md` - grouping, the one-entry-per-calendar-day rule,
  versioning, links, never committing. Used by Scaffold and Update modes.
- `references/newsletter-format.md` - the reader-facing output format. Used by
  Post mode.
- `references/architecture.md` - the shape of the system Scaffold mode builds.
- `references/a11y-defaults.md` - the modal accessibility checklist.

---

# Scaffold mode

Builds the changelog system documented in `references/architecture.md` into
whatever project you're working in - adapted to that project's own language,
framework, router and components, never assumed. Read
`references/architecture.md` before starting: it's the shape every phase below
is matching.

**Nothing here invents product copy.** Any copy this skill writes while
scaffolding - a modal title, a footer button label, an empty-state line, a page
heading - stays generic and structural, never a specific claim about the target
project's own features (see `references/architecture.md`'s closing section for
what that distinction means in practice). Any change description written while
seeding the first entries (phase g) must trace to an actual commit or diff in
the target repository.

**Every scaffold invocation is one full pass, phases (a) through (h),
end-to-end.** Seeding real entries (phase g) is a **mandatory part of every
run, not an optional or interactive step** - the only things phase (a) ever
asks you about are genuinely ambiguous *content* placement decisions.

## (a) Detect stack and conventions; ask only when genuinely ambiguous

**Start with `references/stack-detection.md`**: find the manifest (not
necessarily `package.json`), identify the surface, decide where the seen-version
is remembered, and scope a monorepo. That file carries the decisions that are
easy to get wrong; everything else about the stack you establish by reading the
project.

Then inspect the target for what you will actually be editing:

- **Language and idiom** - the dominant file extensions in the directories you
  will touch, and whether types are enforced (a `tsconfig.json`, type hints,
  a strict compiler setting). Match what is there; never introduce a type
  system a project has not adopted.
- **UI toolkit** - an existing dialog/modal primitive (`@radix-ui/react-dialog`,
  `@headlessui/react`, `@chakra-ui/react`, `@mui/material`, `antd`, a
  `components.json` for shadcn, Flutter's `showDialog`, SwiftUI's `.sheet`,
  a Compose `Dialog`) and the styling approach (Tailwind, styled-components,
  CSS Modules, a native stylesheet). Grep component directories for
  `Modal`/`Dialog`/`Sheet` exports before deciding to build one.
- **Auth** - a users/accounts table or model, session or auth middleware, a
  current-user hook, provider or context. Its presence decides where the
  seen-version is stored (stack-detection section 3) and whether the modal has
  a sensible mount point at all.
- **Existing nav/header/menu/footer** - grep for `Header`, `Nav`, `Navbar`,
  `AppShell`, `SiteChrome`, `Sidebar`, `MenuBar`/`MenuItem`, `Footer`,
  `SiteFooter`, a `TabBar`, a drawer, or the platform's equivalent, and read
  whichever ones actually render everywhere. **On a marketing site, find the
  footer specifically** - that is where the changelog link belongs (phase e),
  so "no footer found" is itself worth knowing.
- **Git history depth** - `git log --oneline -20` (scoped to the paths from
  stack-detection section 4, if this is a monorepo) to confirm there is real
  material for phase (g) to seed from.
- **Existing `.claude/skills/`** - check for a name collision (an existing
  `whats-new-generator/` or `changelog-generator/`) before writing.
- **Root instructions file** - `CLAUDE.md`, `AGENTS.md`, or an equivalent, for
  the installed skill's "Before you start" section.

**Ask the user directly (never guess) only for genuinely ambiguous
decisions**, such as:

1. More than one plausible placement (a top navbar *and* an account or overflow
   menu, say) - ask where "View changelog" belongs. This is a product/IA call,
   not something to infer from file structure. Don't ask on a marketing site
   with a footer: phase (e) settles that one.
2. No modal/dialog primitive found - confirm building a minimal one (see phase
   d) is acceptable rather than silently pulling in a new dependency.
3. No router detected, or the project has no routing at all - ask whether the
   changelog should be a real route, a modal-only experience, or a section on
   an existing page.
4. The project **already has a root `CHANGELOG.md`** - never overwrite it
   silently. Ask which of these it should become:
   - **Adopt** - keep its existing entries, seed the data layer from them, and
     regenerate the file from the data layer going forward (usual answer).
   - **Regenerate** - rebuild it from git history, replacing what's there.
   - **Leave alone** - maintain it by hand, and the data layer renders nothing.
   If releases are driven by git tags, ask the same question about those.
5. No obvious first-authenticated landing page, or no auth at all - ask where
   the modal should mount, or whether it should exist. For a static or
   marketing site the honest answer is usually that it should not. If there
   *is* auth but no obvious place to persist a per-user field, ask before
   falling back to device storage - that fallback silently loses the
   cross-device behaviour.
6. A name collision in `.claude/skills/` - ask overwrite vs. rename, never
   whether to have the file at all.
7. **Monorepo** - which paths the changelog covers, and whether it is one
   shared changelog or one per surface (stack-detection section 4).
8. **No UI surface at all** (CLI, library, service) - confirm that a root
   `CHANGELOG.md` is the deliverable and phases (c)-(e) are skipped.

Everything else - prop names, exact file extensions, indentation, import style -
gets inferred by matching the target project's own existing code, not asked
about.

## (b) Data layer

Written in the project's own language, with its own idiom for a typed domain
model - TypeScript interfaces, JSDoc on plain JS, Dart classes, Swift structs,
Kotlin data classes, Python dataclasses, Go structs. Never introduce a type
system the project has not adopted.

Place it beside whatever convention the project already uses for shared domain
logic (`lib/`, `src/lib/`, `src/domain/`, `models/`, `Models/`, or the project
root if nothing is established - match a sibling module if one exists). Follow
the shape in `references/architecture.md`'s "Data layer" section:

- A types module: the three-way category, one change, one entry.
- An entries module: an empty, newest-first collection (seeded in phase g)
  behind one accessor function.
- A short `readme.md` describing the flow, pointing at this project's own
  real paths - never carry another project's paths into it.

**Also write a root `CHANGELOG.md`.** The project gets its changelog in two
places - in the product, and as a file at the repo root that reads fine on
GitHub - but they are **one source with two outputs**, never two things kept in
step by hand:

- The data layer is the source of truth.
- `CHANGELOG.md` is **rendered from it**, in the same working-tree change,
  every time entries change. Never edit it directly.
- Use the `changelog-generator` skill's own markdown shape for that render -
  version-led `## <version> (<date>)` headings, newest first. That is its
  native output format and the one people expect in a repo file.
- If the file already exists, phase (a)'s ask #4 has already resolved what to
  do with it. On "adopt", seed the data layer from its existing entries first,
  so nothing is lost, then render over it.

If the surface has no UI at all (stack-detection section 2), there is no data
layer to render from: `CHANGELOG.md` *is* the source of truth, written directly
by the `changelog-generator` skill. Skip the rest of this phase along with
(c)-(e).

Resolve phase (a)'s ask #4 here, before writing anything else in this phase -
on "adopt", the existing file's entries are what you seed from; on "leave
alone", write no `CHANGELOG.md` at all and say so in the report.

## (c) Changelog page

Written in whatever language and UI framework phase (a) actually detected
for this project - never assumed to be React or TypeScript by default.
Route shape follows the detected router:

- **Next App Router**: a thin `app/changelog/page.tsx` (or `.jsx`) plus a
  testable component taking data as props.
- **Next Pages Router**: `pages/changelog.tsx` (or `pages/changelog/index.tsx`).
- **Plain React Router / TanStack Router**: a new route entry in the
  existing router config, plus a page component under wherever views
  already live.
- **Vue Router / SvelteKit / Angular**: the equivalent route/view file for that
  framework's own convention.
- **Expo Router**: a file-based route under `app/`. **React Navigation**: a new
  screen registered on the existing navigator.
- **Flutter**: a `GoRouter` route or `MaterialApp.routes` entry plus a
  `StatelessWidget` screen.
- **SwiftUI**: a `NavigationStack` destination view. **UIKit**: a view
  controller. **Android**: a Compose `NavHost` destination.
- **Server-rendered** (Rails, Django, Laravel, Phoenix): a route plus template
  in that framework's convention.
- **Static site** (Astro, Hugo, Jekyll, Eleventy): a content page in the
  project's own page format.
- **No router** (resolved by phase (a)'s ask): a modal-only experience or an
  anchor section on an existing page.

Build one shared, pure "grouped changes" renderer - New/Improved/Fixed
headings, empty groups never rendered - in whatever unit this platform composes
with (a component, widget, view, or partial), and use it from **both** the page
and the modal. See `references/architecture.md`'s note on why this has to
be one function used twice, not two functions that happen to agree today.
Reuse the target's own existing page shell/layout wrapper rather than
inventing new chrome.

## (d) "What's new" modal

Same rule as (c): written in the target's own detected language and
framework, never assumed.

If phase (a) found an existing dialog/modal primitive, read its actual API from
source before wiring anything to it - don't assume Radix, Headless UI, MUI,
Chakra, a Vue/Svelte equivalent, Flutter's `showDialog`, SwiftUI's `.sheet` or a
Compose `Dialog` share a shape with each other. If none exists, build a minimal
accessible one, checked against `references/a11y-defaults.md` (which is
DOM-shaped - its platform-equivalents section covers the rest).

**Gate it per `references/stack-detection.md` section 3.** If the project has
auth, the seen-version belongs on the user record, not in device storage; device
storage (`localStorage` and its per-platform equivalents) is the fallback for
surfaces with no user. Either way: namespace the key
(`<project-slug>:changelog:last-seen-version`), wrap read and write in the
platform's error handling, and **fail open** - if the value can't be read, show
the modal, never silently suppress it. Server reads and non-web device APIs are
async, so handle the pending state without flashing the modal.

Mount point is whatever phase (a)'s ask resolved (the first authenticated
landing page, the app's root layout, or - on a static/marketing site - nowhere,
if the ask concluded the modal shouldn't exist).

## (e) Nav entry

**On a marketing site or any surface with no user accounts, the link goes in the
footer, not the top nav.** A marketing site's header exists to convert visitors
- Product, Pricing, Docs, Login - while a changelog serves people who are
already customers. Putting it in the primary nav spends conversion space on
retention content. Add it to the footer's "Resources" or "Product" column
alongside Docs, Blog and Status, matching the footer's existing link component.

Do this even when the navbar is the only nav component phase (a) found - a
single obvious *nav* slot is not evidence that the navbar is the right slot
here. If there is no footer at all, ask rather than defaulting to the header.

**On a product with user accounts**, the usual slots apply: if phase (a) found
exactly one obvious one, add "View changelog" there, using whatever existing
nav-item component, tab, drawer row or menu item and icon convention the project
already has.

Either way, if phase (a) flagged multiple plausible slots or none, use the
user's answer from that ask rather than picking silently - placement is a
product/IA call, not something to infer purely from file structure.

## (f) Install this skill into the target project

**Two directories, both required.** This skill calls `changelog-generator` by
name, so installing one without the other leaves a broken call in the target.

1. Copy this entire skill directory - `SKILL.md` and all four reference files -
   to the target's `.claude/skills/whats-new-generator/`, adjusting only the path
   hints in "Update mode" step 1 to the real data layer files this run
   scaffolded in phase (b). Everything else is project-independent and gets
   copied unchanged.
2. Copy `.claude/skills/changelog-generator/` to the target's
   `.claude/skills/changelog-generator/`, unmodified.

For either one, if the target already has it, leave the existing copy alone
rather than overwriting a version that may already be customized. Confirm both
are present before phase (g) - that phase invokes the generator.

**Install a skill, never an agent.** A skill runs in the main thread where its
work is visible and correctable, and the harness picks it up in the same
session it is written - an agent file written mid-session is not reliably
registered, which is what made phase (g) a documented risk in an earlier
version of this design.

## (g) Seed initial entries - mandatory, every run

Run "Update mode" below against the target repo's existing git history to
produce the first real entries. Nothing produced here gets committed.

## (h) Report back

State plainly, in the final response:

- Every file created or edited, as concrete paths: the data layer, the root
  `CHANGELOG.md`, the page, the modal, the nav-component edit, and both
  installed skills (`whats-new-generator` and `changelog-generator`).
- What to verify: the project's own verify/test commands, read from its
  manifest, scripts or CI config.
- Which phases you skipped and why - (c)-(e) for a project with no UI surface,
  or the modal on a static site.
- That nothing was committed - the scaffold and any seeded entries sit as an
  uncommitted diff for review.
- Any decision that's genuinely the project owner's to make - the version bump
  in particular, named as a proposal with its reasoning.

---

# Update mode

Drafts entries for recent commits into a changelog that already exists.

1. **Locate the data layer and read the schema.** Find the project's changelog
   modules - conventionally a types file and an entries file beside each other
   (e.g. `lib/changelog/types.ts` and `lib/changelog/entries.ts`, but match
   what this project actually has, in its own language). A project with no UI
   keeps its changelog as a root `CHANGELOG.md` instead. Read the schema for
   the exact entry shape. If there is no changelog anywhere, switch to Scaffold
   mode rather than improvising one.

2. **Find the watermark.** The entries array is newest-first, so element 0 is
   the last thing recorded; its `date` (and `version`) is where you work
   forward from.

3. **See what shipped.** `git log --since="<watermark date>" --oneline`, and
   `git log -p` on anything ambiguous. **In a monorepo, scope it to the paths
   this changelog covers** - `git log --since=... -- app/` - per
   `references/stack-detection.md` section 4. A backend commit can be entirely
   real and still irrelevant to an app's changelog. Prefer conventional-commit prefixes
   (`feat`, `fix`, `refactor`) where present; read the diff where they aren't.

4. **Write the copy** by invoking the `changelog-generator` skill, then
   **shape it** per `references/entry-rules.md` - categories, the
   one-entry-per-day rule, the semver bump rules, and links.

5. **Write the entry, don't commit.** Prepend a new entry (or extend the
   existing newest one, per the per-day rule), keeping the array newest-first
   and matching the file's existing style. Working-tree edit only.

6. **Re-render the root `CHANGELOG.md`** from the data layer in the same change,
   so the file and the data layer never disagree. Update the manifest version
   in the same change too (see `references/entry-rules.md`). A project with no
   data layer skips this - its `CHANGELOG.md` was written directly in step 5.

7. **Validate.** If a test for the entries file exists, run it with the
   project's own test runner to confirm the draft is structurally valid -
   unique id, valid ISO date, non-empty type list within the taxonomy,
   non-empty body.

8. **Report**: what you drafted and the commit range; any commits left out
   because you couldn't summarize them confidently, and why; the proposed
   version **with the reason for that bump level** ("MINOR - the entry adds a
   `new` change"), flagged as a proposal; that you updated the manifest version
   and re-rendered `CHANGELOG.md`; and that nothing was committed.

---

# Post mode

Writes a reader-facing update post instead of touching the data layer.

Gather and word the content by invoking the `changelog-generator` skill, then
format it per `references/newsletter-format.md` - which overrides **only** the output
format (period-titled heading, emoji-marked sections) and leaves the generator's
filtering rules fully in force.

Ask where the post should go if that isn't obvious - a file, a PR body, or just
the response. Don't write it into the repo changelog; that's Update mode.
