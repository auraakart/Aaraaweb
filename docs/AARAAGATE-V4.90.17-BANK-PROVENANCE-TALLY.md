# V4.90.17 — Bank statement provenance, duplicate protection and Tally CSV acceptance

**Source baseline:** `develop` 3eb8a52d460fc8b31698effcf5b849ef596009cd (V4.90.16).

## Reuse existing controls
Per-bank transaction external keys are already unique, imported economics are immutable, preview flags unchanged/changed keys, and accounting export has Tally-friendly CSV mode with SHA-256 artifact digest. These controls were **not** rewritten or replaced.

## Added bounded capabilities
1. `POST /accounting/bank-reconciliation/transactions/import/batch` is guarded by the same tenant, FINANCE_MANAGE and SOCIETY_ACCOUNTING policies as single-row import. Accepts 1–500 normalized rows, bank account UUID and caller-declared sourceSha256 (SHA-256 of uploaded statement bytes calculated by the importing client).
2. A new immutable `BankStatementImportBatch` receipt stores the source digest, separate server-derived SHA-256 of normalized ordered rows, actor/time, new/reused counts and ordered row-to-transaction references. A per-bank/per-society/per-source advisory transaction lock serializes concurrent imports. Same source + same manifest replays to the **original** receipt. Same source + changed manifest or same external key + changed remittance rejects atomically without partial import.
3. `GET /accounting/bank-reconciliation/transactions/import/batches` is FINANCE_READ and tenant-scoped (optional bankAccountId), returns up to 100 receipts for accountant provenance review.
4. Validation forbids duplicate external keys within a batch, fractions and unsafe paise amounts. Existing single-row import gets the same whole-paise service check.

## Boundaries
SourceSha256 is **client-attested**, not independently verified against raw uploaded bytes by this API, because this workflow accepts structured rows and deliberately does not store raw statements. Captured row digest verifies exactly which normalized rows were committed against the claimed source checksum. The API does not claim OCR, signed bank statements, direct bank connectivity, production import or automatic Tally posting.

## Disposable PostgreSQL acceptance
The additional dedicated test file is strictly gated by GITHUB_ACTIONS, AARAAGATE_FINANCE_CONCURRENCY_CI and the local throwaway aaraagate_ci database. It verifies atomic receipts, identical replay, conflicting file digest, conflicting prior remittance rollback, duplicate-in-file rejection, two concurrent same-source imports, cross-society isolation, and an actual posted and balanced double-entry journal exported as TALLY_CSV with equal debit/credit, checksum, dated UTR linkage and formula protection. The existing bank unit tests and V4.90.16 concurrency tests remain active.

**Required:** exact PR-head migrations, API build/typecheck/lint, PostgreSQL acceptance, API risk coverage, full API/Flutter/Admin workflow and merge gates before `develop` merge. Staging/main untouched. Tally application import and finance user signoff still required separately.
