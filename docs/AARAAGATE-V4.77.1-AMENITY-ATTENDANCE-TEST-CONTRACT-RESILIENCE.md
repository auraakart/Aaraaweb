# Aaraagate V4.77.1 — Amenity Attendance Test-Contract Resilience

Date: 2026-09-28  
Baseline: `develop@a597f4735a2ebef5987881a3021402c740b3ace0`

## Root cause

V4.77 correctly strengthened `markNoShow()` with an amenity-scoped advisory lock so no-show finalization and new amenity eligibility decisions are deterministically ordered.

The API implementation was correct, but legacy V4.12 attendance tests encoded the old internal SQL call count and fixed call indexes. Adding the lock introduced extra SQL calls, causing CI to report a false product regression.

## Permanent fix

The attendance lifecycle tests now aggregate SQL text across all mocked calls and assert observable semantics:

- successful check-in writes attendance evidence;
- early check-in does not execute the check-in update;
- successful no-show acquires the amenity advisory lock and executes the no-show transition;
- pre-grace no-show acquires the lock but does not execute the no-show transition.

They no longer depend on:
- `toHaveBeenCalledTimes(...)`;
- `mock.calls[n]` query positions.

## Regression guard

`scripts/check-v4.77.1-amenity-test-contract-resilience.mjs` is wired into Repository structure CI. It fails if exact SQL call-count or indexed-call assertions are reintroduced into the attendance lifecycle spec.

This allows future lock/evidence-query hardening to add internal reads safely as long as the user-visible attendance behavior remains unchanged.

## Scope boundary

This is test-contract hardening only. It does not change amenity policy, resident eligibility, no-show consequence rules, accounting, productionization, staging or main.
