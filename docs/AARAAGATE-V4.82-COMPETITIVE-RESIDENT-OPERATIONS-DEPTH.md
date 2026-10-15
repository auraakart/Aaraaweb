# Aaraagate V4.82 — Competitive Resident & Operations Depth

Date: 2026-10-06  
Baseline: V4.81.5 on `develop`  
Release identity: root/API/Admin `4.82.0`; Resident/Guard `4.82.0+48200`

## Objective

V4.82 converts the latest Indian competitor review into a focused repository cycle without copying competitor architecture or creating duplicate sources of truth. The cycle deepens seven product areas and closes them under one cross-module validation contract.

## 1. Household Staff Attendance Register

Resident Household Staff now exposes a 30-day attendance register derived from the existing Guard check-in/check-out source of truth.

Implemented:
- first entry, last exit, visit count and minutes inside per day;
- 30-day present-day and visit summaries;
- recorded leave visibility;
- a monthly calendar view;
- explicit scheduled-day/no-gate-evidence state.

Truth boundary:
- **P** means authoritative gate presence exists;
- **L** means an active recorded leave overlaps the date;
- **E** means the assignment schedule expected the day but no gate evidence exists;
- missing gate evidence is never silently labelled **Absent**.

No parallel attendance ledger is introduced.

## 2. Household Staff Payment / Advance Records

Residents can keep private household records for salary, advance, bonus, reimbursement and adjustment entries.

Controls:
- assignment remains household/current-occupancy scoped;
- positive bounded amounts and date/month validation;
- request idempotency with same-intent replay protection;
- database checks for supported record types and month format;
- history remains separate from society accounting.

Boundary:
Aaraagate records what the resident says was paid. It does **not** execute, verify or reconcile a bank/cash transfer and does not create a payroll/accounting liability.

## 3. Resident Requests & Certificates

NOC, no-dues certificate, address-proof letter, move-out letter and parking-permission requests reuse the existing Helpdesk source of truth.

This provides:
- one resident submission surface;
- existing tenant/property authorization;
- existing Helpdesk status, SLA, history and review controls;
- no duplicate certificate-approval engine.

Boundary:
Submission/status does not make a certificate legally valid. Society review and issuance remain authoritative.

## 4. Finance Convenience & Bulk Operations

The Admin Finance workspace adds a safe bulk receivable workbench:
- select overdue receivables;
- multi-select/clear;
- CSV export of selected receivables.

The workbench is deliberately review/export only. Posting, allocations, waivers, reconciliation, late fees and payment/accounting mutations remain in their existing controlled workflows.

## 5. Utility Consumption Visibility

V4.82 extends the existing Utilities domain rather than building a new meter subsystem.

Resident Billing now shows:
- recent meter readings;
- consumption since the prior valid reading;
- meter/unit/type context;
- reset/replacement boundaries as non-consumption evidence;
- existing issued utility charges alongside the new history.

The API reuses current owner/current-occupant scope and limits usage history to recent evidence.

## 6. Permission-aware Aaraa AI Expansion

Two new property-scoped read-only AI tools are introduced:
- **Resident Utilities** — grounded meter/charge evidence;
- **Resident Requests** — grounded certificate/permission-request status.

Household-staff AI evidence is also enriched with 30-day attendance and private payment-record summaries.

AI boundaries remain unchanged:
- no permission bypass;
- no hidden database access;
- no autonomous utility or finance mutations;
- no invented certificate validity;
- no missing-attendance → absence inference;
- normal domain workflows remain authoritative.

## 7. Opt-in Community Circles

Society-managed Community Circles add controlled interest-group depth.

Resident behavior:
- current resident/verified-owner eligibility;
- explicit join and leave;
- posts visible only after joining;
- closed circles become read-only;
- resident post responses expose message content plus `mine`, not a member directory.

Admin behavior:
- NOTICE_MANAGE roles create, close and reopen circles;
- aggregate member/post counts are visible;
- the existing NOTICES entitlement is reused.

Trust boundary:
Community Circles are not statutory voting, emergency communication, official society notices, direct messaging, a resident directory or a commercial/promotional feed.

## 8. Cross-module closure

V4.82 adds:
- focused Community Circle authorization tests;
- `scripts/check-v4.82-competitive-resident-operations.mjs`;
- protected CI execution of the V4.82 invariant;
- release-identity alignment;
- forward-compatible V4.81.5 release invariant;
- updated capability index.

## Source-of-truth reuse

V4.82 intentionally reuses:
- AccessRequest / Guard gate evidence for staff attendance;
- WorkforceAssignment / WorkforceLeave for household staff;
- HelpdeskTicket for resident requests;
- existing Accounting/Receivables for finance;
- UtilityMeter / UtilityReading / UtilityChargeDraft for utilities;
- existing AI authorization/audit policy;
- NOTICES entitlement and governance module for Community Circles.

It does not add a second attendance ledger, certificate engine, accounting ledger, utility engine or generic social network.

## Release discipline

Implementation is isolated on one V4.82 feature branch.

Promotion policy:
1. one consolidated squash merge to `develop` after required checks are green;
2. one exact-tree promotion to `staging` after develop validation;
3. keep `main` untouched until the existing independent review and explicit owner **Git approved** authorization are present.

This deliberately limits staging/main commit churn.

## External boundary

V4.82 is repository product capability. It does not claim hosted production acceptance, real payment/provider certification, physical hardware certification, signed store release, legal certificate validity, real-society policy acceptance or field-pilot/business acceptance.
