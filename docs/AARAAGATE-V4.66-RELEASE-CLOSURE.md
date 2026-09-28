# Aaraagate V4.66 — Release Closure

Date: 2026-09-28

## Closed scope

**Slice 1: Helpdesk complaint submission recovery**

- Resident complaint creation carries a request-bound idempotency key that is reused only while the normalized complaint draft is unchanged.
- The API validates current occupancy before replay/create handling and serializes same-key attempts inside the transaction.
- Exact same-key replays return the original complaint without a second Helpdesk CREATED activity.
- Reusing the key for changed unit/title/description/category/priority intent fails closed with conflict.
- AI-confirmed complaint creation derives its stable idempotency identity from the reviewed proposal ID, preventing duplicate complaints after ambiguous confirmation retries.
- Historical HelpdeskTicket rows remain valid because the new persisted idempotency key is nullable while new non-null keys are unique per society/creator.

## Release identity

- root/API/Admin: `4.66.0`
- Resident/Guard: `4.66.0+46600`

## Evidence

`pnpm check:v4.66` verifies schema/migration, controller contract, transactional replay binding, Resident retry identity, AI-confirmed complaint idempotency, regression coverage, release identity and this closure boundary in CI.

## Boundary

Repository release truth is closed on `develop` only. Staging/main promotion, hosted acceptance, live provider/payment/KYC integrations, productionization, physical hardware certification and field acceptance remain separate.
