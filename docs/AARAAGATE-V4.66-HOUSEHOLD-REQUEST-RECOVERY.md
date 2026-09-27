# Aaraagate V4.66 — Household Approval-Request Recovery

Date: 2026-09-28
Status: Repository release candidate closed on `develop`.

## Problem corrected

V4.65 correctly moved Resident family mutations behind controller-owned recovery, but add/remove are approval-request operations rather than immediate active-state mutations. A commit-then-transport failure can therefore leave the family member unchanged while a valid society-approval request has already been stored. The same ambiguity existed for vehicle add/remove, and production Family Members/Vehicles screens did not render those stored pending requests.

## Authoritative recovery

Resident now reads `accessPreferences.householdChangeRequests` from the property-scoped household read model and treats only PENDING/PROCESSING requests as recoverable evidence.

- Family add matches normalized phone plus requested gate settings; an already-approved matching active member is also accepted.
- Family remove matches the target occupancy request; an already-approved absence is also accepted.
- Vehicle add matches normalized registration number, vehicle type and optional make/model/colour.
- Vehicle remove matches the target vehicle request; an already-approved absence is also accepted.
- Direct family gate-setting updates continue to verify the active occupancy because that endpoint is not an approval-request mutation.

A missing/mismatched authoritative request never becomes client-side success.

## Production visibility

Family Members and Vehicles now render the same authoritative pending requests used for recovery. PENDING and PROCESSING requests remain visible while Society Admin approval is outstanding.

Vehicle transport is exposed as normal overridable `ResidentRepository` methods and the Vehicles screen delegates mutations to `ResidentDataController`, aligning it with the existing recovery architecture.

## Boundary

Society Admin approval, verified-owner/current-resident authorization, server deduplication and eventual active-state mutation remain authoritative. V4.66 does not auto-approve household changes or broaden parking/household permissions. Staging/main promotion and productionization remain separate.
