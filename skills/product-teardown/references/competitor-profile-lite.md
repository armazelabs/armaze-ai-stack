# Competitor profile (lite)

Use this only when `external/competitor-analysis/profiles/<competitor>.md` does not exist yet. It is a starter profile built from one module study. Its section names match the full competitor profile structure used in that folder, so a later full profile (for example from a create-competitor-profile skill) can fill in the rest without restructuring. If other profiles already exist in that folder, follow their order and format instead.

Sections not covered by the study stay in place with "Not yet researched." Cite every fact inline as `([source](url))`, and tag inferences *(inference)*.

````markdown
# <Competitor Name>

> One or two sentences: what the product is and who it is for.

## Overview

| | |
|---|---|
| Category | |
| Owner | |
| Launched | |
| Primary market | |
| Platform | web / iOS / Android / desktop |
| Pricing | what was seen, with a source |
| Core hook | |
| Official site | |
| Last updated | YYYY-MM-DD |

## Company & Product Overview

Not yet researched.

## Branding & Design

UX strengths and weaknesses seen in the module study, linked to the teardown.

## Product Features

What the module study found, and a link to the teardown for detail:
[<module> teardown](../../../internal/product-knowledge/modules/<module>/research/teardown-<main-product>-<date>.md#<competitor-anchor>)

## Ecosystem Coverage

Not yet researched.

## Business Model

Not yet researched.

## Target Audience

Not yet researched.

## Growth & Adoption

Not yet researched.

## Market Position

Not yet researched.

## User Flows & Feature Maps

The flows from the module study (Mermaid), or a link to them.

## SWOT Analysis

Not yet researched.

## User Feedback Analysis

Review and forum findings about this module, with dates and sources.

## Module teardown: <module>

- **Studied:** YYYY-MM-DD, for the <main product> <module> teardown
- **How it handles the job:** ...
- **Better at:** ...
- **Worse at:** ...
- **Screenshots:** in `internal/product-knowledge/modules/<module>/research/screenshots/`, prefixed `<competitor>-`

## Sources and method

Starter profile from a product-teardown module study. Only the sections above with content were researched.

- <url> - what it is

## Changelog

| Date | Sections affected | Summary of changes | Reason |
|---|---|---|---|
| YYYY-MM-DD | All | Initial profile created (lite, from product-teardown) | <module> module study needed alternatives |
````

The relative link from `profiles/` to a module teardown is `../../../internal/product-knowledge/modules/<module>/research/<file>.md`. Check that the path resolves before writing it.
