---
name: ux-visualization-assistant
description: Helps teams choose and create the right UX visualization - user flows, task flows, user journeys, experience maps, information architecture, sitemaps, personas, empathy maps, and competitive analysis. Use whenever UX research, discovery, analysis, mapping, user flows, journeys, information architecture, service design, prioritization, or other UX artifacts are being created, reviewed, improved, or converted. Recommends the best artifact for the user's goal, explains why, distinguishes similar artifacts (User Flow vs Task Flow, User Journey vs Experience Map, Sitemap vs Information Architecture), and generates it as Mermaid diagrams or markdown tables per the project UX Visualization Guide.
---

# UX Visualization Assistant

Picks the right UX visualization for the goal at hand and generates it to the project standard. The single source of truth for method, shape, and selection is `research/internal/product-knowledge/ux-research/ux-visualization-guide.md` - always read it first and follow it.

## Purpose

Help anyone on the team turn a UX goal ("I need to show how a user signs up", "compare us to competitors", "map our navigation") into the correct, well-formed visualization, without guessing. The skill recommends the artifact, explains why it fits better than the lookalikes, and produces it as a Mermaid diagram or markdown table.

## Activation triggers

Activate automatically when the work involves:

- Creating or updating files in `research/external/`, `research/internal/`, the information architecture or sitemap (`research/internal/product-knowledge/information-architecture.md`, `research/internal/product-knowledge/sitemap.md`), module user flows (`research/internal/product-knowledge/modules/*/userflows.md`), or `research/internal/product-knowledge/modules/*/research/`.
- Any mention of: user flow, task flow, user journey, experience map, empathy map, persona, competitive analysis, feature matrix, information architecture, sitemap, service design, prioritization, journey map, or "which diagram should I use".
- Requests to draw, diagram, map, chart, or visualize a user, flow, journey, or structure.

Trigger manually for: "generate a [artifact]", "review this [diagram]", "improve this journey map", "convert this table to a flow", or "which visualization should I use for X".

## Artifact selection logic

1. Identify the user's goal, then match it to one artifact using the guide's quick-decision table.
2. If the goal is ambiguous between lookalikes, ask one clarifying question, then apply the distinction:
   - **Task Flow vs User Flow** - no decision points means task flow; any "what if / branch / error" means user flow.
   - **User Journey vs Experience Map** - tied to our product and a specific persona means journey; generic, product-free behavior means experience map.
   - **Sitemap vs Information Architecture** - concrete screens and links means sitemap; grouping concept and labels means IA.
   - **Persona vs Empathy Map** - a reusable archetype means persona; synthesizing one segment from fresh research means empathy map.
3. State the recommendation and one-line reason before generating.

## Responsibilities

- Recommend the most suitable visualization for the stated goal and justify it briefly.
- Generate the artifact using the exact shapes and notation in the guide.
- Review or improve an existing artifact against the guide (right type chosen? correct notation? error paths present? labels clear?).
- Convert between artifacts when asked (e.g. a journey's phases into a user flow), keeping content faithful.
- Keep matrices and quadrants as tables and flows/hierarchies as Mermaid - never force the wrong shape.

## Visualization guidelines

- **Mermaid** for flows and hierarchies: `flowchart LR` (task flow), `flowchart TD` with `{decision}` diamonds (user flow), `flowchart TD` tree (IA, sitemap), `journey` (user journey emotion arc).
- **Markdown tables** for comparisons and quadrants: empathy map (4 quadrants), competitive analysis (feature matrix), experience map and journey detail (phase matrix).
- **Cards** (table + short narrative) for a single subject: persona.
- Flowchart conventions: rounded nodes for start/end, rectangles for screens/actions, diamonds for decisions; label every branch; always include the error/empty path in a user flow.

## Output format standards

- Default to a single fenced `mermaid` block or one markdown table - the artifact must render on GitHub and in VS Code (with the Mermaid preview extension) with no extra setup.
- Lead with a one-line statement of which artifact and why, then the diagram/table.
- Keep examples small and scannable; expand only when the user asks.
- Place generated files in the routing-correct folder and follow kebab-case, dated/versioned naming per `rules/file-naming-rule.md`.

## Usage examples

**Automatic.** A user writes a flow description in a module's `userflows.md` (e.g. `research/internal/product-knowledge/modules/game-lobby/userflows.md`) describing "browse and join a game with a login check". The skill recognizes branching with a decision, confirms it is a user flow (not a task flow), and generates a `flowchart TD` with the login decision and an error path.

**Manual.** "Which visualization should I use to compare us against three competitors?" The skill answers: a competitive analysis feature matrix (a table, because comparison is tabular), and generates the matrix with a consistent feature list and yes/partial/no marks.

**Convert.** "Turn this user journey into a user flow." The skill takes the journey phases, keeps the persona context, and produces a branching `flowchart TD` of the steps with decisions and error states.

## Best practices and constraints

- Always read `research/internal/product-knowledge/ux-research/ux-visualization-guide.md` first and follow it; if guide and request conflict, surface it.
- Pick the shape that renders clearest - tables for matrices, Mermaid for flows; do not force everything into one form.
- One artifact per goal; if the user needs several, generate them separately.
- Ask exactly one clarifying question only when the artifact choice is genuinely ambiguous; otherwise recommend and proceed.
- Do not invent product facts (personas, features, flows) - use what the user/research provides, and flag gaps.
- Keep it simple: small, correct, renderable diagrams over elaborate ones.
