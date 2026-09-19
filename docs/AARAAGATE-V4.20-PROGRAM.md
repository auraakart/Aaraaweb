# Aaraagate V4.20 Program — Facilities, Assets & Work-Order Depth

Date: 2026-09-19  
Status: In progress  
Baseline: `develop` after V4.19 repository closure

## Why V4.20

The post-V4.19 traceability audit identified V2-FAC Assets/AMCs/work orders as the only remaining P1 area still described as `Implemented baseline / hardened`.

The repository already contains tenant-scoped facility assets, work orders, preventive maintenance plans, service contracts/AMCs, evidence references, inventory, operations tasks, health metrics and operational alerts. V4.20 therefore focuses on operator depth, lifecycle evidence and readiness clarity rather than recreating the facilities domain.

## Boundaries

- FACILITIES_READ / FACILITIES_MANAGE remain the server-authoritative permission boundaries.
- Asset, work-order, plan, contract and evidence references remain tenant-scoped.
- Work-order transitions remain controlled by the existing server transition matrix.
- Preventive generation remains duplicate-safe and server-authoritative.
- Contract/evidence metadata does not constitute vendor/legal/AMC validity certification.
- Real facility-team acceptance, physical inspection outcomes and hosted/field evidence remain external.

## Delivery slices

### V4.20.1 — Facilities operator depth — merged via #713

- facilities-scoped active-assignee context under FACILITIES_READ;
- typed assignee selectors for work orders and preventive maintenance plans;
- friendly assignee names in operator rows;
- persistent work-order completion/cancellation form instead of browser prompt;
- append-only work-order history with actor names;
- API and Admin regression coverage.

### V4.20.2 — Asset / work-order readiness evidence — in progress

- descriptive overdue, assignment, asset-state and evidence/readiness signals;
- critical-work prioritization and next-action guidance;
- preserve lifecycle transition and evidence rules.

### V4.20.3 — Contract / preventive maintenance depth

- improve AMC/service-contract and preventive-plan linkage/expiry clarity;
- expose plan-to-generated-work evidence and contract/evidence context;
- preserve provider verification and tenant scoping.

### V4.20.4 — Evidence reconciliation

- full regression and CI;
- requirements traceability and roadmap reconciliation;
- V4.20 completion evidence;
- conservative repository-only re-score;
- Production/field readiness unchanged without external evidence.

## Quality gates

Tenant isolation, facilities permissions, active-assignee validation, controlled work-order transitions, duplicate-safe preventive generation, append-only lifecycle evidence and full CI remain mandatory.
