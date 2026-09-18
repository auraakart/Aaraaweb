# Aaraagate V4 Staging Promotion Evidence

Date: 2026-09-18

## Purpose

This file records the governed transition from completed V4 development into staging validation. It exists because the V4 staging ancestry reconciliation produced no product-file diff between `develop` and `staging`, while GitHub requires a reviewable content change to open a promotion pull request.

## Candidate

- Completed V4 development baseline before release-only evidence: `1f21cbaa610a6c5906e24cc7a5e8ca29d5c3d23b`
- Source branch: `develop`
- Target branch: `staging`
- Product scope change: none
- Release-only change: this evidence record
- `main`: unchanged

## Promotion rule

The resulting `develop -> staging` pull request remains subject to the existing exact-SHA staging smoke contract. Staging acceptance must verify the exact promotion candidate and must not be treated as production approval.

## Hosted acceptance boundary

Repository staging smoke does not prove:
- a public hosted staging deployment exists;
- managed backup/PITR is configured;
- monitoring and alert delivery are active;
- production OTP/payment/push credentials work;
- representative Resident/Guard device UAT has passed;
- real ANPR/RFID/boom-barrier hardware is certified.

Those proofs remain required before any `staging -> main` promotion.
