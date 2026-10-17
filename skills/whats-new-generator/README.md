# What's New Generator

This skill builds and maintains a project's changelog: a data layer, `CHANGELOG.md`, a changelog page and a "what's new" modal, seeded from git history. It also writes update posts, and never commits.

## When to Use This Skill

- Adding a changelog or "what's new" popup to a project that has none
- Adding recent work to an existing changelog
- Drafting a weekly or monthly update post for readers
- Writing App Store or Play Store release notes
- Working out the next version number from what changed

## What This Skill Does

1. **Picks a Mode**: Scaffold, Update or Post, and says which one it is in
2. **Reads the Stack**: Finds the version source, kind of surface, auth and monorepo paths
3. **Scaffolds the System**: Data layer, `CHANGELOG.md`, page, modal and a nav or footer link
4. **Writes Real Entries**: One per day from git history, grouped as New, Improved, Fixed
5. **Proposes the Version**: Suggests a semver bump with its reason
6. **Writes Update Posts**: Period posts, or store notes within the character limit

## How to Use

### Basic Usage

Install it together with `changelog-generator`, which it calls by name:

```
aistack add whats-new-generator changelog-generator
```

```
Add a changelog and a "what's new" popup to this project
```

### Update an Existing Changelog

```
Update the changelog with recent work
```

### Write an Update Post

```
Draft this month's update post for our users
```

### Store Release Notes

```
Write Play Store release notes for this week's changes
```

## Example

**User**: "Update the changelog with recent work"

**Output**:

```
Update mode. Drafted the 2026-10-17 entry in lib/changelog/entries.ts
from 6 commits since 2026-10-14:

  New       Teams can invite members with a link
  Improved  Search includes archived projects
  Fixed     Scheduled reports use the right time zone

Left out: 1 commit I couldn't summarize confidently (a3f91c0, "wip").
Proposed version: 2.6.0 - MINOR, because the entry adds a `new` change.
Updated package.json to 2.6.0 and re-rendered CHANGELOG.md.
Nothing was committed.
```

## Tips

- Install `changelog-generator` with it; every mode calls it for the wording
- Update and Post run only when you ask
- Review the diff and commit it yourself
- The version is only a proposal; it never bumps to `1.0.0` on its own
- Don't hand-edit `CHANGELOG.md` when a data layer renders it
- A CLI, library or service gets only a root `CHANGELOG.md`, no page or modal

## Related Use Cases

- `changelog-generator`, the engine that turns commits into user-facing copy in every mode
- `project-kickoff`, which ticks this skill for websites and SaaS and offers it for mobile apps, to install now and scaffold once code exists
- Store release notes for each mobile release, alongside the in-app changelog

## Files It Writes

On a scaffold, in the project's own paths and language:

- The data layer: a types module, an entries module and a short `readme.md` beside them (for example in `lib/changelog/`)
- The root `CHANGELOG.md` and the manifest's version
- The changelog page or screen, the "what's new" modal, and the nav or footer edit
- `.claude/skills/whats-new-generator/` and `.claude/skills/changelog-generator/`, only when either is missing
