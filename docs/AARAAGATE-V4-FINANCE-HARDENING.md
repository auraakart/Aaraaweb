# Aaraagate V4.1 Finance Hardening — Opening Balance Cutover

Date: 2026-09-18  
Milestone: V4.1 RWA Finance and Reconciliation Hardening  
Slice: migration-safe opening balances  
Base: `develop` at `6b938f0639a85df92210eda2f083ce8cabe50659`

## Why this slice

The V4 finance audit confirmed that Aaraagate already has a substantial accounting foundation: double-entry journals, receivables and recurring charge rules, late fees, debit/credit/waiver adjustments, unapplied cash and allocations, expenses/payables/budgets, tax metadata, bank statement import and reconciliation, payment reconciliation/exceptions, financial statements, funds, exports and accounting connector delivery.

The highest-value missing foundation for real society migration was a controlled way to establish opening ledger balances without bypassing the journal invariants. Bank accounts already support an opening-balance metadata field, but that value alone is not accounting truth. V4.1 therefore introduces an auditable opening-balance journal workflow that can later be used by the V4.3 migration engine.

## Implemented contract

### API

`GET /api/v1/accounting/opening-balances`
- requires `FINANCE_READ`;
- requires `SOCIETY_ACCOUNTING` entitlement;
- returns posted opening-balance batches for the active society with line count and balanced totals.

`POST /api/v1/accounting/opening-balances`
- requires `FINANCE_MANAGE`;
- requires `SOCIETY_ACCOUNTING` entitlement;
- posts one balanced opening-balance journal into an open accounting period.

### Required input

- stable migration `batchKey`;
- accounting `periodId`;
- unique journal `entryNumber`;
- cutover `entryDate`;
- description and optional source reference;
- two or more journal lines with account, optional unit/fund, and integer-paise debit or credit.

## Invariants

1. Every line is single-sided: positive debit or positive credit, never both and never neither.
2. Total debits must equal total credits exactly.
3. Amounts remain integer paise and safe JavaScript integers before reaching SQL.
4. The accounting period must belong to the active society, be open, and contain the cutover date.
5. Referenced ledger accounts must be active and belong to the active society.
6. Optional unit and accounting-fund references must belong to the active society.
7. The cutover date cannot be on or after an already-posted non-opening operational journal date. This prevents retroactive opening balances from silently changing an operational ledger baseline.
8. A society-scoped PostgreSQL advisory transaction lock serializes opening-balance batches to prevent concurrent duplicate cutover posting.
9. The migration batch key is idempotent. The service stores a SHA-256 content fingerprint with the journal; an exact retry returns the existing posted journal without creating a duplicate. Reusing the key with changed content is rejected.
10. The opening balance is represented by normal `JournalEntry`/`JournalLine` accounting truth with `sourceType = OPENING_BALANCE`; no side ledger or unverifiable metadata balance is introduced.

## Admin workflow

The Finance workspace adds **Opening balances** navigation and a dedicated screen that:
- loads active ledger accounts and open periods;
- captures a stable batch key and source reference;
- supports multiple balanced debit/credit lines with optional unit/fund attribution;
- performs client-side balance checks before confirmation;
- clearly warns that the action creates a posted cutover journal;
- shows previously posted opening-balance batches;
- remains read-only for finance readers without `FINANCE_MANAGE` authority.

## Automated evidence

Added tests cover:
- unbalanced batch rejection;
- dual-sided/zero line rejection;
- prevention of cutover after operational accounting has begun;
- successful balanced posting;
- exact-retry idempotency;
- conflicting reuse of a migration batch key;
- finance permission and accounting-entitlement metadata.

The normal repository CI additionally exercises API lint/typecheck/tests/build, clean PostgreSQL migrations/readiness, Admin typecheck/build/access boundaries and dependency security.

## No schema migration

This slice deliberately reuses existing journal source fields and accounting tables. That reduces migration risk and preserves one accounting source of truth.

## Remaining V4.1 work

Opening-balance cutover closes the major migration-ledger foundation gap but does not by itself complete V4.1. The next finance-hardening slices should audit and strengthen, only where current evidence is insufficient:
- formal adjustment/note numbering and resident-visible evidence if current debit/credit/waiver adjustments are not sufficient for operational use;
- reconciliation mismatch/exception workflows and bank closing-balance evidence;
- finance role segregation and approval controls for high-impact adjustments/waivers;
- resident dues/receipt and Admin finance end-to-end contract evidence;
- final V4.1 score reassessment against the >= 8.6 accounting target.

V4.1 should not reimplement capabilities already proven by V2/V3 code and tests.
