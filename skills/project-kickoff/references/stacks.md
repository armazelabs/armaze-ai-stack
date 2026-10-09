# Stacks

What each choice means, and what it adds to `CLAUDE.md` (the "Stack" and
"Commands" sections) and to `project-management/docs/architecture.md`. Commands are written as
"once the code exists" - the kickoff creates no app code.

## Web stack (Website, and the front of a SaaS)

| Option | Description for the question | Writes into CLAUDE.md |
| --- | --- | --- |
| **Next.js + Tailwind + shadcn (Recommended)** | React framework with Tailwind styling and shadcn/ui components, deployed on Vercel. | Next.js (App Router, TypeScript), Tailwind CSS, shadcn/ui, Vercel. Server Components by default; client components only for interactivity. |
| **Astro + Tailwind** | Content-first static site, lighter for marketing and docs, with React islands where needed. | Astro, Tailwind CSS, content collections for pages and posts, deployed on Vercel or Netlify. |
| **Other** | Typed by the user. | What they said, verbatim. |

## SaaS backend (no default - always ask)

| Option | Description for the question | Writes into CLAUDE.md |
| --- | --- | --- |
| **Supabase + Stripe** | Postgres, auth and storage from Supabase, billing through Stripe. | Supabase (Postgres, Auth, Storage, row-level security on every table), Stripe Billing. Migrations live in `supabase/migrations/`. |
| **Neon + Better Auth + Stripe** | Serverless Postgres, a self-hosted auth library, Stripe billing. | Neon Postgres with Drizzle ORM, Better Auth, Stripe Billing. Migrations in `drizzle/`. |
| **Convex + Clerk + Stripe** | Reactive backend-as-a-service, hosted auth, Stripe billing. | Convex (queries, mutations, actions in `convex/`), Clerk, Stripe Billing. |
| **Other** | Typed by the user. | What they said, verbatim. |

## Mobile (no default - always ask)

| Option | Description for the question | Writes into CLAUDE.md |
| --- | --- | --- |
| **Expo + EAS** | React Native with Expo Router, built and shipped to the stores through EAS. | Expo (SDK current at start), Expo Router, TypeScript, EAS Build / Submit / Update. |
| **Native Swift / Kotlin** | Separate native iOS and Android apps. | SwiftUI (iOS) and Jetpack Compose (Android), two codebases under `apps/ios` and `apps/android`. |
| **Flutter** | One Dart codebase for iOS and Android. | Flutter, Dart, Riverpod for state unless decided otherwise. |
| **Other** | Typed by the user. | What they said, verbatim. |

## Permissions per stack

Added to `.claude/settings.json` on top of the base set in `mcp.md`.

| Stack | `ask` (needs a yes each time) |
| --- | --- |
| Vercel (Next.js, Astro on Vercel) | `Bash(vercel deploy --prod:*)`, `Bash(vercel --prod:*)`, `Bash(vercel env rm:*)` |
| Supabase | `Bash(supabase db push:*)`, `Bash(supabase db reset:*)` |
| Neon / Drizzle | `Bash(npx drizzle-kit push:*)` |
| Convex | `Bash(npx convex deploy:*)` |
| Expo + EAS | `Bash(eas submit:*)`, `Bash(eas update --branch production:*)`, `Bash(eas build --profile production:*)` |
