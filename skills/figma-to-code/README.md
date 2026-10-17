# Figma to Code

This skill brings Figma frames, design changes, variables and claude.ai/design handoffs into your code. You end up with screens built from your own components and tokens, previewed before any edit.

## When to Use This Skill

- A finished Figma frame needs implementing
- A frame you built changed in Figma and the code should follow
- Figma variables or styles changed and the token CSS needs reconciling
- You have a figma.com frame link to build
- A design arrived as a claude.ai/design handoff link

## What This Skill Does

1. **Checks the Source**: Reads `FIGMA.md`; a screenshot or handoff link works without Figma
2. **Asks What to Bring In**: The foundation, one screen, or a handoff link
3. **Re-reads the Frame**: Screenshots it fresh and maps it to its code screen
4. **Mirrors From the System**: Maps Figma styles and variables back to your tokens
5. **Wires New Screens In**: Scaffolds the component and adds it to router and navigation
6. **Keeps the Registries Current**: Re-stamps the library keys and screen map after a sync

## How to Use

### Basic Usage

Run it bare and it asks what to bring in:

```
/figma-to-code
```

### With a Frame Link

Paste a frame URL with its `node-id`:

```
Implement this frame: https://www.figma.com/design/<fileKey>/App?node-id=42-1187
```

### Mirror a Design Change

```
The Profile screen changed in Figma, bring the code in line
```

### Sync the Foundation

```
Sync the Figma variables into our token CSS
```

### From a Handoff Link

```
Build this design: https://api.anthropic.com/v1/design/h/<id>
```

### Install

```
aistack add figma-to-code
```

## Example

**User**: "The Profile screen changed in Figma, bring the code in line"

**Skill**: Looks up Profile in `project-management/design/figma-screen-keys.md`, finds its node id and `src/screens/Profile.tsx`, and re-reads the frame. Then it previews:

```
src/screens/Profile.tsx
  - header avatar grows from 48 to 64 (var(--size-avatar-lg))
  - new "Edit profile" secondary button under the name
  - section gap now var(--space-6)
No new tokens. Proceed?
```

After the yes it edits the file, then re-stamps the Profile row as `in sync` with today's date.

## Tips

- Paste a frame URL with `?node-id=...` or a screenshot; it can't read your selection
- Work on a branch or a clean tree so the sync is easy to review
- Code wins for token values unless you say otherwise; if both changed, it asks
- Some mismatches are deliberate; check the design docs before "fixing" one
- A screenshot-only sync is lossy; confirm colours and spacing against the variables
- A frame holds one theme; dark mode, RTL and motion follow the code's patterns

## Related Use Cases

- `code-to-figma` for the opposite direction, and for renaming a misnamed frame this skill finds
- Turning a claude.ai/design prototype into production screens
- Building a token CSS from scratch out of a Figma file, in a project that has none yet

## Requirements

- The Figma MCP server, connected and authenticated, for live Figma reads. A screenshot or handoff link works without it.
- `FIGMA.md` in `project-management/design/` (the skill offers to create it). Older projects that keep it at the repo root, with the registries in a root `design/`, keep using those.
- The Figma plugin's `figma-use` skill.
