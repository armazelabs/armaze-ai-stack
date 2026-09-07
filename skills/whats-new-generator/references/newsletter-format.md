# Newsletter format

An alternative **output format only** - for a reader-facing update post (a weekly
or monthly announcement, an in-app "what's new" blast) rather than a repo
`CHANGELOG.md` or a structured data-layer entry.

Gather and word the content per the `changelog-generator` skill, then
override **only its output format** with the template below. Its filtering
rules still apply in full. Two of its rules are superseded here: the document is
period-titled rather than version-led, and categories are emoji-marked `##`
sections rather than `###` sub-groups with bold-lead bullets.

```markdown
# Updates - Week of March 10, 2024

## ✨ New Features

- **Team Workspaces**: Create separate workspaces for different
  projects. Invite team members and keep everything organized.

- **Keyboard Shortcuts**: Press ? to see all available shortcuts.
  Navigate faster without touching your mouse.

## 🔧 Improvements

- **Faster Sync**: Files now sync 2x faster across devices
- **Better Search**: Search now includes file contents, not just titles

## 🐛 Fixes

- Fixed issue where large images wouldn't upload
- Resolved timezone confusion in scheduled posts
- Corrected notification badge count
```

- **Title**: `# Updates - <period>`, matching the range the commits cover.
- **Sections** in that order; omit any section with nothing in it - never print
  an empty heading.
- **New Features**: bold name, colon, one or two sentences of what it does for
  the reader. Blank line between entries.
- **Improvements**: bold name, colon, one tight line. No blank lines between.
- **Fixes**: plain sentences, no bold lead, written as what was fixed from the
  user's side - not the mechanism, not the file.

## Variant: app store release notes

App Store and Play Store "What's New" text is **not** markdown. Headings, bold
and links render literally, and the field is length-capped (Play Store 500
characters; App Store 4000). So for store notes, keep the same content and
ordering but strip the formatting:

```
New
- Team Workspaces: separate workspaces for each project, with teammates.
- Keyboard shortcuts: press ? to see them all.

Improved
- Files sync twice as fast across devices.
- Search now looks inside file contents.

Fixed
- Large images upload correctly.
- Scheduled posts use the right timezone.
```

- Plain text only - no `#`, no `**`, no markdown links.
- Lead with what a user gains; cut anything they cannot see.
- Count characters against the target store's limit before handing it back, and
  say which store it was written for.
