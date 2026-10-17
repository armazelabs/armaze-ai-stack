---
name: impeccable
description: Paul Bakaus's design fluency for frontend work - one skill with 24 commands (shape, audit, critique, polish, animate, typeset and more), four review and asset agents, and hooks that check UI changes as you edit. A Claude Code plugin.
plugin: impeccable@impeccable
marketplace: pbakaus/impeccable
---

# Impeccable

Design fluency for frontend work: Claude designs, critiques and polishes interfaces like a design director, and its hooks flag design anti-patterns as UI files change.

## What You Get

- The `impeccable` skill with 24 commands, such as `/impeccable shape`, `audit`, `critique`, `polish`, `animate`, `typeset`, `harden` and `live`
- `init` and `document`, which write `PRODUCT.md` and `DESIGN.md` for the project
- Four agents: an asset producer, a documenter, a finish reviewer and a live-edit applier
- Hooks at session start, after each edit and at the end of a turn that check UI changes

## How It Installs

`aistack add impeccable` enables it in the project's `.claude/settings.json`. Claude Code installs it for everyone who opens the project and keeps it up to date. Claude Code only.

## Source

[pbakaus/impeccable](https://github.com/pbakaus/impeccable) by Paul Bakaus, Apache 2.0. See [impeccable.style](https://impeccable.style).
