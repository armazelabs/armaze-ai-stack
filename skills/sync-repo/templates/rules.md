# sync-repo rules for this project

What the general rules in the skill don't cover. Read this before every clean. Leave a heading empty when it doesn't apply.

## First commit

The message of the mirror's first commit, in product terms (for example "Account dashboard prototype"):

## Install and check

The commands to run in the mirror after a sync (for example `pnpm install`, then `pnpm check`):

## Names to keep out

People, other client projects and internal tools that comments must never name. Add each one to `leakPatterns` in `config.json` too, so `verify` catches it.

## Comments that can stay

References that are fine in the mirror (for example a design doc that ships with it):

## Files that ship as they are

Files that are never excluded, converted or renamed (for example brand fonts):

## Comments that are data

Comments a program reads, which stay exactly as in the source (for example section headings in a tokens file that a page parses):

## Generated files

Files that carry a fixed header instead of their own comments, and the header:

## Divergent files

What stays different in the mirror's copy of each file in `divergent`:

- `package.json` has no `time:*` scripts

## Mirror-owned files

What the mirror's own README and `.gitignore` hold (logos, sections, the ignore lines):

## Comparison

Why each page in `compare.expected` always differs, and what area of it may change:
