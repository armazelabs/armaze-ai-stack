# Update Competitor Profile

Researches what has changed for a competitor and drafts section-level updates to its profile. Nothing is written until you approve; then only the affected sections change, logged in the profile's Changelog.

## When to Use This Skill

- A regular monthly or quarterly refresh
- A competitor shipped a feature, changed pricing, raised funds or was acquired
- Before a strategy or roadmap decision that relies on competitor data
- A profile looks stale, has gaps or makes doubtful claims
- Strengthening the sourcing behind existing claims

## What This Skill Does

1. **Reviews the Profile**: Reads it and its Changelog, flagging stale or unsourced claims
2. **Researches Updates**: Official site, Reddit, forums, news, YouTube, app stores, industry reports
3. **Validates Findings**: Seeks a primary and an independent source; marks confidence
4. **Drafts the Changes**: Current beside proposed text, sources, the Changelog row, flagged items
5. **Waits for Approval**: The live profile is untouched while you review
6. **Edits Surgically**: Only affected sections change; old citations stay; the row is appended

## How to Use

### Basic Usage

Install it into your project once with `aistack add update-competitor-profile`, then ask:

```
Update the competitor profile for Acme
```

```
Refresh Acme's profile - it hasn't been touched in three months
```

### After a Specific Change

```
Acme just announced a new pricing tier and a partnership. Update their profile.
```

The skill maps each finding to the sections it usually affects: pricing to Business Model, partnerships to Market Position and Business Model, and so on. A finding that shifts the competitive picture also brings the SWOT Analysis up for review.

### Approving or Revising the Draft

Reply to the draft to approve it, and the edits and the Changelog row are written together. Reply with changes instead and you get a revised draft. Without an approval, nothing is written.

## Example

**User**: "Acme announced new pricing, update their profile"

**Draft**:

```
Business Model - Pricing structure
  Current:  Free tier; Pro at $7/mo per seat.
  Proposed: Free tier; Pro at $9.99/mo per seat; new Team tier at $19/mo
            ([source](https://...)).

Sources: Acme pricing page and blog post (confirmed), one news report.

Proposed Changelog row:
| 2026-10-17 | Business Model | Updated pricing to the new $9.99/mo Pro and $19/mo Team tiers | Competitor announced new pricing; corroborated via official blog and a news report |

Flagged: a Reddit thread mentions an enterprise tier *(unverified)* - not added.
```

**User**: "Approved"

**Result**: only the pricing text in Business Model changes, and the row becomes the newest entry in the Changelog.

## Tips

- Read the flagged items: they need a person's judgement
- Low-confidence findings stay marked as such, never upgraded to facts
- The approval step is never skipped, so every change is seen first
- An older workspace's root `research/` tree is used, never duplicated

## Related Use Cases

- **create-competitor-profile**: writes the profile in the first place, for a competitor that has none
- **content-research-writer**: for the underlying research, citation and section-feedback mechanics while drafting updates
- **research-workspace**: sets up the research tree in `project-management/research/` that the profiles live in

## Where Findings Land

| Change found | Sections it usually affects |
|---|---|
| New features | Product Features, Ecosystem Coverage |
| Product updates and redesigns | Product Features, Branding & Design, User Flows & Feature Maps |
| Pricing changes | Business Model |
| Business changes (leadership, funding, layoffs) | Company & Product Overview, Business Model |
| Partnerships | Market Position, Business Model |
| Acquisitions | Company & Product Overview, Market Position |
| Community and audience growth | Growth & Adoption, Target Audience, User Feedback Analysis |
| Market developments | Market Position, SWOT Analysis |

Profiles live in `project-management/research/external/competitor-analysis/profiles/`.
