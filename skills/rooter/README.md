# Rooter

Builds and maintains a Rooter: one on-brand page at a project's root that gives the client a single permanent link to every version, product, deck or design system. Later changes are one-line config edits.

## When to Use This Skill

- A client needs one link to several versions, a product, a design system or a deck
- Adding or removing a destination in an existing Rooter
- Marking a destination chosen, in progress or archived
- One destination now, more coming: give the client the permanent link early
- Replacing a root redirect or a hand-made version chooser

## What This Skill Does

1. **Analyses the Project**: Finds its versions, products, personas and their routes
2. **Checks Every Link**: Requests each route and each external link
3. **Asks You to Tick**: A multi-select of destinations, shown on every run
4. **Proposes Tree and Copy**: Title, lede, row descriptions and footer, for your confirmation
5. **Builds at the Root**: Config and page at `/`, in the project's stack and branding
6. **Verifies and Reports**: Re-checks every link, reports failures first, never commits

## How to Use

### Basic Usage

Install it into your project once with `aistack add rooter`, then ask:

```
Add a Rooter to this project
```

### Add or Remove a Destination

```
Update Rooter and add V3
```

```
Add the deck to the Rooter: https://www.figma.com/deck/...
```

The checklist still appears, with the new destination marked alongside everything already there. External links such as decks, Figma files and TestFlight builds are never found by detection: give them in the request or through the checklist's **Other** option.

### Mark a Destination's Status

```
The client chose V2
```

```
Retire V1
```

```
V3 is still being built
```

`chosen` lifts a row to the top and `archived` sinks it to the bottom, so those two go through confirmation. Marking a row in progress is done without asking.

### A One-Row Rooter

```
Build a Rooter even though there's only V1 for now
```

A one-row Rooter renders exactly like a three-row one. Later destinations appear under the same link.

### Skip the Confirmation

```
Update Rooter and add V3 without confirmation
```

The change is made directly and reported afterwards.

## Example

**User**: "Add a Rooter to this project"

**Result**: after the checklist (three versions ticked, the sparse design system left out), the proposal:

```text
Proposed Rooter:

Root
├── Version 1
├── Version 2
└── Version 3

Title: Three landing-page designs, built to be compared.
Lede:  Same firm, same constraints, three arguments.

  version · chosen  Field & Plate - A chromatic dark field, rounded media plates, a hero video.
  version           Register - A hairline-ruled modular grid on paper, square everywhere.
  version · new     Broadside - A warm-ink stage at poster scale, display type crossing the plate.

Footer: Copyright © 2026 FloorZap   (name from the <title> - say if it's wrong)
```

On "Yes, build it", it writes the config and the page, re-checks every link and reports the result, leaving the working tree for you to review.

## Tips

- It always lives at `/` and never asks where
- Once built, changes are config edits (older Rooters get a one-time page upgrade)
- Confirm the project name when asked; it is never guessed from the repo
- Two levels at most: the root, and one chooser under a destination
- A row shows `new` for 14 days after its `added` date
- If the project can't be served, routes come from the files, marked unchecked

## Related Use Cases

- Sharing several design versions with a client for side-by-side comparison
- Handing a client one link for the product, its design system and the deck
- Recording which version the client picked while keeping the others reachable

## Files It Writes

- A config file next to the page, in the project's idiom: `rooter.config.ts` where the project has types, otherwise `rooter.config.js`, `rooter.json` or `rooter.yaml`
- The Rooter page at `/`, in the project's own framework and router
- A second-level page wherever a nested level (such as personas) renders
- The kind icons it uses (`app`, `system`, `deck`, `version`, `mobile`), copied from the skill's `assets/icons/`

## Kinds and Statuses

| Kind | Typical destination |
|---|---|
| `app` | The product, a web app, an admin that is its own product |
| `system` | A design system, Storybook, a component gallery |
| `deck` | A deck, a pre-read, a Figma file, a PDF |
| `version` | One of several design versions being compared |
| `mobile` | A hosted mobile build, an Expo or TestFlight link |

A row can carry one status: `chosen`, `in-progress` or `archived`, or the derived `new`. Any other kind you name renders as a word with no icon.
