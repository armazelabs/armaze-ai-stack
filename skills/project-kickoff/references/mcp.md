# MCP servers and permissions

Checked against each vendor's own docs on **2026-10-09**. If a server fails to
connect, look up the vendor's current MCP page before changing anything here.

## Servers per type

Ticked servers are on the keep-or-trim list in step 4; offered ones are
mentioned as "also available".

| Server | Ticked for | Offered for | Entry in `.mcp.json` |
| --- | --- | --- | --- |
| Vercel | Website, SaaS on a Vercel stack | - | `"vercel": { "type": "http", "url": "https://mcp.vercel.com" }` |
| shadcn | Next.js + shadcn stack | - | `"shadcn": { "type": "stdio", "command": "npx", "args": ["shadcn@latest", "mcp"] }` |
| Supabase | Supabase backend | - | `"supabase": { "type": "http", "url": "https://mcp.supabase.com/mcp" }` |
| Neon | Neon backend | - | `"neon": { "type": "http", "url": "https://mcp.neon.tech/mcp" }` |
| Convex | Convex backend | - | `"convex": { "type": "stdio", "command": "npx", "args": ["-y", "convex@latest", "mcp", "start"] }` |
| Stripe | Any SaaS backend with Stripe | - | `"stripe": { "type": "http", "url": "https://mcp.stripe.com" }` |
| Expo | Expo + EAS stack | - | `"expo": { "type": "http", "url": "https://mcp.expo.dev/mcp" }` |
| Clerk docs | - | Convex + Clerk | `"clerk": { "type": "http", "url": "https://mcp.clerk.com/mcp" }` (SDK snippets only; beta) |
| Better Auth docs | - | Neon + Better Auth | `"better-auth": { "type": "http", "url": "https://mcp.better-auth.com/mcp" }` (docs only) |

The file is `{ "mcpServers": { <entries> } }`. If `.mcp.json` exists, add only
the servers it doesn't have.

Notes for the report:

- Vercel, Supabase, Neon, Stripe and Expo sign in with OAuth: run `/mcp` once in
  Claude Code and pick the server. Because this project has its own Claude
  config, that sign-in belongs to this project only.
- Never put a key in `.mcp.json`. If a server must use a key instead of OAuth,
  reference a variable of the project's own naming (`"Authorization": "Bearer
  ${STRIPE_AGENT_KEY}"`); Claude Code blanks reserved names like
  `ANTHROPIC_API_KEY` in project files. Stripe keys used this way must be Agent
  API keys from 31 October 2026.
- Expo's local tools (simulator screenshots) also need `expo-mcp` in the app -
  a next step for when the code exists, not something the kickoff installs.
- Claude Code asks to approve project servers the first time it starts.

## Base permissions (every project)

`.claude/settings.json` starts from `templates/claude/settings.json`, which
already holds:

- `deny` - reading secrets and the project's own Claude login:
  `Read(./.env)`, `Read(./.env.local)`, `Read(./.env.*.local)`,
  `Read(./.env.production)`, `Read(./**/*.pem)`, `Read(./.claude-local/**)`.
  `.env.example` stays readable.
- `ask` - `Bash(git push:*)`.

Add the `ask` rules for the chosen stacks from `stacks.md`. If
`.claude/settings.json` exists, add only the rules it doesn't have and leave
everything else in it alone.
