# Aaraagate V4.16 Program — Society Vendor & Procurement Operations Depth

Date: 2026-09-18  
Status: In progress  
Baseline: `develop` after V4.15 release ancestry reconciliation

## Why V4.16
The fresh post-V4.15 repository audit found Society Vendors as the clearest repository-achievable depth gap. V4.16 closes the operational exposure and lifecycle evidence gaps without production/provider claims.

## Boundaries
- Society-appointed vendors remain separate from External Services marketplace providers.
- Procurement decisions remain operator-controlled; no AI vendor ranking or automatic award.
- Finance posting remains governed by finance permissions and existing accounting controls.
- No claim of statutory procurement compliance is made.
- Real vendor onboarding, contract legal review, tax applicability and society procurement policy acceptance remain external.
- `main` changes only through `develop → staging → main`.

## Delivery slices

### V4.16.1 — Procurement operator depth — merged via #687
- request drill-down;
- quotation entry/comparison and explicit selection;
- PO issuance;
- append-only procurement evidence history;
- operator sequencing guidance;
- Admin regression contract.

### V4.16.2 — Procurement/accounting handoff — merged via #688
- finance-scoped issued-PO read model that does not grant vendor-management access;
- visible pending/linked accounting state;
- FINANCE_MANAGE-gated creation of the existing SocietyExpense draft;
- account/fund selection from existing accounting sources;
- one-PO/one-expense idempotency retained;
- authorization and Admin regression coverage.

### V4.16.3 — Society vendor lifecycle evidence — merged via #691
- society-vendor contract/SLA/expiry records tied to SocietyVendor;
- configurable dates, references and status;
- descriptive expiry/readiness visibility;
- tenant-scoped audit evidence and operator workflow;
- no legal-validity interpretation.

Vendor-staff gate linkage remains excluded until the workforce/gate identity model is re-audited to avoid duplicate identity or weakened access controls.

### V4.16.4 — Evidence reconciliation — in progress
- full regression and CI;
- requirements traceability;
- completion evidence;
- conservative repository-only re-score;
- production/field readiness unchanged without external evidence.

## Quality gates
Tenant scoping, capability permissions, audited transitions, failure-safe state changes, bounded typed Admin inputs, automated regression and full CI are required for every slice.


## V4.16.4 closure evidence

V4.16 functional slices are integrated on `develop` through:

- #687 — procurement operator depth;
- #688 — procurement/accounting handoff;
- #691 — society-vendor contract/SLA/expiry lifecycle evidence.

The final reconciliation updates requirement traceability, conservative repository scoring and completion evidence. Production/field readiness remains unchanged because real vendor onboarding, society procurement policy, contract/legal review, hosted infrastructure and field outcomes remain external.
