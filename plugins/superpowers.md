---
name: superpowers
description: Jesse Vincent's skills library for Claude Code - brainstorming, plans, test-driven development, systematic debugging, code review and parallel agents - which introduces itself at the start of every session. A Claude Code plugin.
plugin: superpowers@claude-plugins-official
marketplace: anthropics/claude-plugins-official
---

# Superpowers

Working habits for Claude Code as skills: brainstorm before building, plan, test first, debug systematically, verify before calling it done. It introduces itself at the start of every session.

## What You Get

- 15 skills, used as `superpowers:<name>`: brainstorming, writing-plans, executing-plans, test-driven-development, systematic-debugging, requesting-code-review, receiving-code-review, verification-before-completion, using-git-worktrees, dispatching-parallel-agents, subagent-driven-development, finishing-a-development-branch, writing-skills, diagnosing-superpowers and using-superpowers
- A session-start hook that loads using-superpowers, so Claude reaches for the right skill on its own

## How It Installs

`aistack add superpowers` enables it in the project's `.claude/settings.json`. Claude Code installs it for everyone who opens the project and keeps it up to date. Claude Code only.

## Source

[obra/superpowers](https://github.com/obra/superpowers) by Jesse Vincent, MIT. Listed in Anthropic's `claude-plugins-official` marketplace.
