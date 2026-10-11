# Aaraagate V4.91.5 — Non-production engineering closure evidence

**Inspection baseline:** develop `1778446fa2c0c1094a29b6fa28be5d71b740becc` (V4.91.4 merged).
**Scope:** technical-debt review, dependency compatibility backlog, documentation truth and engineering exit evidence. No productionization, new features, paid Services order, API/schema or UI changes in .5.
**Development rule:** merge to develop only after all required exact-head checks; do not promote staging/main; stop at V4.91.5.

## Completed implementation and test slices

| Slice | PR | Develop merge | Exact-head engineering evidence |
|---|---|---|---|
| V4.91.1 | [#1198](https://github.com/auraakart/Aaraaweb/pull/1198) | `7b6afe01efc30564e823074f34c1830bb2638838` | English-only Resident Assistant, picker removal, repeat voice and 320px/200%-text widget regression; full Flutter and mandatory checks passed |
| V4.91.2 | [#1199](https://github.com/auraakart/Aaraaweb/pull/1199) | `b50753af671c9cf14a2c3ce7b16efb8294b13827` | Departed-tenant retry, cross-unit payer privacy and cross-society key replay on migrated PostgreSQL; full API and mandatory checks passed |
| V4.91.3 | [#1200](https://github.com/auraakart/Aaraaweb/pull/1200) | `0f41b176f0900792e430bacf64404a09ca3c4abc` | Context epoch prevents old property/login speech and answer leakage; full Flutter and mandatory checks passed |
| V4.91.4 | [#1201](https://github.com/auraakart/Aaraaweb/pull/1201) | `1778446fa2c0c1094a29b6fa28be5d71b740becc` | Unusable society document search hits cannot create a false citation or invented policy; full API and mandatory checks passed |

These are implementation-level regressions, **not** signed-off cross-role manual E2E or physical device acceptance. API/Flutter/Admin security wrappers passing when their expensive full suite was path-skipped does not mean an unrelated full suite ran.

## Maintainability risk measurements on inspection baseline

| Module | Lines | Concern and safe treatment |
|---|---|---|
| `services/api/src/services-marketplace/provider-marketplace-completion.service.ts` | 941 | Commercial consent, billing preparation and disputes remain coupled. Plan bounded extraction only after characterization of transaction lock order and role tests |
| `services/api/src/ai-operations/ai-assistant.service.ts` | 579 | Policy and multi-domain routing require negative authorization/no-evidence tests before any refactor |
| `apps/guard/lib/screens/guard_workforce_screen.dart` | 531 | Preserve session/gate async isolation and offline retry semantics during later component splitting |
| `apps/resident/lib/screens/ai_assistant_screen.dart` | 491 | Picker simplification and context-epoch protection done; further extraction needs measured lifecycle/rendering value |

Lengths identify candidates, not demonstrated runtime defects. No quantified improvement in latency, startup, app size, CPU, Flutter jank or database performance was measured.

## Six dependency PRs: compatibility review, not an automatic merge

All six PRs were observed open with `mergeable=false` during 2026-10-11 inspection; the cause of each non-mergeable state was **not independently determined**. Do not combine majors without a compatibility matrix or treat a bot PR as proof of safety.

| PR | Requested upgrade | Required review before an independent green PR |
|---|---|---|
| [#1071](https://github.com/auraakart/Aaraaweb/pull/1071) | React DOM and @types/react-dom | Next/React peer cohort; Admin typecheck, build and interactions |
| [#1072](https://github.com/auraakart/Aaraaweb/pull/1072) | Node types 20→26 | Actual Node runtime and TypeScript/CLI type compatibility |
| [#1073](https://github.com/auraakart/Aaraaweb/pull/1073) | ESLint 10.11→10.12 | Lint config, shared package peers and real lint run |
| [#1074](https://github.com/auraakart/Aaraaweb/pull/1074) | Firebase Admin 13→14 | Server auth/push adapter/SDK behavior and targeted API tests |
| [#1075](https://github.com/auraakart/Aaraaweb/pull/1075) | Flutter share_plus 10→13 | Android/plugin constraints, share functionality and Flutter validation |
| [#1076](https://github.com/auraakart/Aaraaweb/pull/1076) | Next.js 15→16 | Coordinate React version, Admin routing, build, SSR and accessibility |

Do not force merges or bulk-upgrade the lockfiles in this documentation-only scope.

## Unverified acceptance, retained as OPEN

1. **Role E2E:** resident, current tenant, nonresident owner, guard/supervisor, society admin/treasurer and provider cross-role manual scripts with representative anonymized society data, including occupant gate routing, dual dues notification, payer separation and provider quotation/dispute/repeat bookings.
2. **UX:** physical Android 320px/200%-font TalkBack, Guard offline/denied-entry and dark/light tests; Admin browser keyboard and reduced-motion evaluation. Automated widget evidence does not certify devices.
3. **Finance:** broad reversals, refunds, partial settlement and reconciliation race matrix; Tally CSV acceptance against actual ledger examples; bank statement provenance; security audit beyond targeted PostgreSQL tests.
4. **Services:** frozen Services 3.1 V4.90.18.10 resident/provider field usability, response recovery, consent and warranty/continuity tests. The separately authorized .11 Finance handoff remains read-only and non-payable; the exception was retired by [#1197](https://github.com/auraakart/Aaraaweb/pull/1197).
5. **Society Copilot and privacy:** representative factual accuracy, adversarial roles/property scoping, real consent and data erasure operations. Assistant English-only does not imply all apps are English-only.
6. **Performance/reliability:** exact-final-head latency/bundle/device startup/jank, full end-to-end load and crash/recovery measurements; no result is invented.

**Rating decision:** The 8.5+/10 non-production target is a goal, not an evidence-backed score established by repository CI. No new competitor ranking or security certification is claimed.

## Exit and hard stop

- V4.91.1–V4.91.4: merged with verified exact-head required CI.
- V4.91.5: evidence reconciliation and dependency risk review, subject to **this PR's** exact-head required checks and develop merge.
- Product/device/field acceptance: **open** and independently gated.
- No V4.91.6 by default, no Services 3.1 expansion, no invoice/settlement functionality or productionization.
- Staging/main: untouched; main changes require the user's explicit approval.
