# How scans become a design system

Use this to explain a result to the user, or to decide which override fixes it. The logic is in `scripts/synth.js`. The extraction it works from is in `scripts/extract-styles.js`.

## What a scan holds

For every visible element on the page (up to 8,000), the extractor records:

- **Colours.** Text, background and border colours, each counted by where it is used: `text:body`, `text:heading`, `text:link`, `text:button`, `text:nav`, `bg:page`, `bg:button`, `bg:section` (wider than 90% of the viewport), `border:input` and so on. A box-shadow that is only a ring (`0 0 0 1px`) counts as a border, which is how many sites draw them. Transparent filler layers are dropped.
- **Text styles.** Each distinct combination of family, size, weight, line height, tracking, case and italic, with how often it appears, its tags and a sample.
- **Scales.** Every padding, margin and gap value; corner radii (only on boxes you can see); shadows; transition durations and easings; centred max-widths; media-query breakpoints.
- **Fonts and variables.** CSS custom properties defined on `:root`, `html`, `body` or a dark-theme selector, and `@font-face` rules with their source.
- **Component samples.** Buttons (including links styled as buttons), text inputs, badges, cards and inline links, grouped by look. Each group keeps its hover, focus and disabled rules. These come from `:hover`-style selectors and from the `[data-hover]` / `[aria-disabled]` attributes headless UI kits use. A rule on an ancestor (`.group:hover .x`) and a rule combining two states (hover while disabled) are ignored.
- **The dark theme.** `scan.zsh` switches the tab's `prefers-color-scheme` to dark and reloads. If the page looks the same and its CSS has `.dark` or `[data-theme=dark]` rules, it switches those on instead. If the page still looks the same, the site has one theme.

Stylesheets from another origin can't be read, so their hover rules are missing. The review warns when that happens. Computed colours, sizes and fonts are unaffected.

## Colours

1. **Gather.** Usage from every page and both themes is added together. `overrides.merge` and `overrides.drop` apply first.
2. **Merge near-duplicates.** Colours closer than 1 in OKLab distance (×100) merge into the most-used one; alpha must also be within 4%. That is close to invisible: anti-aliasing noise, `#fefefe` next to `#ffffff`. Colours used only once are left out, unless a component, the page background or a meaning uses them.
3. **Name the primitives.** `white` and `black` keep those names. Low-chroma colours are `gray`, and the rest get a hue family (red, orange, yellow, lime, green, teal, cyan, blue, indigo, violet, purple, pink) from their OKLCH hue. Within a family, colours are sorted light to dark and given strictly increasing steps from 50 to 975, as close as possible to a Tailwind-like lightness ladder; in-between steps (150, 250, …) are used only when needed. Translucent colours become `alpha/<base>-<percent>` (`alpha/black-8`). When the site's CSS has a custom property with that exact value, its name is kept as the Figma variable's code syntax.
4. **Choose the meanings,** for each theme separately:

| Meaning | How it is chosen |
|---|---|
| `surface/page` | the page background (body, else html) |
| `text/primary` | among text colours with at least 8% of text use, the one with the most contrast on the page |
| `text/secondary`, `text/muted` | the next most-used neutral text colours that are clearly different and still readable |
| `text/heading`, `text/link` | the heading or link colour, only if it differs from the above and is readable |
| `brand/primary` | the most-used chromatic filled button; else the filled button with the most contrast; else the most-used chromatic colour |
| `brand/on-primary`, `brand/primary-hover` | that button's text colour and hover background (the hover only if it is a near shade) |
| `surface/card`, `surface/subtle` | card backgrounds; a neutral section background on the same side (light or dark) as the page |
| `border/default`, `border/input`, `border/focus` | the most-used border, the input border, the focus ring |
| `text/placeholder` | the inputs' placeholder colour |
| `status/danger`, `success`, `warning` | the most-used strong red, green or teal, yellow or orange. Marked *guessed* |

With two themes, a surface, text or border meaning found in only one theme is left out (with a warning), because the other theme has no honest value for it. Brand and status colours may stay the same in both.

5. **Component tokens.** Each component colour gets a meaning from the groups that suit it (fills from brand, surface or status; text from text or `brand/on-*`; borders from border) whose light **and** dark values both match. If none fits and the site has a dark theme, it gets its own token (`button/secondary/bg`, `input/bg`), so the component follows the theme in Figma. Without a dark theme it uses the primitive.

## Text styles

Combinations that differ only by up to 1.5px of line height or 0.2px of tracking are merged. Up to 22 styles are kept: those used at least twice, every heading, and every button label. The body size is the 12-20px size carrying the most running text.

| Kind | Rule | Names |
|---|---|---|
| Code | the family or stack is monospace | `code/<size>` |
| Heading | mostly in `h1`-`h6`, or 1.5× the body size and weight 500+ | `display/xl` (64+), `display/lg` (56+), `display/md` (48+), `heading/2xl` (36+), `xl` (30+), `lg` (24+), `md` (20+), `sm` (16+), `xs` |
| Label | mostly inside buttons | `label/<size>` |
| Body | everything else | `body/<size>` plus `-medium` / `-strong` for weight, `-italic`, `-caps` |

`<size>` is relative to the body size: `md` is the body size; `sm` and `xs` are smaller; `lg`, `xl` and `2xl` are larger. A name already taken gets the weight, then the pixel size, then the line height added.

**Fonts.** Each site font gets a list of Figma candidates, tried in order:
1. an override
2. the cleaned name (`__Inter_a1b2c3` and `X Fallback` cleaned up)
3. the name with spaces added (`GeistSans` becomes `Geist Sans`)
4. the name without `Sans`, `Text`, `Display`, `Variable` or `Pro`
5. the next families in the CSS stack
6. a known stand-in (`SF Pro`, `Söhne`, `Helvetica` and others become Inter; Circular becomes DM Sans; Proxima Nova becomes Montserrat; serif fonts become Source Serif 4; monospace fonts become JetBrains Mono)
7. Inter

The Figma `styles` step picks the first family Figma can load, and the nearest weight it has.

## Scales

- **Spacing.** Paddings, margins and gaps of 2-160px (and multiples of 16 up to 256) that are even and used often enough (at least 3 times and 0.2% of uses) become `space/<px÷4>`: `space/4` is 16px and `space/0_5` is 2px (Figma names can't contain dots). Other frequent values are listed as off-scale in the review.
- **Radius.** Values used at least twice, bucketed `xs` (2px or less), `sm` (4), `md` (6), `lg` (8), `xl` (12), `2xl` (16), `3xl` (24), `4xl`. Pill shapes become `radius/full` (9999).
- **Shadows.** Up to 6 used at least twice, ordered by size: `shadow/sm`, `md`, `lg` (`xs` to `2xl` when there are more than 3).
- **Motion, breakpoints, max widths.** These go in `tokens.json` only, for code. Figma doesn't use them here.

## Components

- **Buttons.** Named by style:
  - `primary`: the brand colour
  - `secondary`: other filled buttons; a second filled colour gets `secondary-2`
  - `outline`: transparent with a border
  - `ghost`: transparent, no border
  - `link`: underlined

  Sizes by height: `sm` up to 30px, `md` up to 42px, `lg` above that. Each style and size is kept once, up to 8 in all, with a hover state when the site has one.
- **Inputs.** Up to 2, with a focus state when the site styles focus.
- **Badges.** Up to 4, named by colour: `brand`, `neutral`, a hue name, or `outline`.
- **Cards.** Up to 2: `elevated` (shadow), `outlined` (border) or `filled`.

Padding, radius, text style and shadow refer to tokens when the value matches one exactly, else the raw value.
