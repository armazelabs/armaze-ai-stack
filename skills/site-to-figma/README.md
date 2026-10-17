# Site to Figma

This skill reads a live site's design system in Orca's browser and, after your review, builds it into Figma: variables, styles, components and the page recreated, with W3C tokens saved in your project.

## When to Use This Skill

- Pulling a site's colours, fonts and tokens into Figma
- Recreating a web page in Figma with real variables, not raw values
- Starting a redesign from a live site
- Documenting your own live product's styles
- Re-running later to update the same Figma file

## What This Skill Does

1. **Scans the Site**: The starting page plus 3 to 5 more, and the dark theme if any
2. **Turns Scans Into Tokens**: Merges near-duplicates, derives colours, type, spacing and components
3. **Stops for Your Review**: Your changes go into `overrides.json` until you approve
4. **Builds the Design System**: Variables, styles, a Foundations board and component sets
5. **Recreates the Page**: Captures the starting page and binds it to the variables
6. **Updates Without Wiping**: Re-runs change only what it made and nobody edited

## How to Use

### Basic Usage

```
Extract the design system from https://acme.io into Figma
```

### Recreate a Page

The URL you give is also the page that gets recreated:

```
Recreate https://acme.io/pricing in Figma with proper variables
```

### Into an Existing Figma File

Give a file link, or it creates `<Site> design system` in your drafts:

```
Pull the colours, fonts and tokens from acme.io into https://www.figma.com/design/<fileKey>/Acme
```

### A Site Behind a Login

It asks for a login only when the pages need one, recommends a test account, and saves it to `.claude/site-to-figma.local.env` (mode 600, git-ignored).

### Re-run Later

Ask again for the same site. It finds `figma.json` in the site folder and updates that file, with a "Changes since the last run" section in the review.

### Install

```
aistack add site-to-figma
```

## Example

**User**: "Extract the design system from https://acme.io into Figma"

**Skill**: Scans the home page plus pricing, a blog post and the contact form, then shows the review: colour meanings with light and dark values, fonts, text styles, spacing, radius, shadows, components, and warnings such as "status/success is guessed". After the user asks to merge two greys and approves, it builds the file and reports:

```
Figma: https://www.figma.com/design/<fileKey>/Acme-design-system
  Foundations, Components and the captured home page linked by node
Variables: 64 created; text styles: 14; effect styles: 3
Components: Button (6 variants), Input, Badge, Card; icons: 38
Font stand-ins: Söhne -> Inter (install Söhne and re-run styles to swap it)
Tokens and report: project-management/design-system/acme/
```

## Tips

- Use a test account for logged-in sites, not a real one
- Fix results through the review, never in the generated files
- Keep `overrides.json` between runs; it's part of the design system
- Keep the Orca window visible during the capture, or it hangs
- Canvas, WebGL and video aren't captured; that's Figma's limit
- On Figma's Starter plan, dark values go into a separate "Color (Dark)" collection

## Related Use Cases

- `code-to-figma` to keep the Figma file in step once you build the redesign in code
- `product-teardown` to document how the same product works, screen by screen, alongside its look

## Requirements

- **Orca**, for its embedded browser. No other browser is used.
- **The Figma MCP server**, connected, with an edit seat (Full or Dev) on the plan where the file goes.

## Output

```
project-management/design-system/<site>/
├── tokens.json        W3C design tokens
├── figma-spec.json    the same, shaped for the Figma steps
├── review.md          what was found
├── assets.jsonl       logo and icons as SVG
├── overrides.json     your review changes, if any
├── figma.json         the Figma file and node ids, for re-runs
├── report.md          what the Figma build did
└── scans/<YYYY-MM-DD>/  raw scans and light and dark screenshots
```
