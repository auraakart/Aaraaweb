# Aaraagate V4.62 — Household Staff Mutation Recovery

Date: 2026-09-27
Status: Release candidate closed on `develop`; release identity is V4.62.0.

## Objective

Remove stale Resident household-staff actions after destructive mutation failures without widening resident authority or creating a parallel workforce state model.

## Slice 1 — Authoritative destructive-action recovery

Resident leave cancellation and assignment deactivation continue to use the existing workforce mutations. When either request fails, the controller reloads the authoritative workforce state before rethrowing the original failure.

If a leave cancellation committed on the server but the client observed a transport/error response, the refreshed inactive/missing leave removes the stale **Cancel leave** action and Resident reports that the leave is no longer active.

If assignment deactivation committed on the server but the client observed an error, the refreshed inactive/SUSPENDED assignment removes the stale **End assignment** action. Deactivation recovery also refreshes access state so household-staff gate eligibility does not remain stale after an uncertain response.

## Slice 2 — Authoritative create/update recovery

Leave creation and household-staff rating updates now use the same uncertain-outcome rule as destructive actions. If the request reports an error, Resident reloads the authoritative workforce read model before deciding whether the operation failed.

For leave creation, the request is treated as recovered success only when the refreshed active leave matches the intended assignment, start date, end date and normalized reason. For rating updates, recovered success requires the refreshed score and normalized comment to match the resident's submitted values. When authoritative state does not match, the original error is rethrown so the existing sheet remains retryable.

This prevents duplicate leave/rating submissions after a server commit followed by a lost response without manufacturing local success state.

## Slice 3 — Household-staff submission recovery

Adding a household-staff assignment now follows the same uncertain-outcome contract. If the submission reports an error, Resident reloads the authoritative workforce read model and accepts recovered success only when an assignment exists for the selected household with the normalized worker name, phone digits and role that the resident submitted.

If no matching assignment exists, the original error is rethrown and the **Submit for review** sheet remains retryable. Newly recovered assignments remain subject to the existing society review and verification lifecycle; this recovery does not make a pending worker gate-eligible.

## Authority boundary

V4.62 does not change household ownership, society verification, assignment states, leave policy, staff ratings, gate eligibility rules or server mutation authorization. Recovery only re-reads existing authoritative workforce/access state after an uncertain workforce mutation and accepts success only when refreshed state proves the intended result.

## Regression contract

`pnpm check:v4.62` and CI require controller recovery reads, stale-action removal, authoritative create/update/submission matching, clear recovered-state messages and focused controller/widget regressions.

## Boundary

V4.62 release closure is repository evidence on `develop`. It does not claim staging/main promotion, productionization, hosted acceptance, live provider integration, physical-device certification, signed store release or field-pilot/business acceptance.
