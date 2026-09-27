# Aaraagate V4.64.0 — Visitor Invite Recovery Release Closure

Date: 2026-09-27

## Release identity

- root workspace: `4.64.0`
- API: `4.64.0`
- Admin: `4.64.0`
- Resident: `4.64.0+46400`
- Guard: `4.64.0+46400`

## Closed slice

- Bind Resident visitor invite creation to an exact idempotency request, serialize same-key attempts, recover uncertain responses by rotating a fresh credential on the original active request, and preserve the same client idempotency identity/validity window across retries.

## Authority and security invariants

Raw visitor credentials remain response-only; only credential hashes are persisted. Recovery never creates a second AccessRequest for a same-key replay and never resurrects a cancelled, consumed or expired invite. Different invite payloads cannot reuse the same idempotency key.

Existing resident-unit authorization, feature entitlement, cancellation semantics and Guard credential verification remain authoritative.

## Historical regression compatibility

The V4.63 SOS recovery guard accepts aligned V4.63.0-or-newer runtime identities while retaining its exact SOS evidence checks, so V4.64.0 advances release identity without weakening completed recovery contracts.

## Boundary

This closure is repository evidence on `develop` and does not claim staging/main promotion, productionization, hosted acceptance, physical-device certification, signed store release or field-pilot/business acceptance.
