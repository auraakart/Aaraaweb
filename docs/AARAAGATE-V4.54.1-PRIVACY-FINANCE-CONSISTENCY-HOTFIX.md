# Aaraagate V4.54.1 — Privacy Alignment & Finance Consistency Hotfix

Date: 2026-09-24

## Objective

Close the concrete V4.54 impact-review findings without adding new product scope or parallel domain models.

## 1. Household workforce privacy alignment

The canonical household-workforce rule remains **active occupancy**, not ownership alone. `WorkforceService` now owns the Resident AI workforce-status read path. A verified owner who is not a current occupant cannot use the AI Assistant to see the tenant household's domestic-worker assignment, leave or live check-in evidence. Current occupants retain the existing `WORKFORCE_READ_OWN` permission boundary.

## 2. Canonical unapplied-cash calculation

`PaymentAvailabilityService` is the single read model for captured payment availability:

`captured amount − allocations + allocation reversals − refunds`.

Late-fee reporting and Treasurer Control Centre both consume this same service. The query pre-aggregates allocations, reversals and refunds in CTEs so large payment sets do not use per-payment correlated aggregate subqueries.

## 3. Integration readiness semantics

Integration conformance now reports separate booleans for:
- configuration readiness;
- contract readiness;
- field evidence required;
- production activation approved.

Provider/hardware families requiring external field evidence keep `productionActivationApproved=false` even when repository configuration and adapter-contract checks pass. No field certification is inferred.

## 4. Treasurer scale regression evidence

The existing performance-regression workflow now seeds a synthetic Enterprise finance society with 100,000 captured payments and 100,000 allocations plus bounded reversal/refund evidence, then benchmarks the Treasurer Control Centre endpoint. The threshold is a repository regression gate only, not a production capacity or SLA certification.

## Regression boundary

V4.54.1 does not change existing gate approvals, resident notifications, billing mutations, accounting journal rules, payment gateway execution, privacy case mutation, or provider/hardware integrations.
