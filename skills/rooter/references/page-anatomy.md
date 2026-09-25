# Page anatomy

Every Rooter has the same skeleton, at every level, in every project. That is
what makes a Rooter recognisable as a Rooter across a body of client work. The
*skeleton* is fixed; the *look* is not (see "Neutrality").

## The five slots, in order

| Slot | Content | Required |
| --- | --- | --- |
| **Mark** | The client's logo | **Required** - see "The logo" below |
| **Title** | What this page is | Required |
| **Lede** | One or two sentences on the product or what is on offer | Required |
| **Options** | One row per destination | Required, one or more |
| **Footer** | `Copyright © {year} {project}`. Nothing else | **Required** - see "The footer" below |

Nothing else goes on the page. No nav, no hero, no feature grid, no call to
action. A Rooter that grows a second section has become the thing it exists to
point at.

```text
┌──────────────────────────────────────────────────────────────┐
│   ▉▉▉▉                                    <- MARK   required  │
│                                                              │
│   Three landing-page designs,             <- TITLE  required  │
│   built to be compared.                                      │
│                                                              │
│   Same firm, same constraints, three      <- LEDE   required  │
│   arguments. The differences are the point.                  │
│  ──────────────────────────────────────────────────────────  │
│   ◫ v1 · chosen                                   ->         │
│   Field & Plate                                              │
│   A chromatic dark field, rounded media          <- OPTIONS  │
│   plates, a hero video.                            1 or more │
│   Switzer + IBM Plex Mono                                    │
│  ──────────────────────────────────────────────────────────  │
│   ◫ v2                                            ->         │
│   Register                                                   │
│   A hairline-ruled modular grid on paper.                    │
│   Geist + Geist Mono                                         │
│  ──────────────────────────────────────────────────────────  │
│   Copyright © 2026 FloorZap               <- FOOTER required │
└──────────────────────────────────────────────────────────────┘
```

**A one-row page is a normal page.** Where a Rooter is built over a single
destination - asked for, or holding the permanent URL while the project grows -
it renders with the same five slots and one option. Do not centre the row, do
not enlarge it, do not add "more coming soon". It is a list that currently has
one item, and it will look right when it has three.

## The row

```text
┌──────────────────────────────────────────────────────────────────┐
│  ▢ app · new                                              ->     │
│  ↑  ↑     ↑                                               ↑      │
│  │  │     └ STATUS - optional; chosen in the accent       │      │
│  │  └ KIND word - the product's label style               │      │
│  └ ICON - from assets/icons/, decorative           arrow - top   │
│                                                    right, on the │
│  Name                                              TAG LINE, in  │
│  display face, large - required                    the accent,   │
│                                                    aria-hidden   │
│  Description - what is behind this door.                         │
│  Body face, ~60ch. Required.                                     │
│                                                                  │
│  Meta · secondary detail - mono, optional,     + "Opens in a new │
│  degrades to absent                              tab", visually  │
│                                                  hidden          │
└──────────────────────────────────────────────────────────────────┘
  the whole row is ONE link
  accessible name = name + description + that span
```

Four lines, top to bottom, **at every width**: the tag line, the name, the
description, the meta. Nothing sits in a left gutter.

**The tag line** is the icon, the kind word (`app`, `system`, `deck`, `version`,
`mobile`, or the `tag` override) and, where a row has one, the status word after
` · `. Kinds, icons and statuses are defined in `references/config-schema.md`.

- The icon is the skill's own SVG, drawn in `currentColor` at about the
  cap-height of the tag text (~1em), in the same muted colour as the kind word.
  It is decorative: `aria-hidden="true"`, `focusable="false"`.
- The kind word stays out of the accessible name unless it disambiguates -
  "Arborgold FSM, app" adds nothing, but two rows both named "Arborgold" do
  need it.
- The status word is part of the accessible name. `chosen` takes the accent
  colour; `new`, `in progress` and `archived` stay muted.
- The **arrow** aligns with the tag line, at the far right of the rule - not
  with the name, and not centred on the row.

**An archived row** is last in its list, with its name in the muted colour. It is
still a full row and still a link. No "Earlier" heading, no divider of its own -
the anatomy stays at five slots.

## What the copy may say

- **Every destination name is in Title Case** - `Release Notes`, not `Release
  notes`; `Brand Voice`, `Design System`, `Mobile App`. It is a proper name on a
  door, not a sentence. Capitalise every major word; keep `a`, `an`, `the`,
  `and`, `but`, `or`, `for`, `nor`, `of`, `in`, `on`, `at`, `to`, `by` lower-case
  unless they come first or last (`State of the Art`, `Notes to Read`). A name
  with its own casing keeps it: `FloorZap`, `iOS`, `TestFlight`, `v2`. This
  applies to persona names and to names the user supplies through **Other**
  too - fix the casing, and show it in the proposal. Only names: the page title,
  lede and descriptions stay in sentence case.
- **A description describes the destination, not the client.** "A hairline-ruled
  grid on paper" - not "a leading firm in structured finance". The Rooter makes
  no claim about the product or the business; it says what is behind each door
  so the client can pick one.
- **One or two sentences.** A row the reader has to study is a row that has
  stopped being signage.
- **Meta is optional and degrades to absent.** Where a project has a useful
  secondary detail (a typeface pairing, a platform, a reference) it goes here.
  Where it has none, the line is not rendered - never a placeholder or a dash.
- Draft the copy from what the codebase actually showed you, and put it in the
  proposal so the words and the structure are approved together.

## The footer

Every Rooter ends with one line, always in this form:

```text
Copyright © 2026 FloorZap
```

- **`{project}` is the project's name**, from the config's `project` field -
  the product as the client knows it (`FloorZap`), not the repo slug
  (`floorzap-web`) and not the agency's name. It is never guessed: see SKILL.md
  (a) and (d) for how it is found and confirmed.
- **`{year}` is the current year, computed by the renderer** (at build time for
  a static page, at request time otherwise) - never a number typed into the
  config, which would go stale on the first of January.
- Nothing else on the line: no tagline, no "design system and frontend build",
  no links. Body face, muted colour, on the page's one left edge.
- A second-level page carries the same footer.

## Branding

Fixed: the slots, their order, what is required, and the row hover
(`references/motion.md`). **Not** fixed: palette, type, spacing, whether rows are
ruled or carded.

**The Rooter follows the product's branding.** It is the first thing the client
sees and often the only page they keep a link to, so it should look like it
belongs to them - not like a tool that happened to generate it.

Take from the project, in this order:

1. **Design tokens**, if it has them - colour, type scale, spacing, radii. Use
   the real token names, so a rebrand reaches the Rooter for free.
2. **The product's typefaces.** See below - this is the one people skip.
3. **The logo** - always. See below.

### The logo is always there

**Every Rooter carries the brand mark**, in the mark slot, above the title. It is
the first thing that says whose page this is, and a Rooter without it looks like
scaffolding the client was sent by mistake.

- Use **the project's own asset** - a component, an SVG in `public/`, whatever
  the product already renders. Never refetch it from a CDN, a third party or the
  client's live site.
- Paint it with **the token the product paints it with**, so the Rooter's mark
  and the product's are the same colour by construction rather than by a hex
  copied across. If the mark inverts between light and dark, let that token do
  it rather than writing a second rule.
- It is **decorative**: `aria-hidden`, with the accessible name coming from a
  visually-hidden span beside it. A logo is not a heading.

If the repo genuinely has no mark, say so in the proposal and ask for one rather
than shipping a wordless page - a text wordmark set in the display face is the
fallback, not an empty slot.

### The fonts are not optional

**The Rooter is set in the project's own faces.** A page in the client's colours
but a system font stack still reads as a tool's output - type is most of what
makes a page look like it belongs to a product.

Use the family tokens (`--font-heading`, `--font-body`, `--font-mono`, or
whatever the project calls them) rather than naming faces directly, so the
Rooter follows a change of face without being edited. Then check the variables
actually reach `/`: a `next/font` or similar setup injects them on `<html>` in a
layout, and a Rooter rendered outside that layout will silently fall back.

Where the project has three families, they map onto the slots like this:

| Slot | Face |
| --- | --- |
| Title | Display / heading, at the weight the product gives a heading |
| Destination name | Display / heading - the one word the reader is choosing between |
| Description, lede | Body |
| Tag line | The project's **label style** - see below |
| Meta | The same label style as the tag line |

### The tag and meta take the design system's label style

The tag line and the meta line are labels, and most design systems already have
a label: an eyebrow, an overline, a badge, a table header, a `label` or
`caption` text style. **Use that style, whole** - its face, size, weight,
case, letter-spacing and colour token - rather than composing one. A product
whose labels are `APP` in tracked caps gets `APP`; one whose labels are quiet
lowercase mono gets `app`. The config always stores the lowercase word
(`kind: 'app'`) and the style does the casing, via `text-transform`, never by
retyping the word.

Where to look, in order:

1. A text-style token or class named for it: `label`, `overline`, `eyebrow`,
   `caption`, `badge`, `kicker`.
2. A component that renders one: `<Eyebrow>`, `<Badge>`, `<Overline>`, a
   section label in the product's own pages.
3. The most repeated small-caps or small-mono treatment in the product's
   stylesheets.

Name the style you took in the proposal (*"tags use the product's `overline`
style: Inter 600, 0.75rem, uppercase, 0.08em tracking"*), so it is a visible
choice.

**Where the project has no label style**, or for a neutral versions Rooter that
must not borrow from any version, use the Rooter's own default: **mono,
uppercase, ~0.75rem, 0.08em tracking, muted colour**. Uppercase is the default
because at label size it holds its own next to a large name, reads as a
category rather than as a stray word, and keeps a short tag like `app` from
looking like a typo. With no mono face, use the body face at the same size and
tracking.

Whatever the style, three things are fixed: the tag and meta share it, it is
visibly smaller and quieter than the description, and the icon matches the tag
text's colour and cap-height. Mono or tracked caps are what stop the tag and
meta competing with the name between them.

### Every element, not just the obvious ones

Branding is not finished when the palette and the faces are set. Sweep the page
for anything still carrying an invented value:

- **The back link on a second level.** It is a control, so it takes the
  product's own button treatment - fill, text colour, radius, border width, and
  the product's hover step rather than a `filter: brightness()`, which invents a
  colour the ramp does not contain and drifts the moment the brand is retuned.
- **The focus ring** - the product's focus colour and border width.
- **The skip link** - its border, radius and timing.
- **Radii and durations** - a project with `--radius-sm` and `--duration-fast`
  should not have `0.25rem` and `150ms ease` written anywhere in the Rooter.

The check is mechanical: grep the finished stylesheet for hexes, bare `px`
radii and bare `ms` durations. What is left should be layout only - and every
custom property the file uses should be one it defines.

Where the project has **no** type system at all, take the faces from the
destination the client sees most, and keep the rest plain.

**Stay quiet even while on-brand.** Brand supplies the palette and the type; it
does not license a hero image, a gradient wash, an illustration or a second
section. The page is still signage - it is simply signage in the client's own
livery.

### The one case where it stays neutral

**A Rooter offering several designs to be compared must not resemble any of
them.** If it does, it competes as one more design and primes whichever version
it looks like, which is the exact bias the comparison exists to remove.

So for a versions Rooter: no typeface, no token and no class name borrowed from
any version. Give it its own prefix, one that collides with none of theirs, so a
rule copied out of the Rooter into a version fails loudly rather than
half-working. Where the client has brand assets that predate the versions - a
logo, a wordmark - those are still fair to use.

Say which of the two applies in the proposal, so the choice is visible rather
than assumed.

## Behaviour

- **Rows open in a new tab** (`target="_blank" rel="noopener"`). The Rooter stays
  put while destinations are compared side by side.
- The "opens in a new tab" warning is **real visually-hidden text inside the
  link**, so the accessible name carries it. Not an `aria-label`.
- The whole row is one link. The accessible name comes from the visible heading
  and description - never from an `aria-label` that restates them.
- The arrow is decorative: `aria-hidden="true"`, `focusable="false"`.
- Visible focus ring on every row. A skip link to the options list.
- `noindex`, always - a chooser has no business in a search index.

## Where it sits

The root page is at `/`, always - the client's link is the bare origin. The
second level takes a path under it (`/personas`, or whatever suits the project);
only the root is fixed.

## Second level

The same five slots, rendered from the nested config node, plus **one** addition:
a back link to the root. Different title and lede; identical everything else. It
is the same component, not a new page type - which is what keeps "add the
Professional persona" a one-line config edit.

## Responsive

```text
   WIDE                               NARROW
   ┌───────────────────────────┐      ┌──────────────┐
   │ ▢ tag                 ->  │      │ ▢ tag     -> │
   │ name                      │      │ name         │
   │ description               │      │ description  │
   │ meta                      │      │ meta         │
   └───────────────────────────┘      └──────────────┘
```

Single column throughout, capped around **60rem**. No grid - the list is the
layout. The row is the same stack at every width: tag line with the arrow,
then name, description, meta. Only the measure and the type sizes change.

### It is a desktop page that reflows - always, with no exception

**A Rooter is a desktop page even when the only thing it points at is a mobile
app.** There is no mobile-product variant of this page and no case where the
phone layout is the primary one. The client opens the Rooter on a desktop, from
a link in a mail or a message, so it is laid out for that width and reflows down
to a phone - never the other way round.

**What the Rooter points at does not set the Rooter's own scale.** A Rooter above
a mobile app, a tablet app or a watch app is still a full-width desktop page.

The failure to avoid: inheriting a phone-shaped app's measure and type steps -
a ~640px column and 15-17px rows - which on a laptop reads as a mobile app left
running in a window rather than as the one link a client was handed.

So, whatever the destinations are:

- **~60rem measure**, not the app's screen width.
- **Fluid type in `rem`** - `clamp()` for the title, the destination names, the
  lede and the descriptions - so the page answers the reader's own text size.
  Take the project's *faces and colours*; do not take a mobile product's fixed
  `px` type scale.
- **Title around `clamp(1.75rem, 4.5vw, 2.75rem)`**, names around
  `clamp(1.25rem, 2.2vw, 1.625rem)`. A Rooter's title is a page title.
- **Content starts at the top** under generous padding, rather than being
  vertically centred in the viewport - centred content on a tall desktop screen
  floats and reads as a phone screen.
- **Measures on the prose**: `24ch` on the title, `52ch` on the lede, `60ch` on
  a description. A line running the full 60rem is unreadable.

The one thing that legitimately follows a mobile destination is the *content* -
"installable on a phone" as a meta line. Never the layout.

### The canonical layout

This is the arrangement to build, at every width. It is not one option among
several - unless the user asks for something else, this is the page:

```text
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│      ▉▉                                     mark, top-left,        │
│                                             ~2.5-3rem, then a      │
│                                             generous gap           │
│      Girudo 2.0, and the system it is       title — display face,  │
│      built from.                            max 24ch so it wraps   │
│                                             to two lines, not one  │
│      The platform, the component library    lede — body face,      │
│      behind it, and the record of what      max 52ch               │
│      changed.                                                      │
│                                                                    │
│  ────────────────────────────────────────────────────────────────  │
│      ▢ app                                                  →      │
│      The product                                                   │
│      The TCG platform itself: the homepage,      rules span the    │
│      events, forums, creators, the lobby.        FULL measure;     │
│      Three accounts to open it with                                │
│  ────────────────────────────────────────────────────────────────  │
│      ▢ system · new                                         →      │
│      Component gallery                           text block is     │
│      Every component with its live states,       NARROWER than     │
│      props and usage notes.                      the rule          │
│      /design-system                                                │
│  ────────────────────────────────────────────────────────────────  │
│      ▢ deck                                                 →      │
│      The Deck                                                      │
│      The pitch, kept at a standing link.                           │
│      Open to anyone with the link                                  │
│  ────────────────────────────────────────────────────────────────  │
│                                                                    │
│      Copyright © 2026 Girudo                footer, quiet          │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
   everything left-aligned on one axis · content starts at the top
```

What makes it work, and what to keep:

- **One left edge.** Mark, title, lede, every row's name and description, and
  the footer all start on the same vertical line. Nothing is centred.
- **Content starts at the top**, under generous padding. Never vertically
  centred - on a tall screen that floats and reads as a phone screen.
- **The rules span the full measure**; the text inside a row does not. That
  contrast is what makes the list read as a list rather than as three
  paragraphs.
- **The arrow sits at the far right of the rule**, on the tag line, hard against
  the measure, not next to the text. It is the only thing on the right-hand side.
- **The tag line opens every row** - icon, kind, status - so the reader knows
  what kind of thing a row opens before reading its name.
- **The name is the largest thing in the row by a wide margin**, then the
  description (body), then the tag and meta (mono, smallest). The meta line is
  what stops the row looking unfinished.
- **The page ends where the content ends.** No sticky footer, no filling the
  viewport - empty space below the footer is correct.
