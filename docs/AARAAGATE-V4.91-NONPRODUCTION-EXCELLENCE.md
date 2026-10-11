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
