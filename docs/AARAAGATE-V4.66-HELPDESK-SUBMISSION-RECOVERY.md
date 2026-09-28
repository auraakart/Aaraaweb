# Aaraagate V4.66 — Helpdesk Submission Recovery

Date: 2026-09-28
Status: Development started on develop; release identity remains 4.65.0.

## Slice 1 — Complaint creation idempotency

Resident complaint creation is now safe to retry after an ambiguous transport outcome.

- The Resident client creates one submission key for a normalized complaint draft and reuses it while that draft is unchanged.
- Editing title, description, category or priority creates a new submission identity.
- The API requires the key for new Resident complaint creation.
- The server validates current occupancy before replay/create handling.
- Same-key requests are serialized inside the transaction.
- A same-key replay returns the original complaint only when unit, normalized title, description, category and priority match exactly.
- A same-key request with changed intent fails closed with conflict.
- Only the first successful creation writes the Helpdesk CREATED activity.
- AI-confirmed complaint creation derives its stable idempotency identity from the already-reviewed AI proposal ID, so a retry of the same confirmed proposal cannot create a second complaint.

Historical HelpdeskTicket rows remain valid because the persisted idempotency column is nullable; the unique constraint applies to non-null new request identities without rewriting historical records.

## Boundary

This slice does not widen Helpdesk permissions, change complaint states, alter reviewer authority or claim V4.66 release closure. Staging/main promotion and production/external acceptance remain separate.
