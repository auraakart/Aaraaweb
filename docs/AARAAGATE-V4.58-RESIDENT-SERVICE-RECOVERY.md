# Aaraagate V4.58 — Resident Service Recovery

Date: 2026-09-27
Status: Release candidate closed on develop; release identity is 4.58.0.

## Objective

Close a resident self-service gap in Helpdesk without granting residents general ticket-status authority.

## Slice 1 — Resident-owned complaint reopen

A resident can reopen a complaint only when all of the following remain true at mutation time:

- the Helpdesk feature and existing `HELPDESK_MANAGE_OWN` permission are available;
- the ticket belongs to the current society;
- the authenticated user has an active, currently effective `UnitOccupancy` relationship for the ticket unit;
- the ticket is currently `RESOLVED` or `CLOSED`;
- a 3–1000 character reopen reason is supplied.

The ownership predicate is evaluated inside the same transaction that locks and reopens the ticket. A successful reopen returns the ticket to `IN_PROGRESS`, clears resolution/closure markers, preserves the existing history and appends the existing audited `REOPENED` activity with the resident reason.

## Resident experience

Complaint detail shows **Still not fixed?** only for resolved/closed tickets. The resident reviews and enters a reason before selecting **Reopen complaint**. The UI uses the server-returned ticket state and reloads activity; it does not manufacture a reopen locally.

## Authority boundary

This slice does not expose reviewer assignment/status APIs to residents, add a new permission, or widen society/operator mutation roles. Reviewer reopen continues to use `HELPDESK_REVIEW`; resident reopen uses the pre-existing own-ticket permission and current-occupancy scope.

## Slice 2 — Audited service-booking cancellation reason

Resident cancellation remains limited to consumer-owned bookings in `REQUESTED` or `CONFIRMED`, but cancellation now requires a 3–500 character reason. The API validates the input and the service re-validates the normalized reason before taking the existing row lock. The same consumer-owned locked transition writes the reason into the existing `ConsumerServiceBookingEvent.note`, so the resident/provider timeline retains why the request was cancelled without adding a parallel record or new status.

The Resident app collects the reason in a review dialog before calling the existing cancel route. The action is still server-authoritative: the client does not mark a booking cancelled until the server succeeds and the list reloads.

## Slice 3 — Audited provider-reschedule rejection

Provider counter-proposals already let residents accept or reject a suggested service time. V4.58 now requires a 3–500 character resident reason when rejecting. The service re-validates the normalized reason before opening the transaction; the consumer-owned booking and pending proposal are then locked as before. A rejection writes `CUSTOMER_REJECTED_PROVIDER_PROPOSAL` into the existing booking event timeline with the resident reason, while the proposal row remains the authoritative ACCEPTED/REJECTED state.

The Resident app asks for the reason only when declining a proposed time. Acceptance remains a one-step action and keeps the existing availability re-check. No new proposal state, permission or provider mutation path is introduced.

## V4.58 release closure

The Resident service-recovery milestone is closed on `develop` as a 4.58.0 repository release candidate after slices #916–#918. The closure combines resident-owned Helpdesk reopen under current-occupancy scope, audited consumer booking cancellation reasons, and audited provider-reschedule rejection reasons. Each mutation remains server-authoritative, uses the existing ownership/locking boundary, and preserves the existing activity/event history rather than introducing parallel state.

## Regression contract

`pnpm check:v4.58` and CI verify the resident Helpdesk recovery boundary, consumer-owned booking cancellation reason validation, audited provider-reschedule rejection reasons, aligned 4.58.0 runtime identity and release-closure evidence.

## Boundary

V4.58 is closed as a repository release candidate on develop. This does not claim staging/main promotion, productionization, hosted acceptance, external-provider certification or field-pilot acceptance.
