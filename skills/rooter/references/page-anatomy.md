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
| **Footer** | Client name, date. Nothing else | Optional |

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
│   v1   Field & Plate                              ->         │
│        A chromatic dark field, rounded media                 │
│        plates, a hero video.                     <- OPTIONS  │
│        Switzer + IBM Plex Mono                     1 or more │
│  ──────────────────────────────────────────────────────────  │
│   v2   Register                                   ->         │
│        A hairline-ruled modular grid on paper.               │
│        Geist + Geist Mono                                    │
│  ──────────────────────────────────────────────────────────  │
│   Client · design study                   <- FOOTER optional │
└──────────────────────────────────────────────────────────────┘
```

**A one-row page is a normal page.** Where a Rooter is built over a single
destination - asked for, or holding the permanent URL while the project grows -
it renders with the same five slots and one option. Do not centre the row, do
not enlarge it, do not add "more coming soon". It is a list that currently has
one item, and it will look right when it has three.

## The row

```text
┌─────────────────────────────────────────────────────────────┐
│  ┌────┐  Name                                        ->     │
│  │ v1 │  required                              ↑  ↑         │
│  └────┘                                        │  └ arrow,  │
│    ↑     Description - what is behind this     │    decorative
│  TAG     door. Required.                       │    aria-hidden
│  optional                                      │            │
│          Meta · secondary detail               └ "Opens in a │
│          optional, degrades to absent            new tab" -  │
│                                                  visually    │
│                                                  hidden text │
└─────────────────────────────────────────────────────────────┘
  the whole row is ONE link
  accessible name = name + description + that span
```

## What the copy may say

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
| Tag, meta | Mono, uppercase, with tracking - these read as labels, not prose |

Mono on the tag and meta is what stops them competing with the name beside them.
If the project has no mono face, keep them in the body face and lighten the
colour instead.

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
- `noindex` while nothing is promoted - a chooser has no business in an index.

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
   WIDE                          NARROW
   ┌──────────────────────┐      ┌──────────────┐
   │ tag  name        ->  │      │ tag          │
   │      description     │      │ name         │
   │      meta            │      │ description  │
   └──────────────────────┘      │ meta      -> │
                                 └──────────────┘
```

Single column throughout, capped around **60rem**. No grid - the list is the
layout. The tag sits in a left gutter when wide and stacks above the name when
narrow; the arrow drops to the last line.

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
│      The product                                            →      │
│      The TCG platform itself: the homepage,                        │
│      events, forums, creators, the lobby.        rules span the    │
│      THREE ACCOUNTS TO OPEN IT WITH              FULL measure;     │
│  ────────────────────────────────────────────────────────────────  │
│      Component gallery                                      →      │
│      Every component with its live states,       text block is     │
│      props and usage notes.                      NARROWER than     │
│      /DESIGN-SYSTEM                              the rule          │
│  ────────────────────────────────────────────────────────────────  │
│      Changelog                                              →      │
│      Every release, newest first.                                  │
│      /CHANGELOG                                                    │
│  ────────────────────────────────────────────────────────────────  │
│                                                                    │
│      Girudo 2.0 - frontend build            footer, quiet          │
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
- **The arrow sits at the far right of the rule**, hard against the measure, not
  next to the text. It is the only thing on the right-hand side.
- **Three type sizes per row**, descending: name (display face), description
  (body), meta (mono, uppercase, smallest). The meta line is what stops the row
  looking unfinished.
- **The page ends where the content ends.** No sticky footer, no filling the
  viewport - empty space below the footer is correct.
