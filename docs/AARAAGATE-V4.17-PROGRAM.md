# Aaraagate V4.17 Program — Occupancy Lifecycle & Property Operations Depth

Date: 2026-09-18  
Status: In progress  
Baseline: `develop` after V4.16 repository closure

## Why V4.17

The post-V4.16 audit found the move-in/move-out workflow as the clearest remaining repository-achievable core-flow gap. The backend already enforces effective dates, approval, checklist readiness, tenant scoping and gate-authority revocation, but the Admin operator surface still depended on raw Unit/User/Occupancy IDs and browser prompt dialogs.

V4.17 closes occupancy and adjacent property-operations depth without changing legal ownership semantics or claiming real-society policy acceptance.

## Boundaries

- Legal ownership and physical occupancy remain independent relationships.
- Family-member lifecycle remains separate from owner/tenant move-in.
- Move completion remains blocked until required checklist evidence is complete and the effective time has arrived.
- Move-out continues to revoke gate approval, notification and primary-contact authority.
- Society-specific rental/police-verification/legal requirements remain configurable/external.
- No production/provider/hardware claims are added.

## Delivery slices

### V4.17.1 — Occupancy operator ergonomics — merged via #701

- tenant-scoped operator context for units and active occupancies;
- registered-mobile move-in flow without raw user UUID entry;
- selector-based unit and active-occupancy workflows;
- persistent review/checklist/document verification controls replacing browser prompts;
- existing authorization and lifecycle invariants preserved;
- API and Admin regression coverage.

### V4.17.2 — Occupancy readiness & handover evidence — in progress

- descriptive move readiness summary;
- explicit mandatory versus optional checklist evidence;
- access/vehicle/workforce handover visibility using existing repository data where available;
- no legal or police-verification validity inference.

### V4.17.3 — Resident move experience

- improve Resident self-service move-in/move-out visibility and status clarity;
- property-scoped timeline and next-action guidance;
- preserve server-authoritative ownership/occupancy checks.

### V4.17.4 — Evidence reconciliation

- full regression and CI;
- requirements traceability and completion evidence;
- conservative repository-only re-score;
- Production/field readiness unchanged without external evidence.

## Quality gates

Tenant scoping, capability permissions, effective-date safety, gate-authority revocation, checklist blocking, typed operator inputs, negative tests and full CI remain mandatory.
