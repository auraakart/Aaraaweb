# Aaraagate V4.57 — Admin Authorization Convergence

Date: 2026-09-26
Status: Development started on develop; release identity remains 4.56.0.

## Objective

Remove client-side role drift from the guided-operations path while preserving the backend permission matrix as the authorization authority.

## Slice 1 — Auditor read-path convergence

The backend assigns `AUDITOR` both `FINANCE_READ` and `SOCIETY_WORKFORCE_READ`. V4.57 aligns the Admin experience with that existing authority instead of widening it:

- Auditor sessions can restore into a read-only Admin overview.
- The overview does not request or display Helpdesk or Notice data for Auditor because that role does not hold those permissions.
- Finance accepts Auditor for read-only access; the existing Finance manage-role set remains unchanged.
- Society Workforce already accepts Auditor for read-only access; its manage-role set remains unchanged.
- Guided Finance/Workforce actions therefore lead to destinations the same role can actually read.

## Slice 2 — Auditor operational read-path convergence

The backend also grants `AUDITOR` `GOVERNANCE_READ`, `FACILITIES_READ` and `OCCUPANCY_LIFECYCLE_READ`. The corresponding Admin pages now admit Auditor sessions through their existing read gates while keeping their manage-role sets unchanged. Governance hides management-only navigation for Auditor, and Governance, Facilities and Occupancy return to the dedicated Audit workspace instead of dropping a read-only reviewer into the general Admin shell.

The Audit workspace now exposes discoverable links to the already-authorized read-only operational surfaces: Finance, Society Workforce, Governance, Facilities, Occupancy Lifecycle, Society Vendors, Documents and Privacy Operations. No Parking link is exposed yet because the Parking client still needs an explicit read/manage split before Auditor access can be safely converged.

## Security boundary

This slice changes client reachability only. It does not add backend permissions, mutation authority, cross-society access or a new role. Server authorization and segregation-of-duties checks remain authoritative for every API request.

## Regression contract

`pnpm check:v4.57` verifies the backend Auditor permissions, console reachability, overview read suppression, Finance read-only admission and unchanged mutation-role boundaries.

## Boundary

V4.57 remains under development on `develop`. This slice does not claim a 4.57.0 release, staging/main promotion, productionization, hosted acceptance, external provider certification or field-pilot acceptance.
