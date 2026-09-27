# Aaraagate V4.62 — Household Staff Mutation Recovery

Date: 2026-09-27
Status: Development started on `develop`; runtime identity remains V4.61.0 until release closure.

## Objective

Remove stale Resident household-staff actions after destructive mutation failures without widening resident authority or creating a parallel workforce state model.

## Slice 1 — Authoritative destructive-action recovery

Resident leave cancellation and assignment deactivation continue to use the existing workforce mutations. When either request fails, the controller reloads the authoritative workforce state before rethrowing the original failure.

If a leave cancellation committed on the server but the client observed a transport/error response, the refreshed inactive/missing leave removes the stale **Cancel leave** action and Resident reports that the leave is no longer active.

If assignment deactivation committed on the server but the client observed an error, the refreshed inactive/SUSPENDED assignment removes the stale **End assignment** action. Deactivation recovery also refreshes access state so household-staff gate eligibility does not remain stale after an uncertain response.

## Authority boundary

V4.62 does not change household ownership, society verification, assignment states, leave policy, staff ratings, gate eligibility rules or server mutation authorization. Recovery only re-reads existing authoritative workforce/access state after a failed destructive mutation.

## Regression contract

`pnpm check:v4.62` and CI require controller recovery reads, stale-action removal, clear recovered-state messages and focused controller/widget regressions.

## Boundary

This is a V4.62 development slice only. It does not claim V4.62.0 release closure, staging/main promotion, productionization, hosted acceptance, live provider integration, physical-device certification, signed store release or field-pilot/business acceptance.
