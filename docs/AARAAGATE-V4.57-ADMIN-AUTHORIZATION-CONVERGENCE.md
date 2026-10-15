# Aaraagate V4.57 — Admin Authorization Convergence

Date: 2026-09-26
Status: Release candidate closed on develop; release identity is 4.57.0.

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

The Audit workspace exposes discoverable links to the already-authorized read-only operational surfaces: Finance, Society Workforce, Governance, Facilities, Occupancy Lifecycle, Society Vendors, Documents and Privacy Operations.

## Slice 3 — Parking read/manage and least-privilege convergence

Parking now follows the permissions already enforced by its server routes instead of a single client-side administration gate. The legacy vehicle/assignment page separates `SOCIETY_CONFIGURATION_READ` visibility from `SOCIETY_CONFIGURATION_MANAGE` editing, while Advanced Parking and Visitor Permits separate `PARKING_READ` from `PARKING_MANAGE`. Auditor therefore receives read-only parking evidence and no assignment, policy, credential, violation or permit mutation controls.

Read-only Visitor Permits no longer fetches eligible-visitor or slot-selection inputs. Those datasets are loaded only for existing parking-manage roles, reducing unnecessary resident/visitor data exposure for review-only sessions. Security Supervisor retains its existing `PARKING_READ` access to v2 parking evidence without receiving mutation controls. Parking is now discoverable from the Audit workspace.

## Security boundary

This slice changes client reachability only. It does not add backend permissions, mutation authority, cross-society access or a new role. Server authorization and segregation-of-duties checks remain authoritative for every API request.

## Regression contract

`pnpm check:v4.57` verifies the backend Auditor permissions, console reachability, overview read suppression, Finance read-only admission and unchanged mutation-role boundaries.

## V4.57 release closure

The authorization-convergence milestone is closed on `develop` as a 4.57.0 repository release candidate. Slices 1–3 align existing Auditor read authority across Overview, Finance, Society Workforce, Governance, Facilities, Occupancy Lifecycle and Parking while preserving the pre-existing mutation-role sets and reducing unnecessary Visitor Permit read-time data fetches.

## Boundary

V4.57 is closed as a repository release candidate on `develop`. This does not claim staging/main promotion, productionization, hosted acceptance, external provider certification or field-pilot acceptance.
