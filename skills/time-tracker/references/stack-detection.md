# Working in any project

The tracker has exactly one dependency: **Node**, which Claude Code already
ships with. Nothing else about the project matters - not its language, not its
package manager, not whether it has a build at all.

## The project's name

Used for the PDF title only. Read at run time, so a rename is picked up without
re-running setup. First hit wins:

| File | Where the name is |
| --- | --- |
| `package.json` | `.name` |
| `pyproject.toml` | `name = "..."` |
| `Cargo.toml` | `name = "..."` |
| `go.mod` | `module ...` (last path segment) |
| `composer.json` | `.name` |
| `pubspec.yaml` | `name: ...` |
| `build.gradle.kts` / `settings.gradle` | `rootProject.name = "..."` |
| `*.csproj` / `*.sln` | the file's own name |

**None of these is required.** A repo with no manifest - docs, design files,
research notes, shell scripts - falls back to the folder name. That is a normal
outcome, not a failure, and setup must never stop over it.

## What each optional thing degrades to

| Absent | What happens |
| --- | --- |
| `package.json` | No npm scripts. The `node <engine>/…` commands are what the readme documents anyway. |
| git | No commit evidence for labelling; prompts alone carry it. |
| Chrome / Chromium | No PDF. The month markdown is still complete. |
| `.claude/settings.json` | Created, with only the SessionStart hook in it. |
| `.gitignore` | Created, holding only the cache entry. |
| `project-management/` | Created, lowercase. An existing one in any casing is reused. |

## Where things go

```
<repo>/<project-management>/tracking/
  config.json          timezone, idle gap, multiplier, which weekdays count
  state.json           the tracked date ranges - the on/off switch
  <YYYY-MM>.md         the record
  <YYYY-MM>.pdf        rendered from the markdown
  cache/               labelling evidence, gitignored
  engine/*.mjs         the code
```

The engine derives every path from its own location, so the whole folder can be
renamed or moved and it keeps working. Re-running setup repoints the
SessionStart hook if it has moved.

## Monorepos

Transcripts are keyed by the directory Claude Code was opened in. Set the
tracker up in the directory you actually work from - usually the repo root. One
tracking folder per repo, not per package.
