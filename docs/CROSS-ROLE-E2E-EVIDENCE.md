# Cross-role End-to-End Regression Evidence

Date: 2026-09-18

## Purpose

Aaraagate now runs a real multi-role business journey against one production-mode API, PostgreSQL database and Redis auth-state service. This complements unit, controller, authorization and Flutter/Admin tests by proving that role boundaries and domain state transitions compose correctly across clients.

## Journey 1 — Resident visitor → Guard gate → Admin report

The workflow seeds three authenticated roles in one society:

- Resident/Owner with an active unit occupancy;
- Security Guard assigned to the target gate;
- Society Admin with reports access.

It then performs these real HTTP operations:

1. Resident creates an approved visitor invite for the owned/occupied unit.
2. Guard verifies the returned credential at the assigned gate.
3. Guard checks the visitor in with an idempotency key.
4. The same check-in request is replayed with the same idempotency key and must return the same committed outcome.
5. Guard checks the visitor out.
6. Resident reads their access history and must observe `CHECKED_OUT`.
7. Society Admin reads the advanced visitor report and must observe the same request with entry and exit timestamps.

The test therefore spans Resident authority, entitlement checks, session validation, tenant isolation, Guard gate assignment, credential verification, idempotent gate mutation, audit/state persistence and Admin reporting.

## Environment boundary

The E2E workflow uses the compiled API in production mode plus clean PostgreSQL and Redis containers. It does not mock business services.

It does **not** claim physical-device UI automation, network/radio behavior, push notification delivery, external payment/OTP providers or real gate hardware. Those remain separate integration/production concerns.

## Failure policy

Any non-2xx HTTP response, unexpected state, idempotency mismatch, tenant/role authorization failure, or missing Admin evidence fails the workflow and blocks the exact candidate.


## V4.34 cross-app contract expansion

V4.34 adds a repository source-contract check before the live HTTP visitor journey. It verifies that six high-value business journeys retain aligned client, API and operator boundaries:

- Gate: Resident invite → Guard verify/check-in → API Access → Admin reporting.
- Payments: Resident payable/payment paths → Billing → Accounting → Admin Finance.
- Occupancy: Resident lifecycle visibility → Residents/occupancy API → Admin occupancy lifecycle.
- Helpdesk: Resident ticket paths → Helpdesk API → Admin Helpdesk.
- Amenities: Resident booking paths → Amenities API → Admin Amenities.
- Parcels: Resident parcel paths → Guard Parcel Desk → Parcels API → Admin Parcel Desk.

This contract is intentionally not described as field E2E for the five non-visitor journeys. The existing visitor journey remains the production-mode HTTP/database/Redis multi-role E2E. The added source contract prevents endpoint/client/operator drift while domain API tests, authorization tests and UI tests continue to validate behavior within each bounded context.
