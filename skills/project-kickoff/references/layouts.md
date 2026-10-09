# Layouts

Which templates go where. Paths on the left are in `templates/`; paths on the
right are in the project. `templates/claude/` is written to `.claude/`.

## Every project

| Template | Written to |
| --- | --- |
| `CLAUDE.template.md` | `CLAUDE.md` (+ `AGENTS.md` symlink, made by `finish.zsh`) |
| `docs/brief.md` | `docs/brief.md` |
| `docs/architecture.md` | `docs/architecture.md` |
| `project-management/decisions.md` | `project-management/decisions.md` |
| `project-management/plans/README.md` | `project-management/plans/README.md` |
| `claude/settings.json` | `.claude/settings.json` |
| `claude/commands/plan.md` | `.claude/commands/plan.md` |
| `claude/commands/decision.md` | `.claude/commands/decision.md` |
| (from `mcp.md`) | `.mcp.json`, only when at least one server was kept |

## Per type

| Type | Template | Written to (one area) | Written to (several areas) |
| --- | --- | --- | --- |
| Website | `web/docs/content.md`, `web/docs/seo.md` | `docs/` | `apps/web/docs/` |
| SaaS | `saas/docs/billing.md`, `saas/docs/tenancy.md`, `saas/docs/data-model.md` | `docs/` | `docs/` (shared: the backend serves every app) |
| Mobile | `mobile/docs/app-store.md`, `mobile/docs/release.md` | `docs/` | `apps/mobile/docs/` |

## One area or several

- **One area** - a single type, or **Website + SaaS** (one web app holding both
  the marketing pages and the product). Everything sits at the root as above.
- **Several areas** - **Mobile together with Website and/or SaaS**. Shared
  product docs stay at the root; each platform gets its own folder with a
  `CLAUDE.md` from `area/CLAUDE.template.md`:
  - `apps/web/` - the website and/or SaaS front end.
  - `apps/mobile/` - the mobile app.
  - `backend/` - when SaaS is picked, or the mobile app needs a backend.
    Its `CLAUDE.md` says the vendor's own CLI will create `supabase/`,
    `convex/` or `drizzle/` here when coding starts.

  The root `CLAUDE.md` gets a "Areas" section: one line per area saying what it
  is and that its own `CLAUDE.md` applies when working inside it. `finish.zsh`
  makes an `AGENTS.md` symlink next to every `CLAUDE.md`.

Mobile alone with a backend is one area at the root plus `backend/`.
