# V4.91.4 — Society Copilot no-evidence citation truth

**Baseline:** develop V4.91.3 0f41b176f0900792e430bacf64404a09ca3c4abc.
**Risk:** Generic database source labels could appear even when a society policy query returned no published, permission-allowed evidence. Malformed/title-only snippets could be represented as actionable policy text.

## Contract
- Continue querying `DocumentsService.searchKnowledgeForUser` under the existing caller identity, society and document audience checks; never bypass authorization.
- Only a hit with document ID, valid version, meaningful title and distinct nonempty excerpt qualifies for an authoritative published quote.
- Missing/invalid evidence returns no invented policy answer, no bogus source labels, zero usable `matches` and an `UNSUPPORTED` audit status. Responses are read-only.
- Preserve source table labels for a valid, permission-scoped published document, and preserve the user's ability to open the full source.

## Acceptance and exclusions
Run existing society question, privacy/adversarial, tenant/no-evidence and negative permission unit tests plus explicit malformed-document matrix. Exact-head API/full CI and merge gates required.

No cross-property data sharing, autonomous actions, new AI model, broader language picker, realtime connectors, or production acceptance. This is a bounded no-evidence truth fix. Further multilingual/business acceptance is not claimed.
