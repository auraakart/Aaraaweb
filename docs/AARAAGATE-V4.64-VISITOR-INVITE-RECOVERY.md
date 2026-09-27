# Aaraagate V4.64.0 — Visitor Invite Recovery

Date: 2026-09-27
Status: Release candidate closed on `develop`; release identity is V4.64.0.

## Objective

Prevent duplicate Resident visitor invitations and unrecoverable QR handoff after an uncertain create response without storing raw credentials or widening access authority.

## Server idempotency and credential recovery

`POST /api/v1/access-requests/visitor-invites` now requires `Idempotency-Key`. The service binds that key to the normalized unit, visitor name, phone, purpose and validity window, and serializes the society/resident/key scope with a PostgreSQL transaction advisory lock.

The first submission creates one APPROVED visitor request with only the credential hash persisted. A same-key replay with the same fingerprint does not create another request; while the original invite remains APPROVED and unexpired, it rotates a fresh credential hash and returns the new raw credential. This preserves recoverability without storing the previous raw QR secret.

Reusing a key for different invite data, or replaying an invite that is cancelled, consumed or expired, is rejected.

## Resident retry contract

Resident keeps one pending invite attempt per current intent. After an uncertain transport failure, retrying the same unit/name/phone/purpose/duration reuses the same idempotency key and exact validity window. Concurrent calls for the same intent share one in-flight operation instead of issuing parallel create requests.

## Boundary

V4.64.0 does not change resident-unit eligibility, VISITOR_MANAGEMENT entitlement, pass validity policy, cancellation authority, Guard verification/check-in/check-out rules or credential hashing. It does not claim staging/main promotion, productionization, hosted acceptance, physical gate certification or field-pilot/business acceptance.
