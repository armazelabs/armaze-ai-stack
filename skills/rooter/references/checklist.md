# The selection

The Rooter's contents are the user's decision. Detection is good at **finding**
routes and unreliable at knowing which of them a client should see - so present
the candidates and let the user tick them. Never filter quietly and hope.

## Use `AskUserQuestion`, not typed input

The selection is a **real multi-select**, asked with the `AskUserQuestion` tool
and `multiSelect: true`. The user ticks boxes. They never type numbers, and they
are never asked to parse a list out of prose.

```
AskUserQuestion({
  questions: [{
    header: 'Destinations',
    question: 'Which of these belong in the Rooter?',
    multiSelect: true,
    options: [
      { label: 'Version 1 — Field & Plate',
        description: '/v1/ · a complete version tree under src/versions/v1' },
      { label: 'Version 2 — Register',
        description: '/v2/ · a complete version tree under src/versions/v2' },
      { label: 'Version 3 — Broadside',
        description: '/v3/ · a complete version tree under src/versions/v3' },
      { label: 'Design system',
        description: '/ds/ · sparse — 2 pages. Include only if the client should see it.' },
    ],
  }],
})
```

Two things carry the meaning:

- **`label` is the row** - the destination's name as the client would read it.
- **`description` carries the route and the reason.** This is where a doubtful
  candidate explains itself: *"sparse — 2 pages"*, *"reached from each version's
  own footer"*, *"internal unless it's its own product"*. Keep it factual - a
  fact can be weighed, a verdict ("probably not useful") cannot.

The tool always offers **Other**, which is how the user names something detection
never found - an Expo preview build, a TestFlight link, a separately hosted app.
That covers the "anything I missed?" question without asking it separately.

## The hard limit, and how to live within it

`AskUserQuestion` allows **at most 4 options per question and at most 4
questions**. Plan the selection around that; do not discover it mid-call.

**Order the candidates by confidence first**, then group:

| Candidates | How to ask |
| --- | --- |
| 1-4 | One question |
| 5-8 | Two questions: the confident ones, then the doubtful ones |
| 9-16 | Up to four questions, grouped by kind - versions, then personas, then extras |
| More than 16 | Ask about the top 16. State in the preamble how many were left out and why, and let **Other** bring one back |

Give each question a `header` that names its group - `Versions`, `Personas`,
`Extras` - so a multi-question selection still reads as one decision.

## What never becomes an option

Machine and framework routes - `/api/*`, `/_*`, `404`, sitemaps, feeds, layouts,
catch-alls. They would burn scarce option slots on things no client opens.

Say the count in the message before the question, so nothing is hidden silently:

> Astro · 3 version trees under `src/versions/`. 11 machine routes (`/api/*`,
> `404`, sitemap) aren't listed - say the word if you want any of them.

## Ordering within a question

Confident candidates first, doubtful ones last. The user reads top-down, and the
rows most likely to be ticked should not be buried under the ones that need a
reason.

Nested candidates - personas under their parent - go in **their own question**,
asked after the parent's. Do not mix levels inside one option list; a persona and
a root destination are not the same kind of choice.

## Reading the answer

The tool returns the selected labels. Two cases need care:

- **Nothing selected.** Do not proceed on an empty Rooter and do not assume the
  defaults. Say what an empty selection would mean and ask once more.
- **Other.** The user named something. Find its route, confirm it resolves, and
  put it in the tree - if it does not resolve, say so rather than adding a link
  to nothing.

## It is asked every run

There is no skip. First run or tenth, specific instruction or vague, the
selection is asked - it is the one mechanism, and that is what makes the skill
predictable to use.

A named destination does not replace the question, it **arrives pre-selected in
it**. *"Add V3"* asks the same question with V3 already ticked alongside
everything in the Rooter today, so the user confirms the whole result rather
than a fragment.

The only run without a question is one with nothing to ask about: zero candidates
found. Say so plainly and stop.

## When a Rooter already exists

Pre-select to the **current config**, so the user is ticking against what is live
today. Put every difference from the deployed Rooter in the `description`:

```
{ label: 'Version 3 — Broadside',
  description: '/v3/ · new — found in the repo, not yet in the Rooter' }

{ label: 'Design system',
  description: '/ds/ · in the Rooter today, but this route 404s now' }
```

That second one matters: a Rooter row pointing at a dead route is worse than a
missing row, and this question is where it surfaces.
