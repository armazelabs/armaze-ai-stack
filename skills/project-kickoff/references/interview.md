# Interview

The wording and options for each round. Ask each round in one AskUserQuestion
call, wait for the answers, then move on. A typed "Other" answer may change the
question rather than answer it - read it before going on.

In a tool without clickable questions, ask each round as a short numbered list
of choices and accept the number or free text.

## Round 1 - the basics

| Header | Question | Options |
| --- | --- | --- |
| Type | What are we building? (pick all that apply) | **Website** - marketing site, portfolio, content or docs site. **SaaS** - a web product people sign in to, usually paid. **Mobile app** - iOS and/or Android. Multi-select. |
| Name | What's the project called? | `<folder name>` (Recommended) - use the folder name. **Other** - type a name. |

Then, as one plain line in chat (free text, not a list): "In one line, what is
it and who is it for?" That line is the pitch.

## Round 2 - the stack

Ask only the questions for the types picked. Options and descriptions are in
`stacks.md`.

| Header | When | Question |
| --- | --- | --- |
| Web stack | Website or SaaS picked | Which stack for the web side? (website default recommended) |
| Backend | SaaS picked | Which backend for the SaaS? (no recommended option) |
| Mobile | Mobile picked | Which stack for the mobile app? (no recommended option) |
| App backend | Mobile picked, SaaS not picked | Does the app need a backend (accounts, data in the cloud)? Options: **No backend for now**, then the backend options from `stacks.md`. |

When SaaS and Mobile are both picked, the mobile app uses the SaaS backend -
don't ask twice.

## Round 3 - more detail (optional)

Only when the user chose to add detail. One AskUserQuestion call for the
choices, then one plain line for the features.

| Header | When | Question | Options |
| --- | --- | --- | --- |
| Audience | always | Who is it mainly for? | Consumers / Businesses (B2B) / An internal team / Developers |
| Money | SaaS picked | How will it make money? | Subscription / Usage-based / One-time purchase / Free for now |
| Platforms | Mobile picked | Which platforms first? | iOS and Android (Recommended) / iOS first / Android first |
| Look | always | What should it feel like? | Clean and minimal / Bold and expressive / Editorial / Decide later |

Then, as one plain line: "What are the 3-5 things it must do first?" Those go
into the brief as the first features.

Anything still unknown becomes an "Open questions" item in the brief. Never
fill a gap with a guess presented as a decision.
