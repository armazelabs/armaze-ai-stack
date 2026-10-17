# Code to Figma

This skill pushes screens and components from your code into the project's Figma file, built from its existing design system and only after your yes. You end up with Figma matching the code.

## When to Use This Skill

- A screen exists only in code and needs building in Figma
- Mirroring a code change (copy, tokens, layout) into its Figma frame
- Exporting the design system into Figma for the first time
- Re-syncing the Figma foundation after token values changed
- Keeping a library file and a screens file in step with the code

## What This Skill Does

1. **Checks the Setup**: Confirms the Figma tools respond and `FIGMA.md` exists
2. **Reads What Is in Figma**: Offers only the export or update options that apply
3. **Gates Every Write**: Lets you pick frames, previews the changes, waits for a yes
4. **Builds From the System**: Instances components, binds variables, applies styles
5. **Handles Renames Openly**: Renames in place and reports orphans instead of deleting them
6. **Records What It Pushed**: Updates `figma-library-keys.md` and `figma-screen-keys.md`

## How to Use

### Basic Usage

Run it bare and it walks you through an intake:

```
/code-to-figma
```

### With a Target

Name what to push:

```
Update the Settings screen in Figma from the code
```

```
Build the new onboarding screens in Figma
```

### After a Code Change

The skill does not sync on its own after you change code. Ask for it, or say yes when it offers:

```
Sync the button colour change into Figma
```

### Install

```
aistack add code-to-figma
```

## Example

**User**: `/code-to-figma`

**Skill**: Reads `project-management/design/FIGMA.md`. The foundation is in the file and current, and two screens are already exported. It asks what to do: Update foundation, Export screen(s) or Update screen(s).

**User**: "Export screens"

**Skill**: Shows a checklist of candidate screens. The user ticks Profile and Notifications. It lists what it will create on the screens page, which components it will instance and which variables it will bind, then asks for a yes. After building, it records both frames in `figma-screen-keys.md`:

```
| Frame name              | Node id | Code path                      | Status / Last updated |
| profile                 | 12:340  | src/screens/Profile.tsx        | in sync, 2026-10-17   |
| notifications           | 12:512  | src/screens/Notifications.tsx  | in sync, 2026-10-17   |
```

## Tips

- Keep `FIGMA.md` current; the file key, paths and naming all come from it
- Code is the source of truth for token values: change them there, then push
- Export the foundation before screens; screens are built from its components
- Publishing and enabling a library are manual Figma steps
- A frame holds one theme; dark mode, RTL and motion don't round-trip
- A brand font Figma's server can't load shows as a fallback in screenshots only

## Related Use Cases

- `figma-to-code` for the opposite direction: implementing a Figma frame or a design handoff in code
- `site-to-figma` when the starting point is a live website rather than your codebase

## Requirements

- The Figma MCP server, connected and authenticated, with the file open in desktop Figma when needed.
- `FIGMA.md` in `project-management/design/` (the skill offers to create it). Older projects that keep it at the repo root, with the registries in a root `design/`, keep using those.
- The Figma plugin's `figma-use` skill, plus `figma-generate-library` for the foundation and `figma-generate-design` for screens.
