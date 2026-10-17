# Create Competitor Profile

Researches a competitor that has no profile yet and writes one new, sourced profile in the project's standard fifteen-section structure, so it matches the profiles you already have.

## When to Use This Skill

- Adding a competitor that has no profile yet
- Writing the first profile for a new market segment
- Turning loose notes or a quick scan into a full, sourced profile

When a profile already exists and only needs refreshing, use **update-competitor-profile** instead.

## What This Skill Does

1. **Confirms the Competitor**: Pins down the product, its owner and the filename
2. **Researches Widely**: Official site, Reddit, forums, news, YouTube, app stores, review sites
3. **Validates and Grades**: Seeks a primary and an independent source; marks confidence
4. **Drafts Every Section**: All fifteen sections in order, with inline citations
5. **Builds the Diagrams**: Coverage map, Mermaid feature map, persona user flows, task flow
6. **Writes the Profile**: Saves it under a kebab-case name and seeds its Changelog

## How to Use

### Basic Usage

Install it into your project once with `aistack add create-competitor-profile`, then ask:

```
Create a competitor profile for Acme Platform
```

```
Add a profile for Acme - we don't have one yet
```

### From Your Own Notes

```
Turn these notes on Acme into a full competitor profile: <paste notes>
```

The notes are a starting point. Every claim is still researched, sourced and marked by confidence.

### The Project's First Profile

When the profiles folder is empty, the section structure is the authority, and the skill aims for a thorough profile of around 500 lines. Once profiles exist, it treats them as the worked examples and matches their depth, formatting and tone.

## Example

**User**: "Create a competitor profile for Acme Platform"

**Result**: the skill confirms the product and the filename `acme-platform.md`, researches it, and writes:

```markdown
# Acme Platform

> A web and mobile scheduling tool for small field-service teams.

## Overview

| | |
|---|---|
| Category | Field-service scheduling |
| Pricing | Free tier, paid plans per seat ([source](https://...)) |
| Last updated | 2026-10-17 |

...

## Growth & Adoption

Roughly 40,000 teams, based on the company's own blog and two press reports *(medium confidence)*.

...

## Changelog

| Date | Sections affected | Summary of changes | Reason |
|---|---|---|---|
| 2026-10-17 | All | Initial profile created | First research pass on the competitor |
```

## Tips

- Every claim is checked across sources before it reaches the profile
- Unverifiable figures, user counts or pricing are marked `*(unverified)*`, never upgraded
- Open an existing profile first to see the depth it aims for
- It uses plain hyphens, never em dashes
- An older workspace's root `research/` tree is used, never duplicated
- Adding the competitor to the cross-analysis files is a separate job

## Related Use Cases

- **update-competitor-profile**: keeps this profile current once it exists, through a draft you approve
- **content-research-writer**: for the underlying research, citation and section-by-section feedback while drafting
- **research-workspace**: sets up the research tree in `project-management/research/` that the profiles live in
- **ux-visualization-assistant**: for checking or reworking the profile's user flows and feature map

## Profile Sections

Every profile follows this order, top to bottom:

1. Title and a one-to-two sentence descriptor blockquote
2. Overview (a metadata table plus short reading notes)
3. Company & Product Overview
4. Branding & Design
5. Product Features
6. Ecosystem Coverage
7. Business Model
8. Target Audience (with a five-row personas table and one subsection per persona)
9. Growth & Adoption
10. Market Position
11. User Flows & Feature Maps
12. SWOT Analysis
13. User Feedback Analysis
14. Sources and method
15. Changelog (newest first, append-only)
