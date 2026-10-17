# Plugins

Claude Code plugins the stack offers. A plugin bundles skills with the hooks, agents and commands they rely on, so it is installed as a whole by Claude Code rather than copied: `aistack add <name>` declares the plugin's marketplace and enables it at project scope, which writes both into the project's `.claude/settings.json`. Commit that file and everyone who opens the project gets the plugin; Claude Code keeps it up to date, and `aistack update` leaves it alone. Plugins work in Claude Code only.

## On the shelf

| Plugin | What it does | Source |
|---|---|---|
| `impeccable` | Design fluency for frontend work: 24 commands for shaping, auditing and polishing UI, four agents, and hooks that check UI changes. | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) |
| `superpowers` | Skills for working habits: brainstorming, plans, test-driven development, systematic debugging, code review, parallel agents. | [obra/superpowers](https://github.com/obra/superpowers) |

## Adding a plugin

Each plugin is one card, `plugins/<name>.md`. Its front matter names it for `aistack` and says where Claude Code finds it:

```markdown
---
name: superpowers
description: One line, shown by aistack list.
plugin: superpowers@claude-plugins-official     # <plugin>@<marketplace name>
marketplace: anthropics/claude-plugins-official # the marketplace's GitHub owner/repo
---
```

The body is a short page for the `aistack` app: a title, a one- or two-sentence summary, what you get, how it installs, and the source. The plugin's own docs stay with its authors, so the README standard for skills doesn't apply here. Try it with `aistack add --to <a scratch repo> <name>`, then check that repo's `.claude/settings.json`, and add a row to the table above.
