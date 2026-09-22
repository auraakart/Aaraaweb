# Aaraagate V4.41 — Repository Simplification & Maintainability Closure

## Goal

Consolidate the healthy V4.40 baseline without expanding product scope: reduce remaining UI coupling, continue typed mobile boundaries, make post-main validation directly observable, and preserve evidence-driven branch hygiene.

## Slices

1. **Residual branch hygiene** — keep the existing ancestry/exact-merged-head classifier authoritative; automatically clean only branches proven safe after develop merges, while preserving divergent recovery/history branches for review.
2. **Admin decomposition continuation** — extract the Operations overview and reusable console primitives from `admin-console.tsx` so the shell owns less presentation/domain code.
3. **Resident typed-boundary continuation** — replace the Resident SOS raw-map boundary with `ResidentSosIncident` across repository and screen layers.
4. **Post-main evidence** — add a push-to-main health workflow that records the promoted SHA, canonical branch heads and source-equivalence checks against develop/staging.
5. **Baseline reconciliation** — update the current capability index to V4.41 and describe the new maintainability controls.
6. **Regression closure** — run the normal API/Admin/Flutter/security suites plus the V4.41 contract before develop promotion.

## Non-goals

- No new product features.
- No production hosting or provider credential changes.
- No physical hardware integration.
- No forced deletion of divergent branches.
- No weakening of RBAC, tenant isolation, privacy, audit, payment or release controls.

## Acceptance criteria

- Admin overview and console primitives live outside the main console shell.
- Resident SOS UI consumes a typed incident model.
- V4.41 regression contract prevents reversal of those boundaries.
- Main pushes produce explicit post-promotion repository-health evidence.
- Current capability documentation identifies V4.41 as the active repository baseline.
- Existing full validation suites remain green.
