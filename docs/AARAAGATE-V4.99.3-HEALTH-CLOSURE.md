# Aaraagate V4.99.3 — release candidate and health closure

Status: **release candidate preparation; acceptance remains open**. Root/API/Admin identify as `4.99.3`; Resident/Guard identify as `4.99.3+49903`. This assigns source/build identity without claiming a published APK, production deployment or completed device/native-language acceptance.

## Changes since V4.99.2

- Admin mobile navigation retains a single scrolling row, current-page semantics, keyboard focus and the workspace skip link. Operational panels retain the existing teal brand and light/dark semantic colors.
- Resident Gate, Home and Helpdesk retain useful loaded state after refresh failures; Helpdesk protects dictation/drafts and Billing serializes payment preparation. Guard prioritizes attention and provides read-only recovery for uncertain actions, with discoverable long queues.
- Essential Home/navigation/Helpdesk/Billing/Staff/Guard labels use the existing eight-language tables. Detailed operational forms/history and native-speaker approval remain separate acceptance work.
- Finance lookup and allocation forms now reflow at compact widths; Governance meeting badges retain readable width beside long titles.
- API test tooling explicitly supplies the compatible patched Vite `7.3.7` peer. No backend business-rule, authorization or database migration changes were introduced by these closure fixes.

## Verified health findings

| Finding | Closure evidence |
| --- | --- |
| H01: Vite dependency security | [PR #1506](https://github.com/auraakart/Aaraaweb/pull/1506), tested head `07aaee4b2c3841789212dfaec53e647935c4b8f4`, merged `effbc8b6154f50f1549276c289faa32034851681`. [CI 39517091191](https://github.com/auraakart/Aaraaweb/actions/runs/39517091191): full audit has zero advisories; API 2,440 passed / 15 intentional skips plus 86 risk cases; PostgreSQL migration/finance gates passed; Resident 578 and Guard 253 full tests, analyzers and coverage passed; Admin 207 browser tests, typecheck/build passed. |
| H02: collapsed payment controls; H03: vertically wrapped status | [PR #1507](https://github.com/auraakart/Aaraaweb/pull/1507), tested head `72247adb0e21d96f8d5518afa470abd96514d70d`, merged `63dc3d66549523057ace682d923b5cf08f32fda3`. [CI 39517689332](https://github.com/auraakart/Aaraaweb/actions/runs/39517689332): full Admin validation and all 208 browser cases passed. API/Flutter/dependency full jobs were scope-skipped for this UI-only slice; their wrapper success is not a second full execution. |
| H04: release identity | Five application/root manifests aligned at V4.99.3 / build 49903 in this release-preparation slice. Its exact PR head must pass protected CI before staging candidate creation. |
| H05: maintenance headroom | Existing complexity budgets remain authoritative. No unrelated hotspot growth or middleware migration is included. |

The refreshed [Admin evidence artifact](https://github.com/auraakart/Aaraaweb/actions/runs/39517689332/artifacts/12309905658) contains all 28 compact full-page captures and eight focused Finance/Governance captures. Archive SHA-256: `d93f1766684ef2f0c44e34e6a6e120428794c7f25c32cb1e2bb67314b515cc78`. The eight affected-control captures were visually inspected in both themes at normal/200% scale: lookup/action and allocation controls are readable; the long-title queue badge remains on one line. This is engineering visual review, not independent usability or screen-reader acceptance. Actions retention expires 2026-10-27; committed tests regenerate the evidence.

Fresh local Node 22.22.2/pnpm 10.15.0 frozen installation, zero-advisory audit, 44 stable invariants, all Admin regression groups, UI lint, typecheck and production build passed. Local Chromium/headless archives were invalid, so browser execution evidence comes from protected CI. The audit's local database/Flutter/Linux-observer limitations are not reclassified as local passes.

## Candidate identity and promotion

Use the existing exact-tree staging process after this slice passes. The candidate must use the final develop tree with current staging/develop/main ancestry, and pass both exact-candidate Staging API smoke and PostgreSQL backup/restore before a staging merge. Previous-release smoke does not satisfy this requirement.

The packaging workflows derive semantic version/build code from the manifests and record exact source commit, artifact integrity and SHA-256 when a build is actually produced. No new APK hash is assigned here because no APK has been built or published by this closure slice. Do not reuse a previous build's hash for this version.

## Remaining acceptance and main hold

The [acceptance record](AARAAGATE-V4.99.3-ACCEPTANCE-STATUS.md) remains open for physical Android/Guard walkthroughs, TalkBack and authenticated Admin keyboard/screen-reader observations, native review of each language and measured task success/taps/time. No such result is inferred from fixture, widget or browser test counts.

Main requires the exact validated staging tree, all required release checks and independent approval by someone other than the last pusher. Do not merge main while these acceptance/review gates remain unresolved. [V5 independent TEST/device acceptance #1380](https://github.com/auraakart/Aaraaweb/issues/1380) and [production operationalization #212](https://github.com/auraakart/Aaraaweb/issues/212) remain explicitly open. No quality score or full-localization claim is assigned.
