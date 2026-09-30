# Aaraagate V4.80.10 — Community Shortcut Bar

Date: 2026-09-30  
Baseline: `develop@85c32aa8733d066408a2ec9e168af844433330a6`

## Request

Bring Polls and Community events next to the latest community updates instead of requiring residents to discover those features farther down the Community hub.

## Change

The Community hub now exposes a single compact shortcut bar immediately below the page introduction:

- **Updates** — opens the complete society notices/update feed.
- **Polls** — opens advisory community polls.
- **Events** — opens upcoming community events and RSVP.

The bar uses equal-width peer actions with 48px minimum touch targets. The current update context receives the tonal treatment while Polls and Events remain outlined peer actions.

The existing detailed **Latest updates**, **Community events**, and **Polls** sections remain available below, so the change improves discoverability without removing context or behavior.

## Functional boundaries

No API, schema, role, poll-response, event-RSVP, notice acknowledgement or statutory-governance semantics change. Community polls remain advisory/non-statutory and community event RSVP remains non-statutory participation.

## Regression coverage

A Resident widget regression verifies that Updates, Polls and Events render together in the shortcut bar on a 390px mobile viewport and that Polls and Events open their existing destination screens.
