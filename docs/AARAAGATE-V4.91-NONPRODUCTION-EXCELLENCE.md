# V4.91 — Non-production excellence and closure

**Owner instruction:** proceed sequentially through V4.91.1–V4.91.5, excluding productionization, retaining Services 3.1 closure at V4.90.18.10 and the bounded independent read-only V4.90.18.11 Finance handoff.
**Baseline:** develop c9bf41af3a1261307882712e2d66b88a300c84c4.
**Release boundary:** feature branches and green PRs into develop; no staging or main changes without separate authorization. Stop at V4.91.5; no unapproved feature expansion.

## Scoped execution and evidence

| Slice | Deliverable | Acceptance and hard stop |
|---|---|---|
| V4.91.1 | Cross-role regression inventory; English-only Resident Assistant screenshot cleanup | Assistant no language picker; English (`en`) speech only, explicit review before Ask, repeated drafts and 320px/200%-text widget regression; existing API/Guard/Admin/Resident CI checks; document unverified manual flows rather than claiming field UAT |
| V4.91.2 | Finance and security integrity | Negative cross-society/role authorization, owner/tenant payer races, receipt/refund/reversal/reconciliation SQL concurrency evidence; no new Services invoice or payable order |
| V4.91.3 | Premium UX and accessibility closure | Focused Resident/Guard/Admin 320px/200%-text, error/recovery, keyboard, dark/light semantics; device TalkBack explicitly unverified pending real devices |
| V4.91.4 | Permission-grounded AI quality | Stable no-evidence/citation/adversarial matrix, society and owner/occupant isolation, confirmation-required actions; no autonomous privileged mutations |
| V4.91.5 | Technical debt, dependency review and quality closure | Targeted coupling/index/performance measurements, compatibility-gated upgrade PRs, final exact-head full regression and auditable 8.5+ non-production score only if earned |

## Regression inventory (execution must be evidenced per role)

- Resident/current occupant: visitors, household/society workforce, staff attendance, helpdesk, facilities, Services booking/proposal/quote consent/retry, billing.
- Owner not resident and current tenant: visitor approvals to occupant, dues notices to both, either payer permitted, no private payer data leakage.
- Guard/supervisor: gate-session isolation, unknown/repeated response, offline recovery, denied entry, permission-scoped shift reconciliation.
- Society admin/treasurer: receipts, statement provenance, Tally export, refunds/reversals, helpdesk and facilities RBAC.
- Provider: quote approval integrity, immutable non-payable draft, read-only independent Finance handoff with no payment.
- AI/privacy: published policy citations, no evidence fallback, cross-property denial, data access/erasure authorization.

## Screenshot-driven Assistant change

Remove the language dropdown entirely from the Resident Aaraagate Assistant and force microphone recognition to English. The typed query still requires explicit Ask, and no audio triggers a privileged action. **Do not remove shared speech dictionaries or localization**: Helpdesk complaint dictation independently uses device language through `AaraagateStrings.device().languageCode`. Obsolete repository guards requiring the Assistant language list must become English-only assertions.

**V4.91.1 status:** this is an implementation slice, not proof of completed manual E2E, field UAT, signed APK, real Android TalkBack or production readiness. Record exact-head CI/merge evidence separately.

## V4.91.1 merge evidence

English-only Assistant and focused 320px/200%-text, repeat-voice and no-auto-submit widget regressions passed exact-head CI on [PR #1198](https://github.com/auraakart/Aaraaweb/pull/1198) and merged to develop at `7b6afe01efc30564e823074f34c1830bb2638838`. This is not cross-role physical-device UAT.

## V4.91.2 Finance authorization regression follow-on

Scoped PostgreSQL tests extend existing invoice/payment-order authority rather than rewriting or adding a payment engine: departed-tenant same-key retry is denied despite historical payment, owner-only unit receipt and history are hidden from a tenant of another unit, and one owner cannot replay another society's payment key through a mismatched society context. Require the actual migrated PostgreSQL CI gate; a locally skipped test is not acceptance. Other accounting reconciliations/refund matrix and security penetration/device testing remain unverified.

## V4.91.3 — Assistant property/session asynchronous recovery defect

**Identified:** Resident Assistant cleared state on a property/client change but an already-running microphone capture or answer request could still finish later and populate the next session. The request guard compared only `unitId`, not the actual authenticated `apiClient` identity; changing user while retaining the same unit was especially vulnerable to stale answer display.

**Bounded correction:** invalidate all pending voice and query completions on `unitId`, `demoMode`, `apiClient` or `preferenceScope` change; release busy/listening UI; stop speech; capture the original API client before dispatch and drop old-session successes, failures and finalizers. Protect asynchronous preference-write error rollback from overriding a new session. New widget tests exercise late voice and same-unit API-client swaps and confirm a new request remains usable. No server authorization or language features change. Device/role-wide acceptance remains unverified.

## V4.91.4 — Source-validity and no-evidence citation truth

**Identified:** A published-document search with no matches was still exposing `SocietyDocument`/knowledge-table source labels, which could visually imply cited evidence. Title-only or malformed search hits could be quoted as policy despite no actual excerpt. **Correction:** accept only search hits with a nonblank document identity, positive integral version, nonblank title, and substantial excerpt other than the bare title. If no valid evidence exists, return the unchanged no-answer explanation with empty source list and audit status UNSUPPORTED. Keep role-scoped database search authoritative and no autonomous mutation. Extend adversarial suite for blank/placeholder/malformed hits. This is API quality and safety, not multilingual market expansion or a replacement retrieval engine.

## V4.91.1–V4.91.4: exact-head engineering evidence

| Slice | Merged PR | Develop commit | Verified scope and gates |
|---|---|---|---|
| V4.91.1 | [#1198](https://github.com/auraakart/Aaraaweb/pull/1198) | `7b6afe01efc30564e823074f34c1830bb2638838` | Resident Assistant English-only, no selector, repeated voice/320px/200%-text regression; full Flutter, mandatory checks green |
| V4.91.2 | [#1199](https://github.com/auraakart/Aaraaweb/pull/1199) | `b50753af671c9cf14a2c3ce7b16efb8294b13827` | Migrated PostgreSQL departed-tenant, other-unit receipt and cross-society payment regressions; full API, mandatory checks green |
| V4.91.3 | [#1200](https://github.com/auraakart/Aaraaweb/pull/1200) | `0f41b176f0900792e430bacf64404a09ca3c4abc` | Pending speech/API answer context isolation across home/auth switch; full Flutter, mandatory checks green |
| V4.91.4 | [#1201](https://github.com/auraakart/Aaraaweb/pull/1201) | `1778446fa2c0c1094a29b6fa28be5d71b740becc` | No false society-policy citations for blank, title-only or invalid evidence; full API, mandatory checks green |

## V4.91.5: technical debt and truthful evidence closure

See [V4.91 closure evidence](AARAAGATE-V4.91-CLOSURE-EVIDENCE.md) for dependency risk, scoped file measurements, residual unverified manual/device scenarios and explicit stop conditions. The final documentation PR must separately pass exact-head mandatory checks before engineering-scope closure; no staging/main promotion follows automatically.

**Unverified acceptance:** cross-role field UAT, real TalkBack/android devices, admin browser keyboard, financial refund/reversal/Tally matrix, Services provider field journeys, penetration testing and exact-head performance comparisons. Target 8.5+/10 remains an unverified criterion, not an earned re-score.

**Stop at V4.91.5.** Any remaining defect must receive its own reproducible scope and required review. Do not automatically open V4.91.6 or reopen Services 3.1.
