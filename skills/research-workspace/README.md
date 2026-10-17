# Research Workspace

This skill builds a product research workspace in `project-management/` and keeps every new file named and placed by its rules. You end up with research folders, rules, a decision log and seed docs.

## When to Use This Skill

- Setting up the documentation workspace for a new product
- Checking where a new research file, note or profile goes, and its name
- Checking a naming, placement or phase rule
- Filling in missing folders or seed documents
- Fixing file names whose casing git never recorded

## What This Skill Does

1. **Builds the Workspace**: Folders, purpose READMEs, the workspace guide, rules and seed documents
2. **Never Overwrites**: Adds only missing files and moves nothing, so re-runs are safe
3. **Enforces the Naming Rules**: Lowercase kebab-case, dated names, `v1`/`v2` versions
4. **Routes Content**: Says where each kind of file goes and what to call it
5. **Gates the Phases**: Product knowledge, research, then UX, each sign-off logged
6. **Fixes Casing in Git**: Repairs case-only renames git can't see, without committing

## How to Use

### Basic Usage

```
aistack add research-workspace
```

```
Set up the research workspace
```

Claude runs the scaffold in the current folder, with the folder's name as the project name, and reports what was created and what already existed.

### Run the Scaffold Yourself

```bash
bash .claude/skills/research-workspace/scripts/scaffold.sh
bash .claude/skills/research-workspace/scripts/scaffold.sh ./acme-platform "Acme Platform"
```

The first argument is the target folder (default: the current one), the second the display name written into the generated docs.

### Ask Where Something Belongs

```
Where do notes from today's kickoff meeting go, and what are they called?
```

### Fix File-Name Casing

```bash
bash .claude/skills/research-workspace/scripts/fix-file-casing.sh            # report only
bash .claude/skills/research-workspace/scripts/fix-file-casing.sh . --fix    # repair
```

## Example

**User**: "Set up the research workspace for Acme Platform"

**Output**:

```
Scaffolding workspace "Acme Platform" at: /Users/me/Projects/acme-platform

Done. Files created: 26   |   already existed (skipped): 0
```

The new tree includes `project-management/feature.md`, `decisionlog.md` and `CHANGELOG.md`, the research changelogs, the competitor working docs (`feature-matrix.md`, `pricing-comparison.md`, `pain-points.md`, `opportunities.md`), `open-questions.md`, `information-architecture.md`, `sitemap.md`, an empty modules index and the UX visualization guide.

**User**: "Where do notes from today's kickoff meeting go?"

**Output**: `project-management/meeting-notes/meeting-2026-10-17-kickoff.md`

## Tips

- Re-run the scaffold anytime; it only fills in what's missing
- Never name a file "final"; use `v1`, `v2`, and `v2a` for a small fix
- Log decisions and changes inside `decisionlog.md` and `CHANGELOG.md`, not new files
- Keep technical specs beside the code, not in the workspace
- Run `fix-file-casing.sh` before handing the repo to Linux users; commit yourself
- An older root `research/`, `feature.md` or `rules/` stays where it is

## Related Use Cases

- `create-competitor-profile` and `update-competitor-profile`, which write and update profiles in `project-management/research/external/competitor-analysis/profiles/`
- `ux-visualization-assistant`, which reads the workspace's `ux-research/ux-visualization-guide.md` first
- `product-teardown`, which files module research and competitor profiles in the same research tree
- `project-kickoff`, which offers this skill but never ticks it, because it would add a second docs tree next to the kickoff's
