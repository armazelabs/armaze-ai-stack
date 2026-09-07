# Entry rules

How commits become entries, once the `changelog-generator` skill has done the raw work
of reading git history and turning commits into user-facing copy.

The generator supplies the **copy**. These rules supply the **shape** - how it
is grouped, dated, versioned and written down. Versioning in particular is
*only* here: the generator reads a version, it never decides one. Two of the generator's own rules
do not apply when writing into a structured data layer: it targets a root
`CHANGELOG.md` with version-led headings (`## <version> (<date>)`), whereas an
entry here is a data object. Take its copy method, not its file target or
heading format.

In a monorepo with one changelog per surface, every rule below applies **per
collection** - each surface has its own watermark, version and day.

**Three categories.** `new`, `improved`, `fixed` - that is the whole taxonomy.
Confirm the exact identifiers against the project's types file; the concepts are
fixed but the spelling is the project's. A commit that can't be confidently
placed or summarized is **named in the report as skipped, never guessed at**.

**One entry per calendar day - settled, not open.** Munawar hit this directly on
2026-08-26: an earlier draft split one day's work into three same-day entries
(v0.5.0, v0.6.0, v0.6.1) as commits kept landing through the day, and it broke
the changelog's whole purpose - a page built that morning sat under a different
rail entry than one built that evening, so "what did I ship today" meant
checking three rows instead of one. They were merged back into a single entry
the same day. So: **before drafting a new entry, check whether the newest
entry's `date` is the same calendar day as the commits being added.** If it is,
extend that entry's `changes` array instead of prepending a new one - no matter
how many commits landed or how unrelated they look. A new entry is for a new
day, never for "this batch feels like a distinct drop." Same-day commits that
revise or revert earlier same-day work get described by their **final state**
once the day's commits are all in, not as a play-by-play.

## Versioning

### What the numbers mean

`MAJOR.MINOR.PATCH` - e.g. `2.5.0`. Each part is a claim about **breakage**,
not about effort:

| Part | Bump when | Result |
| --- | --- | --- |
| MAJOR | something that worked before no longer does | `2.5.3` -> `3.0.0` |
| MINOR | something new was added, nothing broke | `2.5.3` -> `2.6.0` |
| PATCH | a bug was fixed, nothing added, nothing broke | `2.5.3` -> `2.5.4` |

**Bumping a part resets everything to its right to zero.** `2.5.3` plus a
feature is `2.6.0`, never `2.6.3`. A one-line rename that breaks callers is a
MAJOR; three months of purely additive work is a MINOR.

### Mapping the day's changes to a bump

Take the highest that applies across **all** changes in the entry:

- any change that removes a feature, forces a migration users can't undo,
  invalidates sessions, or changes a documented contract -> **MAJOR**
- else any `new` change, or an `improved` one that adds capability -> **MINOR**
- else (only `fixed`, or cosmetic `improved`) -> **PATCH**
- no user-visible change at all -> **no entry and no bump.** Don't manufacture
  one to mark that a day had commits.

For an application rather than a library there is no public API, so "breaking"
means user-facing rupture: a removed feature, a destructive migration, a forced
re-login, a changed plan or pricing tier. Internal refactors are never MAJOR no
matter how large.

### Before 1.0.0

Below `1.0.0` the compatibility promise doesn't apply yet and everything shifts
one place left: `0.x` behaves as the major, `0.x.y` as the minor. A breaking
change pre-1.0 is normally `0.5.2` -> `0.6.0`, not `1.0.0`. Reaching `1.0.0` is
a deliberate declaration that the shape is stable enough to promise against -
**never bump to it automatically**; if the work looks like it warrants 1.0, say
so and let a human decide.

### Interaction with the one-entry-per-day rule

The bump is computed **once, from the entry's final contents** - not per commit.
If a day's entry starts as a fix (PATCH) and a feature lands later the same day,
the entry is extended *and its proposed version is recomputed upward* to MINOR.
Never stack two bumps for one day, and never leave the version reflecting only
the first thing that landed.

### Writing it down

The entry's version and the project's manifest version must agree. Read the
manifest from `stack-detection.md` section 1 - `package.json`, `pubspec.yaml`,
`Info.plist`, `build.gradle`, `Cargo.toml`, `pyproject.toml`, or git tags when
there is no manifest field at all. Then:

- Update the manifest version in the same working-tree change as the entry, so
  the two never drift.
- **Re-render the root `CHANGELOG.md` from the data layer in that same change.**
  The entry, the manifest version and the file all move together or none of them
  do. Never hand-edit `CHANGELOG.md`.
- Preserve the ecosystem's extra parts rather than dropping them: a Flutter
  `1.2.3+45` keeps and increments the `+build`; an iOS `CFBundleShortVersionString`
  pairs with a separate `CFBundleVersion`; a `-beta.1` pre-release suffix is not
  a semver part to bump past without being asked.
- Where releases are driven by git tags rather than a manifest field, propose
  the tag - don't create it.

### Still a proposal

Apply the rules above to reach a number, then **state it as a proposal with the
reasoning** ("MINOR, because the entry adds a `new` change") and let a human
confirm. Whether this project bumps per release or per day carrying real work is
its own call, and a project with an established pattern that contradicts these
defaults keeps its pattern - follow what its history actually shows and say that
you did.

**Links.** Where a change clearly maps to a specific route or feature, propose
`link: { href: "..." }`. Leave it unset otherwise - most fixes have nothing
user-visible to point at, and an invented link is worse than none.

**Never commit.** Working-tree edits only - never `git commit`, `git add`, or
`git push`. The point is a reviewable diff: a drafted entry isn't real until a
human has read it.
