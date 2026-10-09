# Shelf components

Components from the Armaze AI Stack (`aistack list` shows the current set) to
offer for each project type. **Ticked** ones are on the list the user keeps or
trims; **offered** ones are mentioned below the list as "also available" and
added only if the user asks.

Run `aistack list --names` first: if a name below is no longer on the shelf,
drop it silently; if the shelf has something new that clearly fits, offer it
unticked.

| Component | Website | SaaS | Mobile | Why |
| --- | --- | --- | --- | --- |
| `skills/figma-to-code` | ticked | ticked | ticked | Builds Figma frames as components and tokens. |
| `skills/time-tracker` | ticked | ticked | ticked | Measures time from Claude Code sessions. Has its own setup step - list it as a next step. |
| `skills/rooter` | ticked | offered | - | A client-facing entry page at the deployed root. |
| `skills/whats-new-generator` | ticked | ticked | offered | Changelog and "what's new" system. Scaffolds code later - install only. |
| `skills/content-research-writer` | ticked | offered | - | Researched content with citations. |
| `agents/website-weaver` | ticked | offered | - | Splits a website brief into tasks across models. Needs Orca. |
| `skills/ux-visualization-assistant` | offered | ticked | ticked | User flows, journeys, IA, personas. |
| `skills/feedback-intake` | offered | ticked | ticked | Saves feedback under `project-management/feedback/`. |
| `skills/create-competitor-profile` | offered | ticked | offered | Sourced profile of a new competitor. |
| `skills/update-competitor-profile` | offered | ticked | offered | Proposes updates to existing profiles. |
| `skills/changelog-generator` | offered | offered | ticked | Store release notes from commits. |
| `skills/code-to-figma` | offered | offered | offered | Pushes built screens back into Figma. |
| `skills/remove-ai-marks` | offered | offered | offered | Strips AI marks from text and images. |
| `skills/research-workspace` | offered | offered | offered | A documentation workspace. Never ticked: it builds a second docs tree next to the kickoff's. |

Several types picked: a component is ticked if any picked type ticks it.
