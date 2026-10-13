# The questions

Every question goes through AskUserQuestion, so the person answers by
clicking. Keep the headers exactly as written here: the engine finds
"Document" and "Catch-up" answers in the transcript by their header, and a
"Don't document" or "Not now" answer is how it knows what was decided.

## Publishing (setup)

- header: `Publishing`
- question: "How should module docs reach the repository?"
- options:
  - **Claude commits and pushes (Recommended)** - "After each entry, Claude
    commits only the docs files under your name and pushes them. Nothing else
    in the checkout is touched."
  - **Leave them for me** - "Claude writes the files and leaves them
    uncommitted. They go in with your next commit."

## Modules (first run)

- header: `Modules`
- question: "These are the modules in your product docs. Document these?"
  (list them, in order, in the question)
- options: **Looks right** / **Change something** (Other: the change)

## Paths (first run)

- header: `Paths`
- question: "This is the code each module covers (table above). Right?"
- options: **Looks right** / **Change something**

## Document (after a finished task)

One question per module the work touched, up to four in one call.

- header: `Document`
- question: "Document this under <Module>? <one-line summary of the work>"
- options:
  - **Yes, under <Module>** - "Writes the history entry and refreshes the
    <Module> page."
  - **Different module** - "File it under another module."
  - **Not now** - "Ask again at the start of the next session."
  - **Don't document** - "Leave this work out of the docs."

## Different module

- header: `Module`
- question: "Which module does <one-line summary> belong to?"
- options: the four likeliest modules (Other: a new module's name)

## New area (once per area)

- header: `New area`
- question: "<area, e.g. app/events/> isn't part of any module. Where does it
  belong?"
- options:
  - **Under <closest module>** - "Its work is documented on that page."
  - **Under <second closest>** - same
  - **Leave it out** - "Work in it is never documented."
  - (Other: the name of a new module for it)

## Catch-up (start of a session, or "update docs")

Up to four items: one question each.

- header: `Catch-up`
- question: "Document <date> <Module>: <title>?"
- options: **Yes, under <Module>** / **Different module** / **Not now** /
  **Don't document**

More than four: one question.

- header: `Catch-up`
- question: "<N> pieces of work from earlier sessions aren't documented yet
  (<modules>). Document them?"
- options: **Yes, all** / **Let me choose** / **Not now** / **Don't document
  any**

"Let me choose" goes through them four at a time.

## Commit both (publish mode commit-and-push)

- header: `Commit both`
- question: "The work itself isn't committed yet (<files>). Commit it with
  its docs?"
- options:
  - **Commit both (Recommended)** - "Two commits, '<work message>' then the
    docs, pushed together."
  - **Hold the docs** - "Write them now; publish once the work is committed."
  - **Docs only** - "Publish the docs now; the work stays uncommitted."
