# Aaraagate V4.61 — Amenity Cancellation Recovery

Date: 2026-09-27
Status: Development started on `develop`; runtime identity remains V4.60.0 until release closure.

## Objective

Remove stale or misleading Resident amenity-cancellation outcomes without widening booking authority or creating a parallel amenity state model.

## Slice 1 — Authoritative cancellation recovery

After an amenity booking cancellation fails, Resident reloads the current booking list before presenting the final message. If another actor or server transition already moved the booking out of PENDING/CONFIRMED, the UI reports the refreshed status and no longer offers the stale Cancel action.

If the booking remains cancellable, the original server rejection remains authoritative. In particular, a configured cancellation-cutoff conflict is presented as that cutoff decision rather than being incorrectly mapped to a slot-capacity conflict.

## Authority boundary

V4.61 does not change amenity ownership checks, cancellation cutoff rules, booking statuses, waitlist promotion, operator revocation authority or server compare-and-swap behavior. The client only refreshes and presents server state after a failed mutation.

## Regression contract

`pnpm check:v4.61` and CI require authoritative reload after failed cancellation, stale-action removal, conflict-specific 409 messaging and focused Resident widget regressions.

## Boundary

This is a V4.61 development slice only. It does not claim V4.61.0 release closure, staging/main promotion, productionization, hosted acceptance, live provider integration, hardware certification, signed store release or field-pilot/business acceptance.
