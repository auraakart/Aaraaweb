# Aaraagate V4.65 — Resident AutoPay Preference Recovery

Date: 2026-09-28
Status: Slice 2 closed as part of the V4.65.0 release candidate on `develop`.

## Objective

Remove ambiguity after an AutoPay preference request experiences an uncertain transport result. This slice does not activate automatic debit or widen billing authority.

## Recovery contract

Resident preserves the intended enabled state, existing maximum amount and debit-days-before-due values for the request. If the save call fails, the client immediately reloads the authoritative AutoPay preference for the active unit.

Recovered success is accepted only when the refreshed server preference exactly matches all requested preference fields. If it does not match, the latest server preference is rendered and the action remains retryable. If the authoritative read also fails, Resident instructs the user to refresh Billing before retrying.

No client path manufactures an enabled state locally after a failed request. No debit is represented as executed by this preference flow; provider mandate activation remains a separate boundary.

## Regression evidence

- commit-then-transport-failure recovers the enabled preference from the server;
- failure-before-commit restores the unchanged server preference and remains retryable;
- recovery errors remain inline so the authoritative preference stays visible;
- the switch remains serialized while the request/recovery path is active;
- existing property-scoped billing and payment evidence remains unchanged.

## Boundary

This is repository release truth on `develop` only. Staging/main promotion, live payment mandate/provider activation, hosted acceptance, productionization and field acceptance remain separate.
