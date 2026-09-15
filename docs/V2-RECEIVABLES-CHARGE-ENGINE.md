# Aaraagate V2 Receivables & Charge Engine

Status: implementation slice

## Purpose
This domain turns society charge policy into auditable unit receivables while keeping resident payment-gateway state separate from accounting truth.

## Core entities
- `ChargeRule`: society-scoped recurring/one-time charge policy with ledger mappings, fund mapping and late-fee policy.
- `Receivable`: immutable issued economic obligation for one society unit.
- `ReceivableAdjustment`: append-only debit/credit/waiver correction.
- `ReceivableAllocation`: append-only application of payment value to a receivable.

## Accounting boundaries
- A charge rule maps to a receivable ledger account and income ledger account.
- Issuing a receivable will create/link a balanced journal entry in the API slice that follows this schema foundation.
- Payments remain gateway transaction records; allocations connect captured money to receivables.
- Gateway callbacks must never rewrite an issued charge or posted journal.
- Receivable balances are derived from original amount + debit adjustments - credit/waiver adjustments - allocations. No mutable `outstandingBalance` column is stored.

## Historical integrity
- Issued receivable economics are immutable: unit, amount, billing period, due date, source and journal linkage cannot be edited.
- Corrections use append-only adjustments or an explicit void workflow.
- Adjustments and allocations cannot be updated or deleted.
- Source keys and allocation idempotency keys prevent duplicate generation/reconciliation.

## Tenant isolation
- Charge rules use composite society/account/fund foreign keys.
- Receivables use composite `(unitId, societyId)` and `(journalEntryId, societyId)` references.
- Payment allocations use composite `(paymentId, societyId)` references.
- API queries must additionally scope every operation by current tenant.

## Late-fee policy
The schema supports:
- no late fee;
- fixed late fee;
- percentage expressed in basis points;
- configurable grace days.

Application of a late fee will be a separate append-only receivable adjustment and accounting journal event. It will not mutate the original charge amount.

## Initial frequency support
- one-time;
- monthly;
- quarterly;
- annual.

The first implementation intentionally uses fixed-amount rules. Per-area/share/formula charging will be added only after the policy model and resident/unit master data needed to calculate it are explicitly defined and tested.

## Planned API slice
1. Charge-rule create/list/activate/deactivate.
2. Preview generation for a billing period before committing charges.
3. Idempotent issue-to-unit / issue-to-society operations.
4. Atomic journal + receivable creation.
5. Unit receivable statement and ageing views.
6. Debit/credit/waiver adjustments with approval policy where required.
7. Payment allocation and unapplied-credit handling.
8. Late-fee batch calculation with preview and idempotency.

## Safety rules
- no cross-society account, fund, unit, journal or payment references;
- no destructive financial-history mutation;
- no charge generation without an active/effective rule;
- no duplicate source generation for the same idempotent source;
- payment allocation cannot exceed available captured value or receivable balance once allocation service is enabled;
- void/waiver privileges require `FINANCE_MANAGE` and audit evidence;
- resident-facing balance remains derived from authoritative receivable/adjustment/allocation data.

## Migration strategy from V1 billing
Existing `MaintenanceInvoice` and `Payment` remain operational during V2 transition. V2 receivables will first run alongside them. A later adapter will issue equivalent V2 receivable/accounting events for new maintenance charges before any V1 read path is retired.
