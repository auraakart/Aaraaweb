# Aaraagate V4.90.13 — Grounded overnight guest and parking rules

**Base:** `develop` 8b9b980441d609409010219616ef732f6be06273 following V4.90.12.

## Root cause
The established Society Copilot rule-question recognizer covered visitor entry and published parking policies but did not recognize everyday questions like “Can guests park overnight?” or “Is overnight parking allowed for guests?”. The classifier could fall through even when published, audience-authorized community policy documents existed.

## Scope
Add two bounded natural-language patterns to route questions about visitor/guest parking and overnight stays through the **existing** SocietyDocument knowledge tool and its permission/audience filters. Retain private visitor pass/status and personal payment/parking allocation suppression. This is routing only: never generate a policy answer without matching published evidence, never bypass user or society authorization, and never treat classification as permission to mutate gate state. Add positive and private-negative regression tests.

## Acceptance
Exact-head API, unit, security and required CI gates before `develop` merge. Manual multilingual factual evaluation, privacy/red-team prompts, physical voice UX and published society FAQ corpus acceptance remain open. No productionization, staging/main promotion or new 8.5+ score.
