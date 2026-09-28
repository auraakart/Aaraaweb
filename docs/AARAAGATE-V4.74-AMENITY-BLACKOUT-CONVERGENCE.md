# Aaraagate V4.74 — Amenity Blackout Convergence

Date: 2026-09-28  
Baseline: `develop@da6ed1fee2d4a003cbadce4926c8d180ce35cb5c`

## Objective

V4.74 closes the remaining usability and waitlist gaps around amenity maintenance/closure windows without creating a second availability model.

**Existing V2 authority retained:** `Amenity.schedule.blackouts` and the database `AmenityBooking_blackout_guard` remain the authoritative blackout truth.

**Productionization remains explicitly excluded.**

## 1. Preview → confirm → apply

Admin/Facility Manager can prepare a `MAINTENANCE`, `CLOSURE` or `PRIVATE_EVENT` blackout with start, end and resident-visible reason.

The preview endpoint is read-only and returns:
- overlapping active bookings;
- overlapping waiting entries;
- `canApply`;
- `mutationPerformed:false`;
- `automaticCancellation:false`.

Admin applies only after the preview is clear and an explicit confirmation. The apply endpoint acquires the amenity advisory lock and repeats the impact assessment before updating `schedule.blackouts`, so stale previews cannot bypass safety.

## 2. No silent lifecycle mutation

A blackout is **not** applied while active bookings or future waiting entries overlap it.

V4.74 does not cancel, reject, revoke or alter those records. Operators/residents must resolve them through their existing explicit lifecycle actions before retrying the blackout.

Removing a blackout also does not auto-promote waitlist entries.

## 3. Waitlist parity

V2 already guards direct booking inserts at the database boundary. V4.74 adds equivalent protection for `AmenityWaitlistEntry` inserts/updates and blocks schedule changes that would silently invalidate future waiting entries.

The service layer also rejects waitlist joins into blackout windows and prevents FIFO promotion into a blackout window.

## 4. Resident visibility

Resident amenity cards read the existing `schedule.blackouts` array and show the next current/upcoming blackout, including type, window and reason. Server/database enforcement remains authoritative if availability changes after screen load.

## Architecture boundary

V4.74 deliberately does **not** add a second blackout source of truth. The earlier attempt to introduce a separate blackout table was discarded before PR because it would have duplicated the V2 schedule authority.

## Verification

Focused tests cover read-only impact preview, fail-closed apply with active reservations, and clear apply after revalidation. The semantic CI contract also asserts retention of the V2 booking trigger and the new V4.74 waitlist DB guards.

## External exclusions

No hosted deployment, physical maintenance verification, field UAT, staging/main promotion or production-readiness increase is claimed.
