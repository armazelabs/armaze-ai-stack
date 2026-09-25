# Config schema

One data file holds every destination. The page reads it. **No destination name,
route, description or count may appear in the page component** - if adding a
version means editing the page, the config is wrong.

## Where it lives

Next to the Rooter page, in the target project's own config idiom and language:
a typed module where the project has types (`rooter.config.ts`), a plain data
module where it does not (`rooter.config.js`, `rooter.json`, `rooter.yaml`).
Prefer a typed module - it makes a malformed destination a build error rather
than a blank row in front of the client.

## Shape

```ts
export const rooter = {
  // The five slots of the root page. See page-anatomy.md.
  mark: '/logo.svg',              // required - the brand mark, from the project's own asset
  title: 'Three landing-page designs, built to be compared.',
  lede: 'Same firm, same constraints, three arguments.',
  project: 'FloorZap',            // required - the project's name, confirmed by the user; drives the footer

  destinations: [
    {
      kind: 'version',            // required - see "Kinds" below
      tag: 'v1',                  // optional - overrides the kind word in the tag line
      name: 'Field & Plate',      // required
      desc: 'A chromatic dark field on the firm’s own blue, with rounded media plates and a hero video.',  // required
      meta: 'Switzer + IBM Plex Mono',  // optional
      href: '/v1/',               // required unless `children` is present
      status: 'chosen',           // optional - 'chosen' | 'in-progress' | 'archived'
      added: '2026-09-25',        // optional - ISO date; drives the derived `new` marker
    },
    {
      kind: 'deck',
      name: 'The Deck',
      desc: 'The pitch for moving design to an AI-driven workflow. A pre-read, kept at a standing link.',
      meta: 'Open to anyone with the link',
      href: 'https://www.figma.com/deck/…',   // external - absolute URLs are allowed
    },
    // ...
  ],
} as const;
```

## Kinds

Every destination has a `kind`. It sets the **icon** and the **word** in the row's
tag line (see `page-anatomy.md`, "The row"):

| `kind` | Tag word | Icon (`assets/icons/`) | Typical destination |
| --- | --- | --- | --- |
| `app` | app | `app.svg` - app window | The product, a web app, an admin that is its own product |
| `system` | system | `system.svg` - swatch | A design system, Storybook, a component gallery |
| `deck` | deck | `deck.svg` - presentation | A deck, a pre-read, a Figma file, a PDF, any document |
| `version` | version | `version.svg` - layers | One of several design versions being compared |
| `mobile` | mobile | `mobile.svg` - phone | A mobile build: hosted web build, Expo or TestFlight link |

The icons are a **fixed set that ships with this skill**, so every Rooter across
Armaze's client work speaks the same visual vocabulary. Copy the SVG markup into
the target project (inline in the page, or as a component beside it) - the page
never references the skill's own path. They draw in `currentColor`, so the tag
line's muted token colours them; never add a fill or a hex.

Any other `kind` is allowed when none of the five fits - the user names it, and
it renders as the tag word **with no icon**. Do not draw or borrow a new glyph.
A missing icon is honest; an invented one drifts from the set.

`tag` overrides the word, not the icon: `kind: 'version', tag: 'v2'` shows the
layers icon and `v2`.

## Status

The lifecycle of a destination is data, like everything else:

| `status` | Tag line | Position |
| --- | --- | --- |
| *(none)* | `app` | Where the array puts it |
| `chosen` | `version · chosen`, the status word in the accent colour | **First** in its level |
| `in-progress` | `app · in progress` | Where the array puts it |
| `archived` | `version · archived`, row muted | **Last** in its level, no heading |
| **`new`** - derived | `system · new` | Where the array puts it |

- **`new` is never stored.** The renderer shows it while `added` is less than 14
  days before the build/request date, then drops it on its own - no edit, no
  run. `chosen` outranks `new`; show one status word, never two.
- **At most one `chosen` per level.** Two is a config error, like an empty
  `desc`.
- `chosen` and `archived` are the only things that reorder. The client picking a
  version marks it and lifts it to the top; the others stay reachable - a
  Rooter does not hide the work that led to the choice.
- "V2 was chosen", "retire V1", "V3 is still being built" are config edits to
  `status` - and, since two of them reorder the page, structural changes that go
  through confirmation.

## External destinations

`href` may be an absolute URL - a deck, a Figma file, a TestFlight link, a
Storybook hosted elsewhere. Detection **never finds these**: they come from the
instruction or from the checklist's **Other**. Link checks (SKILL.md, "Analyse"
and "Verify") cover them like any internal route.

A nested level is the **same shape one level down**, on a destination that has
children instead of an `href`:

```ts
{
  kind: 'mobile',
  name: 'Mobile App',
  desc: 'The client app, one build, three starting points.',
  children: {
    title: 'Select a persona',
    lede: 'The same build for everyone; each persona starts in a different place.',
    destinations: [
      { kind: 'persona', name: 'Homeowner',    desc: 'Books work, tracks jobs, pays invoices.', href: '/mobile/homeowner' },
      { kind: 'persona', name: 'Professional', desc: 'Accepts jobs, schedules crews, quotes.',  href: '/mobile/professional' },
      { kind: 'persona', name: 'Admin',        desc: 'Oversees accounts, disputes, payouts.',   href: '/mobile/admin' },
    ],
  },
}
```

`children` is not mobile-only. It hangs off whatever destination has personas -
a Product just as readily as a Mobile App.

## Rules the renderer enforces

- **A node with fewer than two destinations collapses by default**: it resolves
  to its single destination's `href`, and the parent row links straight there;
  at the root, a redirect and no page. This lives in the renderer so a config
  edit cannot forget it.
- **`collapse: false` on a node overrides that** and renders the chooser with
  however many rows it has, one included. Set it when the user asked for a
  single-destination Rooter, or on a root that must keep its permanent URL while
  the project has only one destination. A one-row page renders identically to a
  three-row one - no special case, no apology in the copy.
- `href` and `children` are mutually exclusive. Exactly one, always.
- Order in the array is the order on the page. Nothing sorts - except that a
  `chosen` row lifts to the top and `archived` rows sink to the bottom.
- A missing `project` is a config error. The footer is rendered from it as
  `Copyright © {current year} {project}` - the config holds the name, never the
  year or the sentence.
- `name` is in Title Case (`page-anatomy.md`, "What the copy may say").
- A missing `kind` is a config error. Every row says what kind of thing it opens.
- An empty or missing `desc` is a config error, not a blank row. Every
  destination says what is behind its door.

## Nesting depth

Two levels. Root, and one chooser under a destination. A third level means the
structure is wrong - the client is being asked to navigate, which is the
product's job, not the Rooter's.
