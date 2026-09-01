---
name: update-competitor-profile
description: Reviews existing competitor profiles and proposes refreshed information - new features, pricing, business changes, partnerships, acquisitions, community growth, and market developments - as a draft of section-level changes for review. Never edits a profile directly; applies updates only after explicit approval, preserving prior research and logging every change in the profile's Changelog with dates and sources.
---

# Update Competitor Profile

This skill keeps competitor intelligence current. It reviews existing competitor profiles, researches what has changed in the market, and proposes precise, sourced updates - so profiles stay fresh and trustworthy instead of quietly going stale.

It never edits a profile on its own. Every change is prepared as a draft, presented for review, and applied only after you approve it.

## When to Use This Skill

- On a periodic refresh cadence (for example, monthly or quarterly) to keep profiles from drifting out of date
- After hearing that a competitor shipped a feature, changed pricing, raised funding, was acquired, or formed a partnership
- Before a strategy, positioning, or roadmap decision that relies on accurate competitor data
- When a profile looks stale, has gaps, or contains claims that may no longer be true
- When you want to verify or strengthen the sourcing behind existing claims

## What This Skill Does

1. **Reviews the existing profile** to understand what is currently documented
2. **Detects stale content** that is outdated, incomplete, or contradicted by newer information
3. **Researches updates** across many public sources, not just the competitor's own website
4. **Validates findings** by corroborating them across multiple independent sources
5. **Classifies confidence** so confirmed facts, estimates, rumors, and speculation are never blurred together
6. **Prepares a draft** of the proposed section-level changes (current text vs. proposed text, with sources)
7. **Presents the draft for review** without touching the live profile
8. **Applies updates only after explicit approval**, editing only the affected sections
9. **Logs every change** in the profile's Changelog with dates and sources
10. **Preserves existing research** and source references, enhancing rather than replacing them
11. **Flags anything unverifiable** for manual review

## The Update Workflow

This is the required order of operations. The draft-then-approve gate is mandatory - it is the backbone of the workflow, not an optional step.

1. **Review the current profile.** Read the whole document and note what each section claims and when it was last touched (see the Changelog).
2. **Identify sections that may be outdated.** Flag claims that are time-sensitive, unsourced, or likely to have changed.
3. **Conduct fresh research.** Gather new information from multiple sources (see "Where to Research").
4. **Compare new findings against existing content.** Determine what is genuinely new or changed versus already captured.
5. **Prepare a draft of the proposed changes.** For each affected section, show the current text and the proposed replacement, with sources and confidence markers, plus the proposed Changelog entry. Do not touch the live file at this stage.
6. **Present the draft for review.** Share the draft and wait for explicit approval.
7. **On approval, update only the affected sections.** Make surgical edits; do not rewrite the document.
8. **Record the change in the Changelog.** Append a new row (never overwrite past entries).
9. **Preserve source references.** Keep existing citations and add new ones; never strip sourcing.
10. **Flag unverifiable areas for manual review.** Call out anything that could not be confirmed so a human can decide.

If approval is not given, nothing is written. Revise the draft based on feedback and present it again.

## What to Research

Look for changes in each of these areas, and map each finding to the profile sections it usually affects:

- **Newly released features** -> Product Features, Ecosystem Coverage
- **Product updates and redesigns** -> Product Features, Branding & Design, User Flows & Feature Maps
- **Pricing changes** -> Business Model
- **Business changes** (leadership, funding, layoffs, shutdown risk) -> Company & Product Overview, Business Model
- **Partnerships** -> Market Position, Business Model
- **Acquisitions** (acquiring or being acquired) -> Company & Product Overview, Market Position
- **Community and audience growth** (member counts, activity, sentiment shifts) -> Growth & Adoption, Target Audience, User Feedback Analysis
- **Broader market developments** (new entrants, category trends, platform shifts) -> Market Position, SWOT Analysis

When a finding materially shifts the competitive picture, also revisit the SWOT Analysis.

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

Prefer a primary source plus at least one independent corroborating source before treating something as confirmed. If sources disagree, document the disagreement rather than picking one silently.

## Classifying Information

Never blur confirmed facts together with weaker signals. Label every new claim by its confidence level, using the markers already established in the profiles:

- **Confirmed fact** - directly sourced and corroborated. Cite inline as `([source](url))`.
- **Estimate** - a reasoned figure or directional read. Mark with `*(medium confidence)*` and explain the basis.
- **Inference** - an analytical reading not directly stated by a source. Mark with `*(inference)*`.
- **Rumor or community speculation** - unconfirmed chatter. Mark with `*(unverified)*` and attribute it to where it came from.

Use inline hyperlinked citations throughout, consistent with the existing profile style.

## Presenting the Draft

The review draft is what the user sees before anything is written. It must contain:

- A **section-by-section list of proposed edits**, showing the current text and the proposed text side by side so the change is obvious
- The **new sources** backing each change, with their confidence markers
- The **proposed Changelog row** (see below), ready to be appended on approval
- A short list of **flagged items** that could not be verified and need a human decision

Nothing is written to the profile until the user approves. This same review-and-approval gate applies to every future update, without exception, so there is full visibility and control over how each document changes.

## Updating Surgically (after approval)

Once approved:

- Edit **only the affected sections**. Do not rewrite or re-flow untouched content.
- **Preserve existing research and structure.** Enhance prior content; do not discard it.
- Keep the profile's **standard section order, formatting, tone, and documentation standards** intact, consistent across all profiles.
- Keep all **existing citations** and add new ones alongside them.

## Changelog

Every approved update is recorded in the profile's Changelog section. The Changelog is a reverse-chronological table (newest first) and is **append-only** - never overwrite or remove past entries, so the audit trail of how the research evolved stays intact. The Changelog row is part of the approved draft and is written together with the section edits.

Columns and format:

| Date | Sections affected | Summary of changes | Reason |
|---|---|---|---|
| 2026-06-25 | Business Model, Market Position | Updated pricing to new $9.99/mo tier and added partnership with Example Org | Competitor announced new pricing and partnership; corroborated via official blog and two news reports |

Use `YYYY-MM-DD` dates. Cite the sources behind each entry in the Summary or Reason column.

## Tips

- Validate before drafting - confirm a claim across sources before it ever reaches the draft.
- Prefer a primary source plus an independent corroborating source for anything stated as fact.
- Flag low-confidence items clearly rather than upgrading them to facts.
- Keep the tone analytical and honest about limitations; do not fabricate figures.
- Never apply edits without sign-off. The draft-then-approve gate is non-negotiable.

## Related Skills

- **content-research-writer** - use it for the underlying research, citation, and section-feedback mechanics while drafting updates.
- The competitor profile structure is standardized across profiles (see `research/external/competitor-analysis/profiles/`); match it exactly when proposing changes.

This skill is invoked manually whenever competitor intelligence needs a refresh.
