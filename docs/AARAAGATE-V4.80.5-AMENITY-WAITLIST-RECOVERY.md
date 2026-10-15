# Aaraagate V4.80.5 — Amenity Waitlist Recovery

Date: 2026-09-30  
Baseline: `develop@fa0127ff8ad861ac75ec5fdeb3ccfee2546c72ab`

## Problem

Amenity booking itself already had retry-safe request identity and authoritative recovery, but the capacity-conflict path that joins the exact-slot waitlist did not.

The backend already prevents more than one active WAITING entry for the same society, amenity, unit, user and time window. If the database commit succeeded but the response was lost, the Resident app could still show an error. A later retry could receive the server's duplicate-window conflict even though the desired waitlist entry already existed.

That created an avoidable uncertain-outcome UX defect, not a duplicate-data defect.

## Fix

After any failed waitlist join, Resident now reloads `/amenities/waitlist/mine` for the active property and accepts recovery only if an authoritative entry is:

- `WAITING`;
- for the same amenity;
- for the same active unit;
- for the exact same start and end instants;
- for the same guest count.

If the exact entry exists, the UI reports the recovered queue position. If not, the original error remains visible.

## Safety boundary

This does not infer success from an error message and does not suppress unrelated conflicts. The database remains authoritative for uniqueness and queue order.

No schema change, no alternate client-side queue, no automatic booking promotion and no production/provider integration is introduced.

## Regression coverage

Resident widget tests cover:
- response loss after a successful waitlist commit;
- a duplicate-window retry response after the authoritative WAITING entry already exists;
- exact authoritative recovery before success is shown.

## Delivery discipline

V4.80.5 is executed as one focused PR on the latest `develop` head. V4.80.4 now serializes develop auto-merge and self-refreshes stale PR bases, so this slice does not require manual stale-base recovery.
