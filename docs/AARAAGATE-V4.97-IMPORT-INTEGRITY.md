# V4.97 — migration import integrity

Authorized by the owner's 17 October instruction to continue remaining nonproduction work. Baseline develop `58c8411cf37923b02e3018e79d744e6a5e1e3c06`. Develop only; root/API/Admin `4.97.0`, Resident/Guard `4.97.0+49700`.

## Demonstrated defects and fixes

1. XLSX projection silently discarded populated cells beyond the header. Sparse header holes bypassed array `map`/`some` validation, duplicate cell references overwrote data, partial cell/shared-string references were accepted, and a supplied `__source_row` header was silently replaced. Reject ambiguous headers/cells/rows, extra columns and reserved provenance before preview. Preserve sparse data values, rich/shared strings, Unicode and physical worksheet row numbers. Cached formulas and error cells require explicit conversion to values rather than treating stale/error output as canonical import data. This is not an Excel calculation engine.
2. The 10 MB upload cap did not bound decompressed content; every ZIP entry was fully buffered without checking declared or actual expansion. Enforce 512 entries, 16 MiB per expanded entry and 32 MiB total, verify directory/local byte ranges and names, reject duplicate entries/encryption, and count actual streamed decompression bytes before buffering beyond the accepted entry size. Require consistent stored/expanded lengths and reject XML entity/DOCTYPE declarations. These limits bound this browser staging parser; they do not authenticate document provenance or certify arbitrary archive safety. Existing 10,000 data-row limit and first-worksheet scope remain.
3. CSV used the filtered row-array index as source provenance, misnumbering records after blank lines and multiline fields. Track each record's physical starting line across CRLF/LF/CR and preserve quoted line endings/escaped quotes. Reject embedded quotes and text after a closing quote rather than silently changing field boundaries. Extra-cell errors now identify the physical source line.

Keep the existing browser-local file parser, preview API and explicit dry-run batch flow. No operational migration is performed by preview, no direct import bypass is added, and API authorization remains authoritative. The existing upload hint explains the values-only spreadsheet requirement and actionable rejection messages allow correction/re-upload.

## Validation ledger

Status: IN_PROGRESS. Ten focused CSV cases run against the production parser, with the regression command included in normal Admin validation. Twenty-seven browser cases upload real stored/deflated ZIP bytes through the actual production stager and exercise valid data, malformed/ambiguous cells, formulas/errors, declared/actual/cumulative expansion and correction/re-upload. CSV browser cases exercise physical provenance and quote rejection through the preview action. Rejections must send no preview or batch request.

Run existing import contracts, all stable invariants and current release checks, followed by protected full API/Admin/Flutter/security milestone CI. Do not repeat local browser/Flutter bootstrap; protected CI supplies browser/runtime evidence. No dependency, API runtime, schema, tenant-inventory or native toolchain source changes.

Independent onboarding/operator, accountant, user/device and representative AI acceptance remain open in the [consolidated backlog](AARAAGATE-V4.93-COMPLETION-FOLLOW-THROUGH.md). These fixtures are automated engineering regressions, not independent field signoff. The [Services commercial decision register](AARAAGATE-SERVICES-4.5-WORKFLOW-COMPLETION.md) and [V5 external TEST/partner blocker #1380](https://github.com/auraakart/Aaraaweb/issues/1380) remain authoritative; do not add another readiness wrapper in place of actual input/evidence. V4.94–V4.96 remain complete.

Record the exact protected head/CI/develop merge after validation. Staging/main, the published demo, productionization and iOS remain unchanged.
