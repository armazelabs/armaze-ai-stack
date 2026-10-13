# Page format

The contract every module page follows, for anything that draws them: a page
on the project's own site, a PDF, a plain viewer. `<engine>/pages.mjs` parses
and lints exactly this; a page that fails it never gets published.

## Files

```
project-management/module-docs/
  config.json                                 modules (id, name, description, paths), in display order
  modules/<id>/overview.md                    the module now
  modules/<id>/history/<YYYY-MM-DD>-<slug>.md one dated entry per file
```

Draw modules in `config.json`'s `modules` order. A module in the config with
no `overview.md` yet is drawn as not started.

## Front matter

Between a first line `---` and the next `---`. One `key: value` per line.
Values are one of: a bare word or date (`in-progress`, `2026-10-13`), a
double-quoted JSON string (`"A banner can be uploaded"`), or an inline list
(`[a, "b c"]`). Nothing else - no nesting, no multi-line values.

**overview.md**

| Key | Value |
| --- | --- |
| `module` | the module id |
| `name` | the module's name |
| `status` | `not-started` or `in-progress` |
| `updated` | `YYYY-MM-DD` |
| `source` | where the description came from (internal, not drawn) |

**history entry**

| Key | Value |
| --- | --- |
| `date` | `YYYY-MM-DD`; the file name starts with it |
| `title` | one plain sentence: what the work achieved |
| `kind` | `work`, or `backfill` for entries rebuilt from commits |
| `sessions`, `commits`, `refs` | internal - **never drawn** |

## Body

Only `## ` headings, in a fixed order:

- overview: `What it is`, `What's built now`, `Open follow-ups`
- `work` entry: `What changed`, `Why and the plan`, `Decisions made`,
  `Open follow-ups`
- `backfill` entry: `What changed`, then optionally `Why and the plan`

Under each heading, blocks separated by blank lines:

- a **paragraph**: consecutive lines, joined with spaces
- a **list**: lines starting `- `; a line indented two spaces continues the
  item above. One level only.

Inline, and nothing else: `` `code` ``, `**bold**`, `[text](https://...)` or
`[text](relative/path)`. No HTML, tables, images, quotes, code blocks,
numbered or nested lists, or other heading levels. A section with no blocks
means "nothing": draw an empty state, not a blank.

## Drawing order

1. The module's name, its `What it is`, and its status (say "Not started" or
   "In progress" in words - never by colour alone).
2. **Coming next**, when the project links requirements (below).
3. `What's built now`, then `Open follow-ups`.
4. **History**, newest first: by `date` descending, then by file name
   descending. Each entry: its date, its `title`, then its sections.
5. Once, above the first `backfill` entry: "Entries before <the date part of
   config.installed> were rebuilt from the project history and cover what
   changed."

## Coming next

Only when `config.json` has `requirements` (`dir`, `comingNext`). Read at
build time from the requirements folder - module-docs never copies it into
the pages, so it is current with every build.

- **Features**: `<dir>/modules/<module id>/features/*.md`. Title: the first
  `# ` line. Status: the `- **Status:** <value>` bullet (ignore a line that
  lists choices with ` | `). Module: the folder name, not a bullet. Summary:
  the `- **Summary:**` bullet, else the first sentence under `## Problem`
  that is not italic guidance or a `[TBD` placeholder, else none.
- **Small asks**: `<dir>/register.md`, the first table whose header has a
  `Status` column. Find columns by header name (`Module`, `Ask`, `Type`,
  `Status`), never by position. Rows with Type `small`; module is the Module
  cell, slugified.
- Keep items whose status is in `comingNext` (e.g. `client-approved`,
  `building`), and say which in words ("Approved", "In progress").
- **Strip IDs**: `R-`, `D-`, `S-`, `C-` followed by three or more digits,
  bracketed lists of them, and Markdown links (keep their text).
- A file that does not parse is skipped. It never breaks the build.
