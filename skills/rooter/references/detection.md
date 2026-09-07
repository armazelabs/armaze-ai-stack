# Detection

Read this first, on every run. It answers three questions: what kind of project
this is, what its real client-facing destinations are, and what must never
become one.

Detect all of it from the codebase. **Do not assume a framework.** Astro, Next,
Remix, Vite + React Router, Expo, Flutter and plain static output all reach the
same answers by different files.

## 1. Classify the project

Work down this table and stop at the first row that matches. A repo can hold
more than one archetype (a product *and* a mobile app); when it does, the
matching rows combine into one root level rather than one winning.

| Archetype | Signals |
| --- | --- |
| **Website - versions** | A folder of sibling version dirs (`src/versions/`, `app/v1/`, `pages/v1/`), or routes matching `/v\d+/`, each a complete standalone page tree |
| **Product + design system** | An application route tree, alongside a design system surface: a Storybook config, a `/design-system` or `/ds` route, a `packages/ui` workspace with its own dev server |
| **Mobile app** | `app.json`/`app.config.*` with an Expo or React Native block, `ios/` + `android/`, `pubspec.yaml`, Capacitor config |
| **Personas** | See section 3 - a *sub-level*, not an archetype |

Also read `CLAUDE.md`, `AGENTS.md` and `README.md` where they exist. A project
that states its own structure in prose outranks anything inferred from the file
tree.

## 2. Find the destinations for each archetype

**Website - versions.** One destination per version directory or version route.
The name is the version's own display name if it has one (a heading, a title tag,
a config field); `Version 1` otherwise. The route is the version's index.

**Product + design system.** At most two destinations: the product's entry route,
and the design system's. If only one exists, the root collapses by default - a
product with no design system opens the product directly - unless a Rooter was
asked for anyway.

**Mobile app.** The app is one destination. A design system, if present, is a
second. Where the app cannot be opened as a URL (a native build, a simulator
target), the destination is whatever the client is actually given - a hosted web
build, an Expo/TestFlight link, a preview deployment. Ask **what the client is
given** if the project does not make it obvious; do not invent a route. This is a
question about the destination, never about where the Rooter sits - that is
always `/`.

## 3. Personas

**A persona level can hang under any app-like destination** - a Product or a
Mobile App. It is not a mobile-only feature. A web product with a homeowner view,
a professional view and an admin view has exactly the same shape as a mobile app
with three personas, and is configured the same way.

Signals:

- Persona-prefixed route segments: `/mobile/homeowner`, `/app/pro`, `/(admin)/`
- A persona/role enum or union type, especially one that drives routing or an
  initial screen
- Per-persona entry files, layouts or navigators
- Seeded demo accounts, one per role
- A prose statement in `CLAUDE.md` / `README.md`

A persona is a destination only when it has its **own reachable entry point**. A
role that merely changes what is visible inside one shared route, with no way to
link straight into it, is not a persona level - it is a permission model. Do not
build a chooser whose rows all point at the same URL.

The persona level is a **second level under its parent**, and follows the
collapse default on its own:

```text
Root
├── Product
│   └── Select Persona
│       ├── Homeowner
│       └── Professional
└── Design System
```

One persona means no persona chooser by default: the parent row points straight
at that persona's route. Keep the chooser anyway where the remaining personas
are being built and the client should see the shape now - the same
`collapse: false` that keeps a one-row root.

## 4. Selection defaults - what is doubtful, and what is not offered

This section does **not** filter. It decides how a candidate is presented in the
selection (`references/checklist.md`), and the user decides the rest.

**Not offered as an option, but counted aloud** - these are not client-facing
under any reading, and option slots are scarce:

- Machine routes: `/api/*`, `/_*`, `/.well-known/*`, sitemaps, feeds, webhooks
- Framework and error routes: `404`, `500`, layouts, route groups, catch-alls
- Fragments of a destination: a single page *inside* a version or product

**Offered, unticked, with the reason in the option's description** - plausible,
but not by default:

- Auth and account: `/login`, `/signup`, `/logout`, `/reset-password`, `/account`
  — reason: *part of a destination, not one*
- Internal surfaces: `/admin`, `/settings`, `/debug`, `/dev`, `/internal`
  — reason: *internal unless it's its own product*
- **The product changelog** — reason: *reached from each version's own footer*
- A design system with almost nothing in it — reason: *sparse — N pages*
- Anything genuinely ambiguous — say what makes it ambiguous

Any of these becomes a real destination the moment the user ticks it, and some
should: an `/admin` that is a distinct product with its own design is a
destination, while `/admin` as one role of one app is a persona instead.

A doubtful candidate is **offered, never dropped**. An option the user never saw
is the one failure this design exists to prevent.

## 5. Monorepos

Scope to what is **deployed under one origin** - that is what "one permanent URL"
means. Packages that are never served (a shared config, a utility lib) are not
destinations even when they build.

Where several apps in the repo deploy separately, the Rooter goes at the **root
of the deployment the client is given**, and the others are destinations only if
they are reachable from it by URL. The Rooter always takes that deployment's `/`
- which app owns the Rooter is a question, where within it the Rooter sits never
is. If no deployment is obviously the client's, ask **which app**, not which
path.
