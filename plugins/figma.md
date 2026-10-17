---
name: figma
description: Figma's official plugin - the Figma MCP server plus skills to read designs, write to Figma files, build design-system libraries and turn designs into code. A Claude Code plugin.
plugin: figma@claude-plugins-official
marketplace: anthropics/claude-plugins-official
---

# Figma

Connects Claude to Figma: it reads design files, writes screens and components into them, and turns designs into code.

## What You Get

- The Figma MCP server (you sign in to Figma the first time it is used)
- Skills used as `figma:<name>`, such as figma-use (read and write a file), figma-generate-library (build a design system), figma-generate-design (build screens), figma-design-to-code and figma-code-connect

## How It Installs

`aistack add figma` enables it in the project's `.claude/settings.json` (`--global` enables it for all your projects). Claude Code installs it for everyone who opens the project and keeps it up to date. Claude Code only.

## Source

[figma/mcp-server-guide](https://github.com/figma/mcp-server-guide) by Figma. Listed in Anthropic's `claude-plugins-official` marketplace.
