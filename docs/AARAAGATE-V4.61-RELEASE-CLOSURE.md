# Aaraagate V4.61.0 — Amenity Cancellation Recovery Release Closure

Date: 2026-09-27

## Release identity

- root workspace: `4.61.0`
- API: `4.61.0`
- Admin: `4.61.0`
- Resident: `4.61.0+46100`
- Guard: `4.61.0+46100`

## Closed slice

- PR #928 — reload authoritative Resident amenity booking state after failed cancellation, remove stale Cancel actions when the server state changed, and preserve policy-specific cancellation conflicts instead of mislabeling them as slot-capacity conflicts.

## Authority and recovery invariants

V4.61.0 does not widen amenity ownership, alter cancellation cutoff policy, create new booking states, change waitlist promotion, widen operator revocation authority or replace server transition checks. The Resident client only reloads and presents authoritative server state after a failed cancellation.

## Historical regression compatibility

The V4.60 gate-decision recovery guard accepts aligned V4.60.0-or-newer runtime identities, so V4.61.0 preserves the completed gate recovery evidence without weakening its exact feature checks.

## Boundary

This closure is repository evidence on `develop` and does not claim staging/main promotion, productionization, hosted acceptance, live provider/payment/KYC integration, physical-device certification, signed store release or field-pilot/business acceptance.
