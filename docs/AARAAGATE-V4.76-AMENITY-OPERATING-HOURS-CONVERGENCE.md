# Aaraagate V4.76 — Amenity Operating-Hours Convergence

Date: 2026-09-28  
Baseline: `develop@4c0cb43b4e710b606761e61b7bd6cdabd0e28d79`

## Objective

V4.76 closes the remaining parity and usability gap around weekly amenity operating hours.

**Existing V2 weekly authority retained:** `Amenity.schedule.weekly` and the database `AmenityBooking_weekly_schedule_guard` remain authoritative for India-local booking hours. V4.76 does not introduce a parallel schedule model.

**Productionization remains explicitly excluded.**

## Waitlist and promotion parity

V2 already protects direct bookings at the database boundary. V4.76 adds the same India-local weekly-window rules to waiting entries through service-level waitlist validation, `AmenityWaitlist_weekly_schedule_guard`, and FIFO promotion suppression when the requested slot is outside current weekly hours.

A second database guard prevents weekly-hour changes while future waiting entries remain unresolved.

## Service-level clarity

Booking and waitlist paths use the same schedule helper before database insertion, producing explicit domain errors for cross-India-local-day requests, closed days and requests outside configured windows. The V2 booking trigger remains defense in depth.

## Preview-before-change Admin control

Admin/Facility Manager can edit the existing weekly schedule through a compact seven-day India-time syntax. Multiple windows per day are supported; `CLOSED` marks a closed day and `UNRESTRICTED` removes weekly limits.

Before mutation, Admin requests a read-only preview. Any future active booking or waiting entry blocks the change. Apply revalidates under the amenity advisory lock. Existing `schedule.blackouts` data is preserved.

## Resident visibility

Resident amenity cards show today's India-local operating hours or `Closed today` when a weekly schedule exists. API/database checks remain authoritative.

## Safety boundaries

No automatic reservation cancellation or rescheduling, no automatic waitlist removal/promotion, no parallel weekly schedule state, and no mutation of blackout windows.

## Verification

Focused tests cover closed-day waitlist rejection, read-only schedule-change preview and stale-preview fail-closed apply. The semantic contract asserts retention of the V2 booking guard plus V4.76 waitlist parity.

## External exclusions

No hosted deployment, physical opening-hour verification, field UAT, staging/main promotion or production-readiness increase is claimed.
