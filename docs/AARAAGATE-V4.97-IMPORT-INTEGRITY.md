# V4.97 — migration import integrity

Authorized by the owner's 17 October instruction to continue remaining nonproduction work. Baseline develop `58c8411cf37923b02e3018e79d744e6a5e1e3c06`. Develop only; root/API/Admin `4.97.0`, Resident/Guard `4.97.0+49700`.

## Demonstrated defects and fixes

1. XLSX projection silently discarded populated cells beyond the header. Sparse header holes bypassed array `map`/`some` validation, duplicate cell references overwrote data, partial cell/shared-string references were accepted, and a supplied `__source_row` header was silently replaced. Reject ambiguous headers/cells/rows, extra columns and reserved provenance before preview. Preserve sparse data values, rich/shared strings, Unicode and physical worksheet row numbers. Cached formulas and error cells require explicit conversion to values rather than treating stale/error output as canonical import data. This is not an Excel calculation engine.
2. The 10 MB upload cap did not bound decompressed content; every ZIP entry was fully buffered without checking declared or actual expansion. Enforce 512 entries, 16 MiB per expanded entry and 32 MiB total, verify directory/local byte ranges and names, reject duplicate entries/encryption, and count actual streamed decompression bytes before buffering beyond the accepted entry size. Require consistent stored/expanded lengths and reject XML entity/DOCTYPE declarations. These limits bound this browser staging parser; they do not authenticate document provenance or certify arbitrary archive safety. Existing 10,000 data-row limit and first-worksheet scope remain.
3. CSV used the filtered row-array index as source provenance, misnumbering records after blank lines and multiline fields. Track each record's physical starting line across CRLF/LF/CR and preserve quoted line endings/escaped quotes. Reject embedded quotes and text after a closing quote rather than silently changing field boundaries. Extra-cell errors now identify the physical source line.

Keep the existing browser-local file parser, preview API and explicit dry-run batch flow. No operational migration is performed by preview, no direct import bypass is added, and API authorization remains authoritative. The existing upload hint explains the values-only spreadsheet requirement and actionable rejection messages allow correction/re-upload.

## Validation ledger

Status: MERGED_PROTECTED_CI_PASSED; all three demonstrated import fixes are complete on develop. Independent acceptance remains open.

- Implementation [PR #1425](https://github.com/auraakart/Aaraaweb/pull/1425), validated head `9084817caeef96f31234a3ec2103a42b880d9af8`.
- Develop merge `602b98650585fb466b6cf16c92303357aa0c0131`; tree `60cc6f2a9de8e1b1c72f1220c36b5481b52891a5` matches the reviewed local/uploaded source.
- Protected [CI 39034328641](https://github.com/auraakart/Aaraaweb/actions/runs/39034328641) completed successfully for that exact PR head through `.github/workflows/ci.yml`. Repository structure, preflight, full API/Admin/Flutter, dependency security and Required merge gates passed before normal develop auto-merge. No CI correction or gate bypass was needed.
- All 92 Admin browser/accessibility cases passed, including 27 new real-upload cases: stored/deflated XLSX, sparse data and source rows, shared strings/Unicode, ambiguous/malformed cells, formulas/errors, declared/actual/cumulative expansion, rejected-file replacement and CSV physical provenance/quote rejection. Rejected uploads sent no preview or batch request. Existing context-isolation and explicit dry-run flows remain covered.
- All ten focused production CSV cases passed locally and in normal Admin validation. Existing import contracts, all 44 stable invariants, current release/maintainability/privacy/hygiene checks and `git diff --check` passed locally.
- Admin lint/type/build and actual direct-host SSR/cookie isolation plus local TLS 1.3 lifecycle checks passed. API broad phase: 2,432 passed / 15 intentionally skipped, followed by all 86 risk cases; dedicated database gates passed. Full Resident/Guard analysis, behavioural suites and risk coverage gates passed.
- No dependency, API runtime, schema, tenant-inventory or native toolchain source changes. The original inventory generator remains enforced. Android base smoke was correctly skipped; no new demo, partner artifact or physical-device result is claimed. No local browser/Flutter bootstrap was repeated.

Independent onboarding/operator, accountant, user/device and representative AI acceptance remain open in the [consolidated backlog](AARAAGATE-V4.93-COMPLETION-FOLLOW-THROUGH.md). These fixtures are automated engineering regressions, not independent field signoff. The [Services commercial decision register](AARAAGATE-SERVICES-4.5-WORKFLOW-COMPLETION.md) and [V5 external TEST/partner blocker #1380](https://github.com/auraakart/Aaraaweb/issues/1380) remain authoritative; do not add another readiness wrapper in place of actual input/evidence. V4.94–V4.96 remain complete.

Next actual inputs remain accepted Services commercial decisions, independent onboarding/accountant/user/device/AI acceptance and external V5 TEST/partner evidence in #1380. Fix newly demonstrated authorized defects narrowly. Staging/main, the published V4.91.5 demo, productionization and iOS remain unchanged.
