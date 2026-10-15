# Aaraagate V4.13 Completion Evidence

Date: 2026-09-18
Status: Repository-only closure evidence

## Baseline and functional closure
- V4.13 baseline: `196b635058c21e9f3f2e3bff24d95985ee677f1f`
- Latest merged functional closure: `104df4aa9205d7bbc31e4aef253fda23b26828b5`
- Main branch remains outside this milestone and is not promoted by this closure.

## Merged slices
| Slice | PR | Merge commit | Repository evidence |
|---|---:|---|---|
| SOS reliability/accessibility | #661 | `faf24b63c58e38f07b58d8b5b2a0fd9f671b43a6` | Active-property SOS isolation, defensive cancellation, safe errors, semantics and large-text/error-leak regressions |
| Resident parcel reliability | #662 | `eed948690c739dedb2397bc5c73ad5ed92f3f4ff` | Selected-unit parcel isolation, stale cross-property fail-closed actions and regression coverage |
| Guard realtime resilience | #663 | `1ff8c22845bf920d9a64516b9a493be05c8fa31f` | Single cancellable reconnect timer, duplicate-schedule prevention, no reconnect after sign-out/dispose |
| Resident safe errors/accessibility | #664 | `104df4aa9205d7bbc31e4aef253fda23b26828b5` | Shared safe error mapper, safer Gate/Poll surfaces, premium Poll states, large-text/error-leak regressions |

## Latest functional validation
Exact feature head `38641e6e86aaa7fbc72f00d4f2891f21cd6d76e7` completed successfully for:
- CI
- Cross-role E2E Journeys
- V2 Security Privacy Review
- V2 Role UAT Contract
- V2 Policy Pilot Contract
- V2 Pilot Acceptance Contract
- V2 Staging Pilot Execution Contract
- V4.11 Pilot Readiness Contract

The Resident Demo APK workflow is packaging evidence and is not used as a source-integration gate for this repository closure.

## Evidence-only score impact
The competitive score moves from 8.96 to 8.99 because the new evidence materially improves:
- Gate/security reliability: 9.2 → 9.3
- Resident experience/reliability: 9.2 → 9.3

Other dimensions are held constant. Production/field readiness remains 8.0.

## External evidence still pending
Repository closure does not replace:
- representative-device accessibility/usability acceptance;
- real low-bandwidth field testing;
- real-society role and policy acceptance;
- hosted staging/production behavior;
- real payment/OTP/push/SMS/WhatsApp or other provider behavior;
- physical access hardware validation;
- customer-outcome evidence.

These remain external pilot/release work and are intentionally excluded from the repository-only milestone.
