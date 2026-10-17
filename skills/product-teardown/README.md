# Product Teardown

This skill takes a product apart module by module, capturing every screen, state and element, so it could be redesigned from the write-up. You end up with a dated teardown and screenshots per module.

## When to Use This Skill

- Researching one module of a product, or tearing down the whole thing
- Documenting your own product before a redesign or rebuild
- Studying a reference product, a Figma file or a mobile app
- A module shows too little and close competitors should be studied

## What This Skill Does

1. **Maps the Product**: Proposes a module list and waits for your confirmation
2. **Researches in Parallel**: One agent per module, at most 3 at a time
3. **Captures Everything**: A JPEG of every screen and state, plus all copy and fields
4. **Writes the Teardown**: Flows, UX analysis, edge cases and cited outside findings per module
5. **Falls Back to Competitors**: Studies alternatives you confirm when a module shows too little
6. **Stays Safe**: Never deletes, pays or changes settings; test data is listed for cleanup

## How to Use

### Basic Usage

```
Tear down acme-crm.com
```

```
Research how Acme CRM does invoicing
```

### Your Own Product

Say it is yours (or your client's), and it also writes the module definition and user flows:

```
Document our app module by module before the redesign: https://app.example.com
```

### A Product Behind a Login

It recommends a test account and saves the login to `.claude/product-teardown.local.env` (mode 600, git-ignored). It types it in without ever printing it.

### A Figma File or a Mobile App

Give a Figma link, or the app's name and store links. For native apps it uses store listings, videos and help articles first, then asks you for phone screenshots or recordings to fill the gaps.

### Install

```
aistack add product-teardown
```

## Example

**User**: "Research how Acme CRM does invoicing. It's a reference product, here's a test login."

**Skill**: Proposes the module `invoicing` (create, send and track invoices, entry `/invoices`) and waits for a yes. Its agent then reports back, and the summary reads:

```
invoicing: 9 screens, 31 states captured
  teardown: project-management/research/internal/product-knowledge/modules/invoicing/research/teardown-acme-crm-2026-10-17.md
  gaps: "Delete invoice" not exercised (safety rule); recurring invoices behind an upgrade
  test data to clean up: teardown-test-invoice, teardown-test-customer
Login stored in .claude/product-teardown.local.env
```

## Tips

- Use a test account, never a real one: the skill fills and submits forms
- Say whether the product is yours; a reference product gets research files only
- Clean up the `teardown-test-*` records listed in each module's `notes.md`
- Web products are studied at desktop width only
- Finish any MFA or captcha yourself in the Orca window
- It follows the project's naming rules or research `README.md` when there are any

## Related Use Cases

- `research-workspace` to set up and look after the research tree the teardowns land in
- `create-competitor-profile` when a competitor deserves a complete, sourced profile rather than the starter one a teardown writes
- `update-competitor-profile` to keep competitor profiles current later, including those starter ones
- `site-to-figma` to pull the same product's visual design system into Figma

## Requirements

- **Orca**, for its embedded browser. There is no fallback browser.
- **The Figma MCP server** is optional; with it, Figma files are read exactly instead of from screenshots.

## Output

```
project-management/research/internal/product-knowledge/modules/<module>/
├── <module>.md        own product only
├── userflows.md       own product only
├── notes.md           gaps, open questions, test data created
└── research/
    ├── teardown-<product>-<YYYY-MM-DD>.md
    └── screenshots/   <product>-<screen>-<state>-<YYYY-MM-DD>.jpg

project-management/research/external/competitor-analysis/profiles/<competitor>.md
```

An older workspace with a root `research/` folder keeps using it.
