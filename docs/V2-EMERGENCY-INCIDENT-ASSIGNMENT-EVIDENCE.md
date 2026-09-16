# Aaraagate V2 Emergency Incident Assignment & Evidence

Date: 2026-09-16
Requirement: `V2-EMR`
Status: Implementation slice

## Scope

This slice closes the remaining first-class incident-management gap in the existing SOS/emergency domain. Existing Aaraagate capabilities already cover emergency categories/severity, resident SOS triggering, current-occupancy authorization, emergency contacts, responder acknowledgement/escalation, emergency broadcast, delivery fallback/routing, incident timeline and closure.

This change adds:

- responder assignment for active/acknowledged incidents;
- incident evidence metadata using private object references;
- responder-queue visibility of latest assignment and evidence count;
- append-only timeline entries for assignment and evidence actions.

It intentionally reuses `SosIncidentEvent` instead of creating mutable assignment/evidence side tables. Reassignment creates another `ASSIGNED` event and the responder queue derives the latest assignment. Evidence creates an immutable `EVIDENCE_ADDED` event.

## API

All management endpoints require the existing `SOS_RESPOND` capability and the standard Bearer, tenant, entitlement and permission guards.

- `PATCH /sos/manage/:incidentId/assign`
  - body: `assigneeUserId`, optional `note`;
  - assignee must have an active responder-role membership in the same society;
  - allowed only while the incident is `ACTIVE` or `ACKNOWLEDGED`.

- `POST /sos/manage/:incidentId/evidence`
  - body: private `objectKey`, `fileName`, optional `contentType`, optional `note`;
  - public/external URLs are rejected;
  - allowed only while the incident is `ACTIVE` or `ACKNOWLEDGED`.

- `GET /sos/manage/:incidentId/evidence`
  - resolves the incident within the authenticated society boundary before listing evidence metadata;
  - object keys are references only and do not grant object-download authorization.

The management queue also exposes the latest assignee and total evidence count, derived from the immutable incident event stream.

## Authorization and tenant isolation

Responder assignment accepts only active same-society memberships whose role is one of:

- Society Admin;
- Committee Member;
- Facility Manager;
- Security Supervisor;
- Security Guard.

The incident itself is first resolved by `societyId + incidentId`; evidence and assignment queries include the society boundary. Resident trigger/read-own permissions are unchanged.

## Evidence security model

The API records evidence metadata, not file bytes and not public URLs. `objectKey` must be a private storage key and cannot contain a URI scheme such as `https://`.

This slice does **not** implement object upload or download. A future storage adapter must enforce authorization at upload/download time and must never treat possession of the object key as authorization.

## Closure integrity

Assignments and evidence can be added only to `ACTIVE` or `ACKNOWLEDGED` incidents. `RESOLVED` and `CANCELLED` incidents reject new assignment/evidence mutations. Existing timeline history remains append-only.

## Automated acceptance

Automated tests cover:

- same-society active responder assignment;
- rejection of non-responder/cross-boundary assignment targets;
- rejection of assignment after incident closure;
- private object-key evidence persistence;
- rejection of public evidence URLs;
- rejection of evidence after incident closure;
- tenant-scoped evidence retrieval;
- responder-queue derivation of current assignment and evidence count;
- `SOS_RESPOND` protection on all management endpoints.

## Deferred release gates

Per the current development operating model, hosted staging and human/real-device UAT are deferred but remain mandatory before production release. Completing this slice and passing CI must not be interpreted as production acceptance or as permission to promote `main`.
