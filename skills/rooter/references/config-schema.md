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
  footer: 'STG · design study',   // optional

  destinations: [
    {
      tag: 'v1',                  // optional
      name: 'Field & Plate',      // required
      desc: 'A chromatic dark field on the firm’s own blue, with rounded media plates and a hero video.',  // required
      meta: 'Switzer + IBM Plex Mono',  // optional
      href: '/v1/',               // required unless `children` is present
    },
    // ...
  ],
} as const;
```

A nested level is the **same shape one level down**, on a destination that has
children instead of an `href`:

```ts
{
  name: 'Mobile App',
  desc: 'The client app, one build, three starting points.',
  children: {
    title: 'Select a persona',
    lede: 'The same build for everyone; each persona starts in a different place.',
    destinations: [
      { name: 'Homeowner',    desc: 'Books work, tracks jobs, pays invoices.', href: '/mobile/homeowner' },
      { name: 'Professional', desc: 'Accepts jobs, schedules crews, quotes.',  href: '/mobile/professional' },
      { name: 'Admin',        desc: 'Oversees accounts, disputes, payouts.',   href: '/mobile/admin' },
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
- Order in the array is the order on the page. Nothing sorts.
- An empty or missing `desc` is a config error, not a blank row. Every
  destination says what is behind its door.

## Nesting depth

Two levels. Root, and one chooser under a destination. A third level means the
structure is wrong - the client is being asked to navigate, which is the
product's job, not the Rooter's.
