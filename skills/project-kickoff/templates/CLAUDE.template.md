# {{NAME}}

{{PITCH}}

<!-- kickoff: One or two sentences on who it is for and what it must do first, from the brief. -->

## Stack

<!-- kickoff: The chosen stack as a short list, from references/stacks.md ("Writes into CLAUDE.md"). Say no code exists yet: the first coding session sets it up with the vendor's own starter. -->

## Where things live

- `docs/brief.md` - what the product is, for whom, and the first features. Read it before planning a feature.
- `docs/architecture.md` - how the pieces fit. Update it when that changes.
- `project-management/plans/` - one plan per feature, written before building it (`/plan`).
- `project-management/decisions.md` - decisions and their reasons, newest first (`/decision`).
<!-- kickoff: Add one line per type-specific doc written (docs/billing.md, docs/app-store.md, ...). For several areas, add an "Areas" section: one line per area folder, saying its own CLAUDE.md applies inside it. -->

## How to work here

- Plan before building anything bigger than a small fix: write the plan to `project-management/plans/`, get it agreed, then build.
- Record any decision a future reader would question in `project-management/decisions.md`.
- Keep `docs/` true: when a change makes a doc wrong, fix the doc in the same change.
- Never read or print secrets. Keys live in `.env*` files that stay out of git; `.env.example` lists the names.

## Commands

<!-- kickoff: "None yet - no code exists." plus the commands the stack will use once it does (dev, build, test, lint, deploy), marked as expected. -->

## Open questions

<!-- kickoff: Anything the interview left open, one line each. Remove the section if nothing is open. -->
