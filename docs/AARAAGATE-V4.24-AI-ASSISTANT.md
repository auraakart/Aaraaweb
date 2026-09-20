# Aaraagate V4.24 — Permission-aware AI Assistant

Date: 2026-09-20
Status: V4.24.1 foundation implemented and validating
Baseline: `develop` at `d29b4e62ec8adcf334d9234ad5825aefd3662dfa`

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

## Remaining V4.24 work

After V4.24.1 validates:

1. Add grounded resident notice and gate-status read tools.
2. Add grounded Admin governance read tool.
3. Surface permission-filtered tool availability in Resident/Admin UX.
4. Reconcile retrieval and confirmed-action evidence in privileged audit UI.
5. Add stronger negative tests for cross-role/cross-property leakage and stale/uncertain-data fallback.
6. Close V4.24 only after full exact-head CI and security/role/policy/pilot gates are green.

High-risk finance, privacy, governance, access-control and destructive mutations remain read-only unless separately approved.
