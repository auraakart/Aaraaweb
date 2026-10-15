# Aaraagate V4.89.14 — Secure Society Copilot release candidate

## Scope: non-production capability improvements

This single release candidate consolidates V4.89.1–V4.89.14, with recent fixes and reviews:

- V4.89.1–V4.89.8: owner/tenant/current-occupant access boundaries, source-backed society FAQs and notices, approved family-member lookup, read-only personal gate/helpdesk/dues/vehicle/parcel summaries, on-demand current-home briefing and privacy-minimal private query projections.
- V4.89.9 — [PR #1157](https://github.com/auraakart/Aaraaweb/pull/1157): demo fixtures reflect current Assistant capabilities. Synthetic household isolation and masked vehicle/parcel answers; no invented society rules.
- V4.89.10 — [PR #1158](https://github.com/auraakart/Aaraaweb/pull/1158): common society-policy questions route to **published audience-filtered source documents**, with an explicit no-evidence fallback.
- V4.89.11 — [PR #1159](https://github.com/auraakart/Aaraaweb/pull/1159): allowlisted context-screen navigation, subject to ordinary entitlements, not untrusted model-generated URLs.
- V4.89.12 — [PR #1161](https://github.com/auraakart/Aaraaweb/pull/1161): narrow society-policy follow-ups; no reuse of private household facts or past-property context.
- V4.89.13 — [PR #1160](https://github.com/auraakart/Aaraaweb/pull/1160): adversarial tenant/nonresident-owner, recipient, family-finance, cross-household and prompt-injection regressions.
- V4.89.14 — [PR #1162](https://github.com/auraakart/Aaraaweb/pull/1162): explicit opt-in daily briefing shortcut and session-only answer feedback; consent stored locally with authenticated session/society/unit scope. No background notification or automatic upload of prompt/answer text.
- Merge-controller remediation in #1158: never use GitHub Actions token to update a PR head and silently suppress its `pull_request` checks. Require independently authored synchronization and new exact-head green validation.

## Identity and gate boundaries

Root/API/Admin: `4.89.14`; Resident/Guard: `4.89.14+48914`. This is a **develop release candidate**, not a main-branch release or a published APK.

Mandatory before staging: green final exact-head required CI including Resident, Guard, API/Admin, security, tenant authorization, release/complexity contracts; evidence that the final tree matches develop. Promote only one consolidated candidate to staging and run staging API + PostgreSQL backup/restore smoke.

Mandatory before main: successful staging validation, release-readiness/security/policy/CodeQL and cross-role evidence, an independent GitHub review and **explicit owner approval for main**. Never reuse older V4.88.5/V4.88.6 APK evidence for V4.89.14. Publish a Resident Demo APK only after the merged main commit succeeds in the Android workflow and the release asset has been version-verified.

## Non-production limitations not claimed complete

- Society FAQ coverage depends on curated published rules and approved audience classification; arbitrary questions without evidence remain unsupported.
- Natural free-form, unlimited multi-turn generative chat and multilingual physical-device acceptance are not certified.
- Personal financial history remains caller/payee restricted; gate/staff/visitor reads require active occupancy; owners do not inherit a tenant's private activity; no other household's data may be retrieved.
- Contextual source navigation is allowlisted to implemented Resident screens; a full SocietyDocument deep-link viewer is not yet claimed.
- A daily briefing is a current on-demand snapshot; local opt-in displays a shortcut only, not push/background notifications.
- Real payment providers, hardware and infrastructure productionization are excluded from this capability score. Physical UAT and real external integration acceptance remain future evidence.

Review each existing integration's protections; do not weaken server-side authorizations to increase Assistant answer coverage.
