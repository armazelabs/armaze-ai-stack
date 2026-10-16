# sync-repo

Keeps a clean copy of a project's repo for the client, in a clone of the client's repo that each machine sets in `local.json`.

## Use it

Type `/sync-repo` (or say "sync repo").

- **Set up, once per project:** it copies the templates into `project-management/sync-repo/` and asks what this project needs: the first commit's message, the install and check commands, names to keep out, the pages to compare.
- **First time:** it copies the code over and cleans it. It offers to compare every page, then **stops**. Review the files, then say "commit".
- **After that:** each commit **pushed** here becomes one clean commit there, with the same dates. It asks once per run whether to keep each commit's original author and committer, or commit them all as you. Unpushed and uncommitted work waits.
- **On a new machine:** clone the client repo, and when it asks, give its folder. It writes `local.json` (not committed). Pull both repos before each sync.
- **Compare (optional):** it asks "Run the Playwright comparison?" It screenshots the same pages in both apps (desktop and phone, light and dark by default) and shows what differs. The first time, it checks every page; after that, only the pages the new commits touch.
- **Push:** it always asks "Push N commits to the client repo?" and pushes only on your yes.

It needs Node and git. For the comparison, run `npm install` in the skill folder once; it uses your installed Google Chrome. That install also brings TypeScript, which the code check needs when the project has none of its own.

## What the client never gets

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

All of these but `local.json` can be committed. None of them ever reaches the client repo. After each sync, `sync-log.md` has new rows: commit and push it, so the next person's sync starts from it.

## Change something

- **Another folder:** change `target` in `local.json`.
- **Leave more out:** add the path to `exclude`.
- **Block a word:** add it to `leakPatterns`.
- **Pages to compare:** `compare.pages`, and `compare.map` for which folder affects which pages.
- **The app to compare:** `compare.app` (its folder), `compare.command` (its dev server, with `{port}`), `compare.env`, `compare.loading` (loaders to wait out).
- **The client README:** it lives only in the client repo. Edit it there.
