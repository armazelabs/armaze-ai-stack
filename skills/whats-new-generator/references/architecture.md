# The changelog architecture

What "good" looks like for the system this skill scaffolds, stripped of any
one project's own file paths. This is the shape to match, adapted to
whatever language, framework and router the target project actually uses -
never copied verbatim.

## Three layers, one shared rendering

**1. Data layer** - a typed (or JSDoc-typed, if the project is plain JS)
domain module with no framework dependency:

- A type/shape for one line of a release: a category (see taxonomy below),
  a short plain-text summary, and an optional link to the thing that
  shipped.
- A type/shape for one release: an id, a version string, an ISO date, and
  an ordered list of the changes above.
- An ordered collection of releases, **newest first**, exposed through one
  accessor function (a `getChangelogEntries()`-shaped seam) rather than
  imported as a raw array everywhere - so the day a real backend exists,
  only that one function's body changes.
- This layer has no UI in it at all. It is the thing both the page and the
  modal read from, so they can never disagree about what a release
  contained.

**2. Two UI surfaces sharing one renderer**

- A **full changelog page**: every release, grouped by category under a
  heading, newest first. For more than a handful of releases, a way to
  jump between them (a rail, a table of contents, an in-page anchor list -
  whatever fits the project's existing page-shell conventions) beats a
  single unbroken scroll.
- A **"what's new" modal**: shown once per browser, the first time it sees
  a version it hasn't recorded seeing yet. It shows only the *latest*
  release, using the exact same category-grouping presentation as the
  page.
- **Both surfaces render changes through one shared, pure function** -
  something like `renderChangeGroups(changes)` - that takes the typed
  `changes` array and produces the New/Improved/Fixed (or equivalent)
  grouped output. Building this twice is how a page and a modal quietly
  end up describing the same release two different ways; one function used
  by both is what makes that impossible by construction.

**3. What keeps the data layer current** - `SKILL.md`'s Update mode, plus the
"Nothing here invents product copy" rule. It reads the data layer's own newest
entry as a watermark, and writes back to the data layer only (and the rendered
`CHANGELOG.md`) - it never touches the UI layer, because the UI layer only ever
reads through the shared accessor and renderer.

## Taxonomy: three categories, not more

`new` / `improved` / `fixed` (labelled "New" / "Improved" / "Fixed", or
whatever plain English fits the target project's own voice - the
underlying three-way split stays fixed). A fourth category is a product
decision for that project's owner to make deliberately, not a default this
skill invents. Grouping by category under a heading (the way a well-known
public changelog reads) is preferred over a chip or badge per line - a
heading per group reads as a changelog; a coloured tag on every row reads
as a tag list.

## The one-entry-per-day rule

**One calendar day is one release entry, never two**, even when several
unrelated commits land through the same day and even when they touch
completely different parts of the product. This is not a stylistic
preference - it is what keeps "what did we ship today" answerable by
looking at one row instead of several. A later commit that revises or
reverts an earlier same-day change gets folded into that day's entry
described by its *final* state, not narrated as a play-by-play. This rule
is genuinely load-bearing: get it wrong once (split one day's work into
several same-day entries) and the changelog's whole purpose - one place
that answers "what changed and when" - breaks, because the same day's work
now lives under more than one heading.

## One source, two outputs

A changelog lives in two places at once: **in the product** (a page, a screen,
a modal) and **as a file at the repo root** that reads well on GitHub. These are
not two changelogs. The data layer is the single source of truth, and the root
`CHANGELOG.md` is rendered from it, in the same change, whenever entries move.

Never let anyone maintain them separately. A hand-edited `CHANGELOG.md` beside a
generated data layer is how the two end up disagreeing about what shipped and
which version it shipped in - the exact drift this structure exists to prevent.

The render uses the `changelog-generator` skill's own markdown shape:
version-led `## <version> (<date>)` headings, newest entry on top. A project
with no UI has no data layer to render from, so there the file itself is the
source.

## Version numbering is never invented

Whether versions bump per release, per day-with-real-work, or something
else entirely is a product decision, not something to default. Whoever
maintains this data layer always *proposes* a version number - by following
whatever pattern the target project's own history already shows (the bump
pattern in its manifest version field, wherever that lives for this ecosystem -
see `stack-detection.md` section 1 - existing git tags, or, on a second and
later run, the pattern already visible in prior entries) - and states it
plainly as a proposal, never a silently decided scheme.

## Failing open, not closed

The "have I seen this version" check for the modal is a convenience, not access
control. Store it on the user record when the project has auth, and in device
storage only when there is no user to attach it to (`stack-detection.md`
section 3). Guard every read and write with that platform's error handling,
and if the value cannot be read
for any reason (private browsing, cleared app data, a denied permission), the
correct failure direction is to **show the modal again**, never to hide it
permanently because a write silently failed.

## What "generic and structural" copy means

Anything this scaffold itself writes - a modal title, a footer button
label, an empty-state line, a page heading - has to be true of any
product wearing this pattern, not a specific claim about the target
project's own features. "What's new" is generic and structural. "New
lobby and forums" is a specific product claim this skill has no standing
to write, because it can't verify the target project has either of those
things.
