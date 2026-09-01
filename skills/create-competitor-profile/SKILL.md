---
name: create-competitor-profile
description: Researches a new competitor from scratch and produces a complete, sourced competitor profile that matches the standardized section structure used across research/external/competitor-analysis/profiles/. Conducts multi-source research, classifies confidence, writes inline citations, and generates the Mermaid feature map and user-flow diagrams - so a brand-new profile lands consistent with any profiles the project already has. Use whenever adding a competitor that does not yet have a profile.
---

# Create Competitor Profile

This skill stands up a brand-new competitor profile from scratch. It researches a competitor across many public sources and writes a complete, sourced profile that matches the standardized structure already used by the existing profiles in `research/external/competitor-analysis/profiles/` - so a new file lands consistent with them instead of drifting into its own format.

It produces one file: the profile itself, at the correct path with the correct naming. It does not edit any other analysis file.

## When to Use This Skill

- Adding a competitor that does not yet have a profile in `research/external/competitor-analysis/profiles/`
- Standing up the first profile for a competitor in a new market segment
- Turning loose competitor notes or a quick scan into a full, sourced, structured profile

Use **update-competitor-profile** instead when a profile already exists and only needs refreshing. This skill is for net-new profiles; that one is for keeping existing ones current.

## What This Skill Does

1. **Confirms the competitor** and the kebab-case filename to write
2. **Researches across many public sources**, not just the competitor's own website
3. **Validates findings** by corroborating them across multiple independent sources
4. **Classifies confidence** so confirmed facts, estimates, inferences, and rumors are never blurred together
5. **Drafts every section** in the standardized order, with inline citations throughout
6. **Builds the Mermaid diagrams** (feature map plus persona user/task flows)
7. **Writes the profile** to the correct path with the correct name
8. **Seeds the Changelog** with the initial `Initial profile created` row

## The Profile Structure

Every profile follows the same section order. Match it exactly, top to bottom:

1. `# [Competitor Name]` - title, immediately followed by a one-to-two sentence descriptor blockquote (`> ...`) summarizing what the product is
2. `## Overview` - a metadata table (Category, Owner, Launched, Primary market, Platform, Pricing, Core hook, Official site, Last updated) plus short reading-notes paragraphs
3. `## Company & Product Overview` - who builds it, history, and what the product is
4. `## Branding & Design` - personality and tone, tagline, visual identity, design patterns, UX strengths, UX weaknesses
5. `## Product Features` - feature inventory, onboarding and core journey, community and social, discovery, mobile, integrations, technical requirements, and a "gaps at a glance" line
6. `## Ecosystem Coverage` - primary market or segment, breadth of coverage, single- vs multi-segment focus, opportunity and limitation
7. `## Business Model` - revenue model, how it creates value, partnerships, pricing structure
8. `## Target Audience` - primary and secondary segments, geography, casual vs competitive, a 5-row personas table, then one subsection per persona (Who, Goal, Behaviors, Why this platform, Pain points)
9. `## Growth & Adoption` - primary driver, user base and traffic, community size, engagement indicators, a milestones table, and press coverage
10. `## Market Position` - positioning statement, key differentiator, competitive advantages, direct and indirect competitor tables, and a "where it sits" summary
11. `## User Flows & Feature Maps` - a `### Coverage map` table, a `### Feature map` (Mermaid), then several `### User flow` diagrams and a `### Task flow` diagram (Mermaid each)
12. `## SWOT Analysis` - a 2x2 table (Strengths / Weaknesses on the left, Opportunities / Threats on the right), each cell bulleted
13. `## User Feedback Analysis` - overall sentiment, common praises, common complaints, requested features, frustrations, retention drivers, representative quotes, and a sentiment trend note
14. `## Sources and method` - method and data-quality notes, then a bulleted list of referenced URLs with descriptions
15. `## Changelog` - a reverse-chronological table (Date | Sections affected | Summary of changes | Reason), newest first, append-only

Open the existing files in `research/external/competitor-analysis/profiles/` and treat them as the gold-standard worked examples. Match their depth, formatting, and tone. When in doubt about how a section should read, copy the shape of the existing profiles. If the folder is empty (this is the project's first profile), the structure above is the authority - aim for a thorough profile in the region of 500 lines.

## The Research Workflow

This is the order of operations:

1. **Confirm the target.** Pin down the exact product, its owner, and the kebab-case filename.
2. **Conduct fresh research.** Gather information from multiple sources (see "Where to Research").
3. **Validate across independent sources.** Prefer a primary source plus at least one independent corroborating source before treating something as confirmed. If sources disagree, document the disagreement rather than picking one silently.
4. **Draft section by section.** Write each section in the standardized order, with inline citations and confidence markers as you go.
5. **Assemble the diagrams.** Build the feature map and the persona user/task flows in Mermaid.
6. **Write the file.** Save to the correct path, then seed the Changelog.

## Where to Research

Go well beyond the competitor's official website. Triangulate across public sources:

- Official website, blog, release notes, and changelogs
- Reddit threads and subreddits
- Discord communities and announcements
- Forums and community boards
- Independent blogs and news coverage
- YouTube reviews, demos, and walkthroughs
- Social media (announcements, user reactions)
- App store and product review sites
- Industry reports and analyst write-ups

## Classifying Information

Never blur confirmed facts together with weaker signals. Label every claim by its confidence level, using the markers already established in the profiles:

- **Confirmed fact** - directly sourced and corroborated. Cite inline as `([source](url))`.
- **Estimate** - a reasoned figure or directional read. Mark with `*(medium confidence)*` and explain the basis.
- **Inference** - an analytical reading not directly stated by a source. Mark with `*(inference)*`.
- **Rumor or community speculation** - unconfirmed chatter. Mark with `*(unverified)*` and attribute it to where it came from.

Use inline hyperlinked citations throughout, consistent with the existing profile style.

## User Flows & Feature Maps

The `## User Flows & Feature Maps` section is a real deliverable, not a placeholder. It contains:

- A `### Coverage map` table mapping personas to journeys and artifact types
- A `### Feature map` rendered as a Mermaid `flowchart LR` of the product's information architecture
- Several `### User flow` diagrams (typically 3-4), each with a stated Persona, Goal, and Output, then a Mermaid `flowchart`
- A `### Task flow` diagram for a focused in-product task

Match the number and style of diagrams in the existing profiles. For a project's first profile, include the coverage map, the feature map, 3-4 user flows, and one task flow.

## File Naming & Placement

- Write to `research/external/competitor-analysis/profiles/[competitor-name].md`
- The filename is **kebab-case, lowercase, no numbers** (for example `acme.md`, `acme-platform.md`)
- **No em dashes** anywhere in the content - use a regular hyphen (`-`)
- This is **Phase 2 - Research** work per the workspace phase rules (see `rules/` and the root readme)
- Seed the Changelog with the first row, for example:

| Date | Sections affected | Summary of changes | Reason |
|---|---|---|---|
| 2026-06-26 | All | Initial profile created | First research pass on the competitor |

Use `YYYY-MM-DD` dates and cite the sources behind the entry.

## Tips

- Validate before writing - confirm a claim across sources before it reaches the profile.
- Keep the tone analytical and honest about limitations; do not fabricate figures, user counts, or pricing.
- Flag anything unverifiable clearly with `*(unverified)*` rather than upgrading it to a fact.
- Match the existing section order, formatting, and depth exactly. Consistency across profiles is the point.

## Related Skills

- **content-research-writer** - use it for the underlying research, citation, and section-by-section feedback mechanics while drafting the profile.
- **update-competitor-profile** - use it later to keep this profile current once it exists.
- After a new profile is written, the cross-analysis files (`feature-matrix.md`, `pain-points.md`, `opportunities.md`, `pricing-comparison.md`) may need the new competitor added to stay complete. That integration is out of this skill's scope - handle it separately.

This skill is invoked manually whenever a new competitor needs a profile.
