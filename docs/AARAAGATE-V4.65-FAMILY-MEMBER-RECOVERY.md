# Aaraagate V4.65 — Family Member Mutation Recovery

Date: 2026-09-28
Status: Development started on `develop`; runtime identity remains V4.64.1.

## Objective

Prevent a verified owner from seeing a false failure or stale destructive action when a family-member mutation commits on the server but the response is lost.

## Recovery contract

Resident family-member add, gate-setting update and deactivation now use controller-owned mutation methods instead of direct repository calls followed by a broad application reload.

After success, the controller refreshes the authoritative household read model for the active property. After an uncertain failure it performs the same fresh read and accepts recovered success only when the read model proves the requested outcome:

- add: active FAMILY_MEMBER occupancy with the submitted normalized phone and effective gate settings;
- update: the same occupancy ID with the requested effective gate settings;
- deactivate: the active occupancy ID is absent.

When primary gate contact is requested, recovery expects the server-effective notification setting to be enabled, matching the existing household service rule.

The recovery read is fail-closed: if authoritative household refresh itself fails, stale local household state is not used to manufacture success.

## Authority boundary

The server still requires HOUSEHOLD_MANAGE_OWN and a verified current owner for family-member management. Existing household transaction rules, owner/tenant conflict checks, primary-contact reassignment and membership deactivation remain authoritative.

## Release boundary

This is the first V4.65 development slice. It does not claim V4.65 release closure, staging/main promotion, productionization, hosted acceptance or field acceptance.
