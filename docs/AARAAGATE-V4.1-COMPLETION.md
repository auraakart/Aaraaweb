# Aaraagate V4.1 Finance Hardening — Completion Evidence

Date: 2026-09-18
Milestone: V4.1 RWA Finance and Reconciliation Hardening
Integration target: `develop`

## Completion summary

V4.1 closes the finance gaps identified by the V4 baseline without rebuilding the mature V2/V3 accounting surface. The milestone now includes recurring charge rules, receivables, arrears/ageing, late fees, debit/credit adjustments, maker-checker waivers, payment allocation/unapplied cash, payment reconciliation/exceptions, bank statement import/matching, explicit bank closing-position evidence, expenses/payables/budgets, fund tracking, tax metadata, financial statements, accounting exports/connectors and migration-safe opening-balance cutover.

## Maker-checker waiver control

Waivers are separated from ordinary debit/credit adjustments. The legacy adjustment endpoint now accepts only `DEBIT` and `CREDIT`. Waivers use `POST /accounting/waivers/requests`, remain a DRAFT journal with no economic effect until reviewed, and require a different finance actor to approve or reject the request. Self-approval is rejected. Approval posts the prepared balanced journal and appends a `ReceivableAdjustment` of type `WAIVER`; rejection preserves the request evidence without posting it. Stable request keys provide retry protection.

Admin Finance exposes a dedicated Waiver approvals workspace for creation and reviewer decisions.

## Bank closing-position evidence

`GET /accounting/bank-reconciliation/accounts/:id/position?asOf=YYYY-MM-DD` returns:
- opening bank balance;
- statement movement through the requested date;
- computed statement closing balance;
- authoritative ledger closing balance for the mapped bank ledger account;
- difference amount;
- unmatched statement count;
- balanced/not-balanced result.

This complements transaction-level amount/direction matching and makes unresolved closing differences explicit rather than implicit.

## Quality evidence added in this completion batch

- maker cannot approve own waiver;
- different finance reviewer can approve and post a waiver;
- reused waiver request key with changed content is rejected;
- bank closing-position difference calculation;
- balanced closing-position calculation;
- Finance read/manage permission metadata and accounting-entitlement checks;
- Admin waiver workflow build/typecheck through normal CI.

Existing automated coverage already verifies balanced journals, payment/webhook duplicate protection, bank reconciliation mismatch rejection, statement import idempotency, receivable allocation, late-fee processing, opening-balance idempotency and migration cutover invariants.

## V4.1 exit assessment

All planned V4.1 capability categories now have implemented repository coverage or an explicit external-provider dependency already isolated behind existing adapters. No production-only credential or real-bank feed is required to continue V4 development.

Analytical accounting/ERP implementation score after V4.1: **8.6/10 target met**, subject to the full V4.9 competitive re-score and real pilot evidence. This is an engineering/product evidence score, not an app-store rating.

V4.2 may therefore start from the green V4.1 `develop` baseline. `staging` and `main` remain untouched.
