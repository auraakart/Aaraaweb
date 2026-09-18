# Aaraagate V4.16 Program — Society Vendor & Procurement Operations Depth

Date: 2026-09-18  
Status: In progress  
Baseline: `develop` after V4.15 release ancestry reconciliation

## Why V4.16

The fresh post-V4.15 repository audit found that Society Vendors remains the clearest repository-achievable depth gap.

The backend already contains tenant-scoped vendor master, procurement requests, quotations, quote selection, purchase orders and purchase-order-to-accounting draft linkage. The Admin surface, however, exposes only vendor creation/status and basic request submit/approve/reject. This leaves implemented procurement capability operationally hidden and keeps V2-VND at **Implemented baseline** in requirements traceability.

V4.16 closes that gap without production providers, hosted infrastructure, physical hardware or real-society acceptance claims.

## Boundaries

- Society-appointed vendors remain separate from External Services marketplace providers.
- Procurement decisions remain operator-controlled; no AI vendor ranking or automatic award.
- Finance posting remains governed by finance permissions and existing accounting controls.
- No claim of statutory procurement compliance is made.
- Real vendor onboarding, contract legal review, tax applicability and society procurement policy acceptance remain external.
- `main` changes only through the normal `develop → staging → main` release path.

## Delivery slices

### V4.16.1 — Procurement operator depth

Expose the already-implemented procurement lifecycle in Admin:

- request drill-down;
- quotation entry and side-by-side descriptive comparison;
- explicit quote selection;
- purchase-order issuance;
- append-only procurement event history;
- clear operator sequencing for quote selection before approval when a PO is expected;
- regression coverage for the operator contract.

### V4.16.2 — Procurement/accounting handoff

Strengthen the controlled PO-to-finance handoff:

- expose issued POs awaiting accounting linkage;
- finance-permission-gated creation of the existing SocietyExpense draft from a PO;
- visible linkage status and finance evidence;
- preserve one-PO/one-expense idempotency and finance segregation of duties;
- regression/authorization coverage.

### V4.16.3 — Society vendor lifecycle evidence

Close the remaining explicit V2-VND lifecycle depth:

- society-vendor contract/SLA/expiry records tied to SocietyVendor;
- configurable contract dates, references and status;
- descriptive expiry/readiness visibility;
- tenant-scoped audit evidence and operator workflow;
- no legal-validity interpretation.

Vendor-staff gate linkage is intentionally excluded from this slice until the workforce/gate identity model is re-audited to avoid duplicating person identity or weakening access controls.

### V4.16.4 — Evidence reconciliation

- full regression and required CI gates;
- requirements traceability update;
- completion evidence;
- conservative repository-only score reconciliation;
- no increase to production/field readiness without external evidence.

## Quality gates

Every functional slice must preserve:

1. tenant/resource scoping;
2. explicit capability permissions;
3. append-only or auditable privileged transitions;
4. failure-safe state transitions;
5. bounded typed Admin inputs;
6. automated regression evidence;
7. full required CI before merge to `develop`.

## Success condition

V4.16 is complete when Society Vendor/Procurement is no longer merely backend-capable but is an operator-complete, auditable repository workflow through procurement and finance handoff, with vendor lifecycle evidence represented without external-production claims.
