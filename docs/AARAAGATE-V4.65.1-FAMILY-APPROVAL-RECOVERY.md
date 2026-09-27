# Aaraagate V4.65.1 — Family Approval-Request Recovery

Date: 2026-09-28

## Root cause corrected

V4.65.0 correctly moved family-member actions behind controller-owned recovery, but its add/remove recovery model treated those endpoints like immediate occupancy mutations. The real backend creates a Society Admin approval request, not an immediate active-occupancy mutation. A commit-then-transport failure could therefore leave a valid pending request on the server while Resident still reported failure because no active family-member occupancy existed yet.

## Corrected recovery contract

Resident now reads the existing self-scoped `/api/v1/household-change-requests/mine` boundary and scopes that evidence back to households for the active property.

- family-member add accepts recovered submission only when an exact FAMILY_MEMBER_ADD request for that household, normalized phone and requested gate settings is PENDING, PROCESSING or APPROVED;
- family-member removal accepts recovered submission only when the matching FAMILY_MEMBER_REMOVE request targets the same occupancy and is PENDING, PROCESSING or APPROVED;
- direct gate-setting updates remain recovered from the authoritative active occupancy because that endpoint is an immediate mutation;
- the Family Members screen now renders real production PENDING/PROCESSING family approval requests rather than limiting pending-state visibility to demo mode;
- if the authoritative request read fails or no matching request exists, the client does not manufacture success.

Existing HOUSEHOLD_MANAGE_OWN, verified-current-owner checks, Society Admin approval, owner/tenant constraints and server transaction rules remain authoritative.

## Release identity

- root/API/Admin: `4.65.1`
- Resident/Guard: `4.65.1+46501`

## Evidence

`pnpm check:v4.65.1` locks the request-read path, exact recovery predicates, production pending UI and realistic regression model. Existing V4.65 family-member and AutoPay behavior checks remain enforced as historical contracts.

## Boundary

This is a repository patch closure on `develop`. Staging/main promotion remains separate. Productionization, hosted acceptance and field acceptance remain external evidence.
