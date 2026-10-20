# Aaraagate V4.99.3 — acceptance status and remaining work

This is a development and acceptance record. It does not establish a release, physical-device certification, native-language approval or a measured 9/10 product score.

## Workstream status

| Workstream | Repository implementation | Acceptance still required |
| --- | --- | --- |
| 3.1 Admin mobile navigation | Single-row scrolling, current-page semantics, focus and skip link implemented | Real Admin role-navigation keyboard/screen-reader session |
| 3.2 Admin convergence | Shared operational panels and theme/active-label contrast implemented; seven real route components exercised by browser fixtures | Visual review of generated matrix and live data/role combinations |
| 3.3 Resident task states | Helpdesk voice/submission safety, Billing single-flight preparation, Gate/Home/Helpdesk refresh recovery implemented | Device task observations, network transitions and screen-reader announcements |
| 3.4 Guard work priority | Attention-first layout, read-only uncertain-action recovery, discoverable loaded long queues implemented | Guard walkthrough and physical-device acceptance |
| 3.5 Essential language coverage | Existing eight-language table covers scoped Home, navigation, Helpdesk entry/form, Billing entry, Staff entry and Guard headings/counts/recovery/disclosure | Native-speaker review; deeper financial/operational forms and detailed history remain separate untranslated surfaces |
| 3.6 Final acceptance | Automated compact/large-text/light/dark regression and browser evidence available as described below | Human visual review, TalkBack, physical devices, task completion/time/taps and final evidence-based reassessment |

## Exact automated evidence

Evidence is recorded only after the corresponding protected run passes. Scope-skipped gates are not represented as executed suites. Browser/Flutter fixtures do not establish hosted API or real-device operation.

- Staff entry localization: [PR #1503](https://github.com/auraakart/Aaraaweb/pull/1503), tested head `3ed94d9c3717d5917e9f7b319dcb22eba8459875`, merged develop `3248a5da819ab1a7f67a5bb909dd88feb7332366`. [CI 39470666233](https://github.com/auraakart/Aaraaweb/actions/runs/39470666233): Resident analysis clean; 37 changed tests, 101 risk tests and 578 full Resident tests passed; coverage and required merge gates passed. Admin/API/security full suites were scope-skipped for this Resident-only slice; their wrapper gates passed.
- The 28-case compact Admin matrix is submitted with this acceptance record. Its exact run/results must be recorded after protected CI passes; no pass or human visual review is yet asserted.

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
