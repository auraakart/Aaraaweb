# Aaraagate V2 Payables & Budgets Foundation

## Purpose

This slice extends the V2 double-entry finance model from receivables into society operating expenditure and budget control. It remains web/admin-first and does not change Resident payment UX.

## Core rules

1. **Ledger remains the accounting truth.** Expense and payable records are operational sub-ledgers; posted financial truth remains in `JournalEntry` / `JournalLine`.
2. **All monetary values are integer paise, INR only** in this phase.
3. **Society isolation is enforced at the database layer** for expense accounts, funds, journals, payables and budget lines.
4. **Approved/posted expense economics are immutable.** Corrections use reversal/adjustment patterns rather than rewriting history.
5. **Approved budgets are snapshots.** They may move once from `APPROVED` to `LOCKED`; budget revisions are represented as new plans rather than edits.
6. **Budget lines are fund-aware.** A plan can budget an account globally or against a specific accounting fund.
7. **Vendor procurement remains a separate bounded context.** Until the society-vendor module lands, expenses store a vendor/payee name and invoice reference without coupling to marketplace service providers.
8. **Payables are not payment-gateway transactions.** A payable represents a society liability arising from an approved expense. Settlement will later generate accounting entries and an append-only payment history.
9. **No mutable derived totals.** Budget-vs-actual, outstanding payable and fund utilization are calculated from source records and journal history.
10. **Finance permissions remain segregated.** `FINANCE_READ` exposes reports and sub-ledgers; `FINANCE_MANAGE` controls creation, approval, posting and settlement actions.

## Domain model

### SocietyExpense
Operational record for a supplier bill / society expense.

Key fields:
- society and expense number
- vendor/payee name
- invoice reference
- expense and due dates
- description and amount
- expense account and optional fund
- lifecycle `DRAFT -> APPROVED -> POSTED` (with controlled `VOID` handling)
- optional link to the final posted accounting journal
- creator / approver audit fields

### SocietyPayable
Liability record created from an approved expense.

Key fields:
- expense link
- payable/liability account
- original amount
- due date
- `OPEN`, `PARTIALLY_PAID`, `PAID`, `VOID`

Payment events will be added as append-only settlement records in the next operational API slice.

### BudgetPlan
A society budget snapshot for a defined date range.

Lifecycle:
- `DRAFT`: editable
- `APPROVED`: economics frozen
- `LOCKED`: final closed snapshot

### BudgetLine
Budgeted amount by ledger account and optional fund. Duplicate account/fund lines inside one plan are prevented.

## Reporting model

The next API/UI slice should expose:

- expense register by period, account, fund and vendor
- payable ageing / upcoming due dates
- budget vs actual by account
- budget vs actual by fund
- fund utilization
- journal drill-through for posted expenses
- CSV export suitable for accountant review and committee circulation
- reconciliation view linking operational records to posted journals

## Posting model

Expense posting should be atomic:

- validate APPROVED expense
- require an OPEN accounting period
- create balanced journal lines
  - debit configured expense account
  - credit configured payable/liability account
- create/activate the payable
- link the journal to the expense
- mark expense `POSTED`

A later payable settlement will debit the payable account and credit the selected bank/cash account.

## Segregation of duties

Recommended initial operating model:

- **Accountant**: create drafts, manage finance operations, post approved items
- **Society Admin**: read finance; no unrestricted accounting mutation
- **Committee Member / Treasurer-equivalent**: approval/read depending configured role policy; the current RBAC baseline remains authoritative until a dedicated Treasurer role is introduced
- **Super Admin**: platform support / exceptional administration

The backend permission guard remains authoritative even when controls are hidden in Admin UI.

## Migration strategy

Existing V1 billing/payment remains operational. This payables/budget foundation is additive and does not replace the resident maintenance-payment path.

## Next implementation slice

1. Expense draft/list/approve/post API
2. Payable list/ageing/settlement API
3. Budget create/edit/approve/lock API
4. Budget-vs-actual and fund-utilization reads
5. Reconciliation/export endpoints
6. Extend `/finance` Admin workspace with Expenses, Payables and Budgets sections
