# Aaraagate V4.58 — Resident Service Recovery

Date: 2026-09-27
Status: Development started on develop; release identity remains 4.57.0.

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

## Regression contract

`pnpm check:v4.58` and CI verify the resident route permission, in-transaction occupancy predicate, audited REOPENED event, Resident API path and resolved/closed-only recovery UI.

## Boundary

V4.58 is still in development and does not claim a 4.58.0 release, staging/main promotion, productionization, hosted acceptance, external-provider certification or field-pilot acceptance.
