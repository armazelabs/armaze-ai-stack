# Project Kickoff

This skill sets up a new project's AI layer: it asks what you're building, writes `CLAUDE.md`, product docs, `.claude/` settings and `.mcp.json`, and installs fitting Armaze skills. Then it commits once and removes itself.

## When to Use This Skill

- Starting a new project in an empty folder or a freshly cloned, empty repo
- Every session should start from the same rules, brief and stack
- Setting up a website, a SaaS, a mobile app, or a mix
- A kickoff stopped before its commit and needs finishing

## What This Skill Does

1. **Asks the Basics**: Project type, name, pitch and stack, plus optional detail
2. **Proposes Extras**: Pre-ticked shelf components, MCP servers and permissions to trim
3. **Previews Before Writing**: Lists every path as `create` or `skip (exists)`, waits for yes
4. **Writes the AI Layer**: `CLAUDE.md`, `project-management/` docs, `.claude/` settings and commands, `.mcp.json`
5. **Installs Shelf Components**: Runs `aistack add --to .` for the ones you kept
6. **Commits and Removes Itself**: Commits only what it wrote, then deletes its own folder

## How to Use

### Basic Usage

```zsh
mkdir ~/Projects/my-app && cd ~/Projects/my-app
aistack init
```

`aistack init` prepares the folder (git, `.gitignore`, the project's own Claude login in `.claude-local/`), installs this skill into `.claude/skills/project-kickoff/` and opens Claude Code on `/project-kickoff`. Sign in when it asks; that login belongs to this project only.

### Start It Yourself

After `aistack init --no-launch`, or if Claude Code was closed before the kickoff ran, start it from the project root:

```
claude /project-kickoff
```

### Finish a Kickoff That Stopped

The commit fails when git has no name or email set. Set them, then say:

```
Finish the kickoff
```

### In Another Tool

Outside Claude Code it asks the same questions as short numbered choices and skips the Claude-specific files.

## Example

In a new folder, `aistack init` opens the kickoff. The answers: SaaS, the name "Tide", "Shift planning for small clinics", Next.js + Tailwind + shadcn, Supabase + Stripe, no more detail for now, keep all extras. The preview:

```
create  CLAUDE.md
create  project-management/docs/brief.md
create  project-management/docs/architecture.md
create  project-management/docs/billing.md
create  project-management/docs/tenancy.md
create  project-management/docs/data-model.md
create  project-management/decisions.md
create  project-management/plans/README.md
create  .claude/settings.json
create  .claude/commands/plan.md
create  .claude/commands/decision.md
create  .mcp.json            vercel, shadcn, supabase, stripe
install skills/figma-to-code, skills/time-tracker, skills/module-docs, ...
```

**User**: Write it

**Result**:

```
Committed 3f9c2a1: Project kickoff: Tide
Removed .claude/skills/project-kickoff
```

The report lists what was written and skipped, the components installed, the MCP servers added, and next steps such as running time-tracker's and module-docs' own setup.

## Tips

- Set your git name and email first; the kickoff's one commit needs them
- It never overwrites a file, so re-running `aistack init` is safe
- Skip the optional detail if you're in a hurry; gaps become open questions
- No secrets go in `.mcp.json`; servers read keys from environment variables
- Approve the MCP servers on first start; run `/mcp` to sign in to OAuth ones
- The stack is written down, not installed; the first coding session sets it up

## Related Use Cases

- `module-docs` and `time-tracker`, ticked for a SaaS or a mobile app; their setup is left as a next step
- `figma-to-code`, ticked for every project type
- `research-workspace`, offered but never ticked, because it builds a second docs tree next to the kickoff's
- Planning features with `/plan` and recording decisions with `/decision` once the project is running

## Files It Writes

| Path | When |
| --- | --- |
| `CLAUDE.md`, with an `AGENTS.md` link | Always |
| `project-management/docs/brief.md`, `architecture.md` | Always |
| `project-management/decisions.md`, `project-management/plans/README.md` | Always |
| `.claude/settings.json`, `.claude/commands/plan.md`, `decision.md` | Always |
| `.mcp.json` | When at least one MCP server was kept |
| `project-management/docs/content.md`, `seo.md` | Website |
| `project-management/docs/billing.md`, `tenancy.md`, `data-model.md` | SaaS |
| `project-management/docs/app-store.md`, `release.md` | Mobile app |
| `apps/web/CLAUDE.md`, `apps/mobile/CLAUDE.md`, `backend/CLAUDE.md` | A mobile app together with a website or SaaS; website and mobile docs then go in `project-management/docs/web/` and `project-management/docs/mobile/` |
| `project-management/next-steps.md` | When there are next steps, such as `aistack` missing |
