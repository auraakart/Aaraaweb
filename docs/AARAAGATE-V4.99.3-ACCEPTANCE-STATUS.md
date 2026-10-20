# Aaraagate V4.99.3 — acceptance status and remaining work

This is a development and acceptance record. V4.99.3 / mobile build 49903 is prepared as a release candidate; it does not establish a published release, physical-device certification, native-language approval or a measured 9/10 product score. See the [health closure and candidate record](AARAAGATE-V4.99.3-HEALTH-CLOSURE.md).

## Workstream status

| Workstream | Repository implementation | Acceptance still required |
| --- | --- | --- |
| 3.1 Admin mobile navigation | Single-row scrolling, current-page semantics, focus and skip link implemented | Real Admin role-navigation keyboard/screen-reader session |
| 3.2 Admin convergence | Shared operational panels, active-label contrast and compact Facilities/Finance/Governance overflow fixes implemented; seven real route components pass the compact browser matrix | Visual review of generated matrix and live data/role combinations |
| 3.3 Resident task states | Helpdesk voice/submission safety, Billing single-flight preparation, Gate/Home/Helpdesk refresh recovery implemented | Device task observations, network transitions and screen-reader announcements |
| 3.4 Guard work priority | Attention-first layout, read-only uncertain-action recovery, discoverable loaded long queues implemented | Guard walkthrough and physical-device acceptance |
| 3.5 Essential language coverage | Existing eight-language table covers scoped Home, navigation, Helpdesk entry/form, Billing entry, Staff entry and Guard headings/counts/recovery/disclosure | Native-speaker review; deeper financial/operational forms and detailed history remain separate untranslated surfaces |
| 3.6 Final acceptance | Automated compact/large-text/light/dark regression and browser evidence available as described below | Human visual review, TalkBack, physical devices, task completion/time/taps and final evidence-based reassessment |

## Exact automated evidence

Evidence is recorded only after the corresponding protected run passes. Scope-skipped gates are not represented as executed suites. Browser/Flutter fixtures do not establish hosted API or real-device operation.

- Staff entry localization: [PR #1503](https://github.com/auraakart/Aaraaweb/pull/1503), tested head `3ed94d9c3717d5917e9f7b319dcb22eba8459875`, merged develop `3248a5da819ab1a7f67a5bb909dd88feb7332366`. [CI 39470666233](https://github.com/auraakart/Aaraaweb/actions/runs/39470666233): Resident analysis clean; 37 changed tests, 101 risk tests and 578 full Resident tests passed; coverage and required merge gates passed. Admin/API/security full suites were scope-skipped for this Resident-only slice; their wrapper gates passed.
- Compact Admin acceptance and overflow corrections: [PR #1504](https://github.com/auraakart/Aaraaweb/pull/1504), tested head `ab5b5c807bea55aa07e139c8a50b73be22509f70`, merged develop `a12455f7b7ef33568529fdcc6ef1f58069b7f942`. [CI 39472034574](https://github.com/auraakart/Aaraaweb/actions/runs/39472034574): all 207 Admin browser tests passed, including all 28 new compact cases; access-boundary/session-isolation checks, lint, typecheck, build, repository, preflight and required merge gates passed. Flutter/API/dependency full suites were scope-skipped for this Admin-only slice; wrapper gates passed.
- [Admin capture artifact](https://github.com/auraakart/Aaraaweb/actions/runs/39472034574/artifacts/12287113956) contains the 28 compact full-page captures alongside existing browser evidence. Captures have not been manually visually reviewed in this session. Actions artifact retention expires 2026-10-27; the committed scenarios can regenerate the evidence.
- Staff and Admin changes were integrated sequentially only after their own exact-head required gates passed. Initial failures were corrected without suppressing cases, weakening overflow checks, hiding content or bypassing CI.

## Health closure update — 2026-10-21

[PR #1506](https://github.com/auraakart/Aaraaweb/pull/1506) closes the fresh Vite audit failure after full protected application/security validation. [PR #1507](https://github.com/auraakart/Aaraaweb/pull/1507) fixes the payment lookup/conditional allocation reflow and long-title Governance badge. Its [CI 39517689332](https://github.com/auraakart/Aaraaweb/actions/runs/39517689332) passes all 208 browser tests and full Admin gates. Eight focused light/dark normal/200% captures were visually inspected and are readable; the 28 compact full-page captures are regenerated too. Earlier capture-review statements above describe the earlier evidence session, not the current closure review. Detailed source identities and scope qualifications are retained in the health closure record.

## Completion boundary

The scoped Staff entry localization and discovered compact Admin defects are fixed and protected on develop. Engineering visual review found and closed the Finance/Governance issues; live data/role combinations, native-language approval, physical-device/TalkBack/Guard walkthroughs and measured usability remain required below. Deeper financial/operational forms and history are not claimed to be fully translated. V4.99.3 overall acceptance remains **open**; release candidate identity is reconciled, while no 9/10 score or published demo build is claimed.

## Remaining acceptance sequence

Use one tested develop source/build identity throughout. Record commit, APK hash/version where applicable, device/OS, app/theme/language, operator role, test data, pass/fail and evidence location. No release branch or APK publication is authorized by this checklist.

1. Review the compact browser captures for Helpdesk, Privacy, Facilities, Documents, Occupancy, Finance and Governance, in light/dark and normal/200% scale. Check reading order, wrapping, primary action prominence and state clarity. Fail any clipped, overlapping or ambiguous action rather than inferring a pass from screenshots existing.
2. On a real Android device, run Resident Gate approval/denial and refresh failure, Billing preparation/retry/receipt, Helpdesk dictation/draft/error/retry, Staff monthly attendance and Guard uncertain-action recovery. Retain all confirmations and existing server authorization. An uncertain gate/payment action must not be automatically repeated.
3. With TalkBack, verify names, roles, focus order, current destination, loading/error announcements and modal entry/return. Repeat keyboard navigation in authenticated Admin role-filtered destinations. Automated axe/semantics tests are supporting evidence only.
4. Have native reviewers check the eight supported language vocabularies in their actual screens. Record corrections and approval for each language separately. Financial/gate/incident operational wording requires domain-aware review. Missing localized detail/form text cannot be described as full localization.
5. Measure the same core tasks with representative residents, guards and admins: success/failure, assistance, taps and elapsed time. Record starting state, device, language, network and sample size. Never substitute a code-derived tap estimate for observed task time.
6. Reassess experience against the 9/10 target using the recorded findings. Keep any score provisional until the relevant evidence exists; do not infer a competitor ranking from automated pass counts.

## Release boundary

Staging/main promotion, demo APK publication, iOS work, production hosting and real external integrations are separate decisions. Existing monthly attendance still provides the current complete calendar month plus twelve previous months; it is not reimplemented by this cycle.
