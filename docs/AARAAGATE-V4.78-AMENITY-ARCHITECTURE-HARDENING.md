# Aaraagate V4.78 — Amenity Architecture Hardening

Date: 2026-09-29  
Baseline: `develop@56c4e864f807c0c6a902de605b46d40674700a7d`

## Objective

Consolidate the V4.77 amenity fair-use work before another feature cycle. This slice removes a clock-consistency edge case, reduces Admin policy duplication and records the repository evidence needed for the next controlled release convergence.

## Changes

1. **Database-authoritative no-show timing**
   - the no-show count lookback continues to use PostgreSQL `CURRENT_TIMESTAMP`;
   - pause expiry is now calculated in PostgreSQL;
   - the service compares `restrictedUntil` with a database-provided `evaluatedAt`, not Node `Date.now()`;
   - the PostgreSQL trigger and service layer therefore share the same time authority.

2. **Typed Admin policy extraction**
   - `AmenityRules` and no-show draft validation move to `amenity-policy.ts`;
   - bounded validation is shared by both create and edit flows;
   - the three no-show inputs move to `NoShowPolicyFields`, reducing continued growth of the main Amenities page;
   - the server remains authoritative and still validates the policy independently.

3. **Regression protection**
   - the V4.77 policy test proves that service eligibility follows database evaluation time even when the application clock would disagree;
   - the milestone-boundary API suite exposed a stale V4.64.1 visitor-invite replay fixture whose fixed expiry passed historically but became invalid on 2026-09-29; the fixture now derives an active validity window from one captured test clock;
   - `scripts/check-v4.78-amenity-architecture-hardening.mjs` fails if application-clock dependence, duplicated Admin validation or a fixed 2026 visitor-replay validity fixture returns;
   - the check is part of Repository structure CI.

## Boundaries

This slice does not add financial penalties, deposits, booking cancellation, predictive allocation, hardware integration, hosted production work, staging promotion or main promotion.

## Release posture

V4.78 is a repository consolidation milestone. After required merge gates pass on the exact PR head, it may merge to `develop` under the existing automated develop policy. Staging remains a separate exact-tree promotion step and main remains approval-gated.
