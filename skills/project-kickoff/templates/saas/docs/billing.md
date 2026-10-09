# Billing

## Model

<!-- kickoff: The money answer from the interview (subscription, usage-based, one-time, free for now). Otherwise an open question. -->

## Plans

<!-- kickoff: "To decide." unless the user named plans or prices. -->

## How it works

- Stripe is the source of truth for subscriptions; the app stores the customer and subscription IDs and mirrors status from webhooks.
- Webhooks are verified with the signing secret and handled idempotently.
- Test mode keys locally and in previews; live keys only in production.
