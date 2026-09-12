# Aaraagate V2 Accounting Foundation

Updated: 2026-09-12

## Purpose
Aaraagate V2 adds a real society accounting subsystem rather than extending maintenance invoices into an informal ledger. Payment gateways, invoice state and accounting history are separate concerns that reconcile with each other through explicit domain events and references.

## Core invariants
1. Society is the accounting tenant boundary. Accounts, funds, periods, journals and journal lines are always society-scoped.
2. All posted journals are double-entry and balanced: total debits must equal total credits and a posting requires at least two lines.
3. Financial history is append-only after posting. Corrections use reversing or adjusting entries; posted rows are not destructively rewritten or deleted.
4. Journals can only be posted into an OPEN accounting period and the journal date must fall inside that period.
5. Closed accounting periods cannot be reopened or materially edited.
6. Payment-provider transactions are not accounting journal entries. Gateway confirmation, reconciliation and bank settlement create or reference accounting postings through explicit services.
7. A fund is an accounting dimension. Fund balances are derived from journal lines; mutable stored balances are avoided.
8. Unit-level receivables use the unit as an accounting dimension/reference while preserving owner/tenant privacy and payer policy.
9. Accountant mutation permission is separate from Society Admin, Committee, Facility Manager, payment reconciliation and reporting permissions.
10. Every privileged financial mutation is auditable with actor, society, source/reference and timestamp.

## Foundation entities
### LedgerAccount
Per-society chart of accounts. Supports ASSET, LIABILITY, EQUITY, INCOME and EXPENSE accounts, optional parent hierarchy, active/inactive lifecycle and stable society-local codes.

### AccountingFund
Society-local fund dimension such as General Fund, Sinking Fund, Repair Fund or another configured purpose. `restricted` indicates policy-controlled use but does not itself authorize a transaction.

### AccountingPeriod
Date-bounded OPEN/CLOSED accounting period. Posting validation occurs against the period under transaction/lock and closed periods are immutable.

### JournalEntry
Header for one economic posting. Starts as DRAFT, transitions to POSTED after balance/period validation and may later transition to REVERSED. Source references support idempotent integration from billing, payments, expenses, procurement and other domains.

### JournalLine
Debit or credit line linked to a society account, with optional fund and unit dimensions. A line must contain exactly one positive debit or positive credit value.

## Database integrity controls in V2.1A
The migration introduces database-level controls in addition to future API validation:
- composite society/account and society/fund foreign-key protection;
- journal creation as DRAFT only;
- balanced journal validation at POSTED transition;
- open-period and in-period-date validation at posting;
- immutability of posted/reversed journal headers;
- immutability of lines belonging to posted/reversed journals;
- immutable closed accounting periods;
- unique society-local account/fund/period/journal identifiers;
- idempotent source-reference uniqueness when a source is supplied.

These controls are intentional defence-in-depth. The API must still return clear business errors and run its own authorization/validation before relying on database exceptions.

## Delivery slices
### V2.1A — Ledger foundation
- chart of accounts
- funds
- accounting periods
- draft/post/reverse journal model
- integrity constraints
- finance permission boundary
- targeted migration/integrity tests

### V2.1B — Receivables and billing integration
- charge definitions/rules
- charge runs
- unit receivables
- invoice-to-receivable mapping
- debit/credit adjustments
- aging and outstanding balances derived from transactions

### V2.1C — Payment allocation and reconciliation
- payment receipt/allocation
- partial payments
- overpayment/credit balance handling
- gateway reconciliation
- bank settlement/reconciliation
- refunds/reversals/chargeback accounting

### V2.1D — Payables, expenses and budgets
- society vendor bills
- expenses/payables
- approval workflow
- budget versus actual
- fund utilization
- supporting document references

### V2.1E — Financial reporting and close
- trial balance
- income/expense statement
- balance sheet
- fund reports
- unit ledger/statement
- collection and aging reports
- period/year close evidence
- export controls with finance-specific authorization

## Integration boundaries
### Existing MaintenanceInvoice / Payment
Existing V1 billing and payment entities remain operational while V2 accounting is introduced. Migration is incremental: V1 flows will receive accounting adapters rather than being rewritten in one high-risk change.

### External Services marketplace
Consumer marketplace service payments remain separate from society accounting unless Aaraagate itself becomes the accounting principal for a society-side transaction. Marketplace commercial tiers/placement do not grant finance authority.

### Society vendors/procurement
Society vendor invoices and procurement workflows are V2 operational accounting inputs and remain distinct from External Services marketplace providers.

## Rollout rule
Do not expose V2 accounting as authoritative financial books until migration validation, Accountant/Committee/Admin authorization tests, reconciliation tests, reporting checks and society-pilot acceptance are complete. The validated V1 billing/payment experience remains the production baseline until that gate is met.
