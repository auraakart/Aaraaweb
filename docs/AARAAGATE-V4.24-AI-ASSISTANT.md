# Aaraagate V4.24 — Permission-aware AI Assistant

Date: 2026-09-20
Status: V4.24.1 merged; V4.24.2 domain grounding implemented and validating
Baseline: `develop` at `5500fb28d44c1f087cd2a7835e448c2543493dad`

## Goal

Extend the existing V4.6 deterministic, grounded assistant into an explicit permission-aware tool platform without giving AI direct database credentials or broad mutation authority.

V4.24 builds on the existing AI entitlement, selected-property checks, grounded read tools, proposal/confirmation mutations and the fixed three-action mutation allow-list.

## V4.24.1 — Tool registry and retrieval audit

This slice adds:

- an explicit assistant tool registry with per-tool context and permission requirements;
- a caller-visible `GET /ai-operations/assistant/tools` endpoint that returns only tools authorized for the caller's roles;
- preservation of the existing mutation allow-list:
  - `CREATE_HELPDESK_TICKET`
  - `BOOK_AMENITY`
  - `CREATE_VISITOR_PASS`;
- tenant-scoped `AiAssistantRetrievalAudit` evidence for assistant read-tool responses;
- privacy-minimal audit rows containing actor, society, tool, intent, selected unit when applicable, source identifiers, status and timestamp;
- no free-form prompt text or returned domain payload in retrieval audit rows;
- deterministic prompt-injection blocking before any domain retrieval when the prompt tries to override permissions, confirmation or tool policy;
- selected-property routing ahead of society-level finance routing when an authenticated resident supplies a unit context.

Confirmed mutations remain audited through `AiOperationProposal` and existing downstream domain audit trails.

## Tool boundary

Initial registered read tools remain:

- Society finance
- Resident property status
- Helpdesk operations
- Security events
- Facilities
- Vendors and procurement
- Amenities and services discovery

The registry does not add mutation authority. Unsupported prompts and injection attempts do not dynamically create tools or bypass role checks.

## V4.24.2 — Resident/Admin domain grounding

This slice adds three read-only registered tools:

- Society notices, requiring `NOTICE_READ` plus selected-property authorization. Owner-only notices remain visible only to Owner roles; Tenant/Family Member visibility remains `OWNER_AND_OCCUPANTS`.
- Gate and visitor status, requiring an own-scope gate permission plus selected-property authorization. Visitor/access rows are constrained by society, selected unit and signed-in resident.
- Governance evidence, requiring `GOVERNANCE_READ`, returning descriptive meeting/resolution/action evidence only. The assistant explicitly does not determine legal validity or statutory compliance.

All three tools use the V4.24.1 retrieval audit path and do not add mutation authority.

## Remaining V4.24 work

1. Surface permission-filtered tool availability in Resident/Admin UX.
2. Reconcile retrieval and confirmed-action evidence in privileged audit UI.
3. Add stronger negative tests for stale/uncertain-data fallback.
4. Reconcile the existing Tenant finance-read permission with the approved owner/tenant dues model as a separate authorization correction.
5. Close V4.24 only after full exact-head CI and security/role/policy/pilot gates are green.

High-risk finance, privacy, governance, access-control and destructive mutations remain read-only unless separately approved.
