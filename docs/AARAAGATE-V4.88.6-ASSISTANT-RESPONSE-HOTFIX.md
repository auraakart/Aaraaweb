# Aaraagate V4.88.6 — Resident Assistant Response Correctness

This patch release packages the fix from [PR #1144](https://github.com/auraakart/Aaraaweb/pull/1144) after successful required CI, without other application changes.

## Reported defect and root cause

V4.88.5 Resident demo answered the request `give my family member list` with an unrelated canned gate/billing/helpdesk overview. In demo mode, `AiAssistantScreen._demoAnswer` had an unconditional default summary that did not reflect the resident's question.

## Delivered change

- Explicitly reject out-of-scope requests with helpful supported-topic guidance; return no fabricated facts or source labels.
- Distinguish Aaraagate topics not answerable via the Assistant from unrelated questions.
- Direct family member list questions to the existing **Profile → Family members** screen. This avoids pretending the assistant can retrieve private household membership when it cannot.
- Keep supported dues, visitor, workforce, amenities, complaint and society notice summaries working.
- Apply equivalent unsupported/family-member handling in the permission-scoped live API.
- Add Resident widget and API regression tests for off-topic questions, family list requests, society updates and app topics without assistant tools.

## Release and evidence

Development fix: PR #1144; CI run [37888652921](https://github.com/auraakart/Aaraaweb/actions/runs/37888652921) passed required API/Flutter validation and security gates.

Release identity: root/API/Admin `4.88.6`; Resident/Guard `4.88.6+48806`.

Promote via exact-tree staging candidate, green staging API and PostgreSQL backup/restore smoke, and independently reviewed main release PR. Demo APK must be built from merged V4.88.6 main commit and the GitHub Release asset must be verified before sharing the download URL. This hotfix does not certify productionization or physical-device tests.
