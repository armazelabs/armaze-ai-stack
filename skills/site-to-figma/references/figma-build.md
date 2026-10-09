# Building in Figma

Every step is `zsh "$SKILL_DIR/scripts/figma-code.zsh" <step> --dir <site dir> [...]`. Send its output unchanged as the `code` of one `use_figma` call, with the session id and `skillNames: "figma-use"`. Each step's code carries only the parts of `figma-spec.json` it needs, and stays under use_figma's 50,000-character limit (the generator fails rather than print more).

## The steps

| Step | Writes | Returns |
|---|---|---|
| `inspect` | nothing | the file's pages, collections, styles, and whether site-to-figma ran here before |
| `variables` | the Primitives (Value), Color (Light/Dark, or Default), Size and Typography collections | the collections, counts created, `updated`, `kept`, `unchanged`, `noLongerOnSite`, notes |
| `styles` | text styles, effect styles | `created`, `updated`, `kept`, and `fonts`: the site font to Figma font, with stand-ins marked |
| `foundations` | the board `site-to-figma · Foundations` on the Foundations page (replaced each run, in the same spot) | `boardId`, counts, `missingStyles` |
| `assets --batch n` | `logo/primary` and `icon/<name>` components on the board `site-to-figma · Assets` | `created`, `skipped` (already there), `failed`, `rasterLogo` |
| `components` | Button, Input, Badge and Card on the Components page | `ids` (keep `ids.Button`), `skipped` (already there), `missingStyles` |
| `rebind --node <ids>` | text styles, effect styles, radius and spacing variables, and colours on a captured frame | counts, `alreadyBound`, `textSkippedFonts`, `unmatchedColours` |
| `swap --node <ids> --set <id>` | replaces captured buttons with Button instances | `swapped` per variant, `total` |

**Scopes.** Primitives are hidden from Figma's pickers: designers pick meanings, which alias the primitives. Text meanings show in the text-colour picker, surfaces in fill pickers, borders in stroke pickers, spacing in gap and padding, radius in corner radius. Every variable's WEB code syntax is the site's own CSS variable when there was one, else `var(--group-name)`.

## Re-runs and existing files

Each variable, text style and effect style this tool makes ends its description with `[stf:<value>]`: the value it last wrote. On the next run:

| Found in Figma | Result |
|---|---|
| missing | created |
| value still equals its tag, and the site's value changed | updated, and listed under `updated` |
| value still equals its tag, unchanged on the site | left as it is (`unchanged`) |
| value differs from its tag | **kept**: someone edited it in Figma |
| no tag (made by hand, or by another tool) | **kept** |
| tagged, but no longer on the site | kept, and listed under `noLongerOnSite`, never deleted |

How the other parts behave on a re-run:
- **Components** that already exist on the Components page are never rebuilt. To rebuild one, delete the set in Figma first.
- **Icons** that exist are skipped.
- **The Foundations board** is rebuilt every time, because it is documentation.
- **A new capture** is added as a new frame; earlier captures stay.

## Troubleshooting

- **"over the limit" from figma-code.zsh.** The spec is too big for one call. Trim with `overrides.json` (merge or drop colours, fewer text styles), or split the assets into more batches. Batches are about 38 KB each already.
- **`could not add the Dark mode`.** The Figma plan allows one mode per collection (Starter). The step puts the dark values in a "Color (Dark)" collection instead and says so in `notes`. Tell the user.
- **A text style shows a stand-in font.** The site's font isn't available to Figma. The style's description names the real font. Installing it locally, or uploading it to the organisation, and re-running `styles` swaps it in. The style is tagged, so it updates unless someone edited it.
- **The capture hangs ("no capture after 3 minutes").** The Orca tab must be painting. `capture.zsh` brings it on screen with `orca tab switch --focus`, but if Orca is minimised the page never renders. Ask the user to show the Orca window and run `capture.zsh` again with a **new** capture id: each id works once.
- **Figma refuses the upload (HTTP 4xx).** The capture id was used or has expired. Call `generate_figma_design` for a new one.
- **Empty areas in the capture.** Canvas, WebGL and video content isn't captured. That is a limit of Figma's capture.
- **`textSkippedFonts` above 0.** Figma refused to restyle those text nodes. They keep the captured look.
- **`swap` found nothing.** The captured buttons differ from the variants in height, radius or colour. Leave them; the capture is still tied to the tokens.

## report.md template

```markdown
# <Site> design system in Figma

Built <YYYY-MM-DD> from <url> (pages: <list>). Figma: <file url>

- Foundations: <url with node-id>
- Components: <url with node-id>
- Captured page: <url with node-id>

## What was built
- Variables: <n> created, <n> updated, <n> kept (<why>), <n> unchanged
- Text styles: <n>; effect styles: <n>
- Components: <list>; icons: <n> (logo: svg | raster, not imported: <url> | none)
- Captured page: <n> layers, <n> text styles applied, <n> radii and <n> spacing values tied to tokens, <n> buttons swapped for instances

## Fonts
| Site font | In Figma |
|---|---|

## Needs a look
- Guessed meanings: <list>
- Colours on the capture with no token: <list>
- Tokens no longer on the site: <list>
```
