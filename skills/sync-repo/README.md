# Sync Repo

Keeps a cleaned copy of your repo for the client: each pushed commit becomes one commit in their repo, with the same dates, minus AI files, internal docs and Figma references.

## When to Use This Skill

- The client owns a repo and must not see your AI tooling, research or Figma references
- New pushed commits need to reach the client's copy
- Setting the sync up in a project, or on a new machine
- Checking the client's app looks exactly like yours before pushing

## What This Skill Does

1. **Syncs Commit by Commit**: Each pushed commit becomes one, same dates and, by default, authors
2. **Strips Internal Content**: Leaves out AI, research and Figma files; cleans comments
3. **Proves Only Comments Changed**: Checks the code is identical, scans for leaks, runs project checks
4. **Waits the First Time**: Cleans the whole tree, then waits for your "commit"
5. **Compares Both Apps**: Optional Playwright screenshots of the same pages, with differences
6. **Pushes Only on Your Yes**: Always asks, never force-pushes

## How to Use

### Basic Usage

In Claude Code, in the project:

```
/sync-repo
```

Or say "sync repo" or "sync the client repo". It lists the pushed commits waiting to be synced, applies and cleans them one at a time, commits each, and then asks about the comparison and the push.

### Set It Up (Once per Project)

It needs Node and git. Install it with `aistack add sync-repo`, then say "set up sync-repo" (or just run `/sync-repo`). It copies its templates into `project-management/sync-repo/`, fits the excluded paths to your repo, and asks what this project needs: the first commit's message, the install and check commands, names to keep out, and the pages to compare.

### On a New Machine

Clone the client repo, and when it asks, give its folder. It writes `local.json`, which is never committed. Pull both repos before each sync.

### The First Sync

It copies the code over and cleans it, offers to compare every page, then **stops**. Review the files in the client's copy, then say "commit". It asks whether to keep the original author and committer, makes the first commit with the message from `rules.md`, and asks to push.

### Compare the Two Apps

Run `npm install` once in the skill folder on each machine that compares. It uses your installed Google Chrome, and it also brings TypeScript, which the code check needs when the project has none of its own. During a sync it asks "Run the Playwright comparison?" and, on yes, screenshots the same pages in both apps (desktop and phone, light and dark by default) and shows what differs. The first time it checks every page; after that, only the pages the new commits touch. Before it runs, it lists any uncommitted files or unsynced local commits that could show up as false differences, and asks whether to compare anyway.

## Example

**User**: "sync repo"

**Claude** finds two pushed commits waiting: "Add password reset screen (C-146, per Sam's review)" and "Fix date picker on Safari". It applies the first and cleans its comments: a `D-041` reference goes, and "Figma frame 244:1770 puts 16px between rows" becomes "16px between rows". The check passes, so it asks: "Keep each commit's original author and committer? (No commits them as you: ...)"

**User**: "Yes"

**Result**:

- Two commits in the client's repo, "Add password reset screen" and "Fix date picker on Safari", each with its source commit's dates, author and committer.
- `pnpm check` from `rules.md` passed in the client's copy.
- "Run the Playwright comparison of /login, /reset-password?" On yes: every shot the same, desktop and phone, light and dark.
- "Push 2 commits to the client repo?" On yes, it pushes.
- `project-management/sync-repo/sync-log.md` has two new rows: commit and push it.

## Tips

- Push your commits first; only pushed commits are synced
- Pull both repos before each sync; it says which one needs a pull
- Commit and push `sync-log.md` after each sync; Sync Repo never does
- Answer "no" to the author question to commit as yourself; dates stay the source's
- On-screen app text is never edited; internal names there are reported
- The comparison only reports; it changes and commits nothing

## Related Use Cases

- Projects that use `time-tracker` or `module-docs`: their files live under `project-management/`, which never reaches the client, and the client's `package.json` keeps no `time:*` scripts.
- Handing a prototype over to a client who owns the repo
- Delivering work commit by commit, with the original dates intact

## What the Client Never Gets

The paths come from `exclude` in `config.json`. By default:

- AI files: `.claude/`, `.agents/`, `CLAUDE.md`, `AGENTS.md`, `.mcp.json`, skills, tools
- `research/`, `project-management/`, `tasks/`, `rules/`, `PRODUCT.md`, `feature.md`
- Anything Figma-related: `FIGMA.md`, plus Figma keys, node ids and frames in comments
- In comments: decision and change IDs (D-xxx, C-xxx), names, dates, tool names

Comments are kept short. Code is never changed, and every sync checks that.

## Files

| File | What it is |
|---|---|
| `project-management/sync-repo/config.json` | What to leave out, the words to block, the pages to compare (shared) |
| `project-management/sync-repo/rules.md` | What is particular to this project: first commit, check commands, names, special files |
| `project-management/sync-repo/local.json` | This machine's client folder (gitignored, one per machine) |
| `project-management/sync-repo/sync-log.md` | Which commit here became which commit there |
| `SKILL.md` | The steps and cleaning rules the skill follows |
| `scripts/sync.mjs` | The script that does the copying and checking |
| `scripts/compare.mjs` | The Playwright comparison of both apps |
| `templates/` | The starting config, rules and log |

A project that already has a `.sync-repo/` folder keeps using it instead of `project-management/sync-repo/`.

All of these but `local.json` can be committed. None of them ever reaches the client repo.

## Change Something

- **Another folder:** change `target` in `local.json`.
- **Leave more out:** add the path to `exclude`.
- **Block a word:** add it to `leakPatterns`.
- **Pages to compare:** `compare.pages`, and `compare.map` for which folder affects which pages.
- **The app to compare:** `compare.app` (its folder), `compare.command` (its dev server, with `{port}`), `compare.env`, `compare.loading` (loaders to wait out).
- **The client README:** it lives only in the client repo. Edit it there.
