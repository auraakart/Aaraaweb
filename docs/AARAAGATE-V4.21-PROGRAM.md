# Aaraagate V4.21 Program — Helpdesk, SLA & Service-Recovery Depth

Date: 2026-09-19  
Status: In progress  
Baseline: `develop` after V4.20 repository closure and staging promotion

## Why V4.21

The post-V4.20 traceability audit identified V2-HLP Helpdesk SLA/escalation as a remaining P1 repository area with strong backend capability but incomplete Admin operator reachability.

The repository already contains resident ticket creation/comments, reviewer queues, controlled status transitions, resolution/closure codes, reopen, SLA policies, first-response/resolution deadlines, SLA evaluation, escalation, internal notes, activity history and automated escalation support. V4.21 therefore focuses on operator workflow depth, readiness evidence and resident service-recovery clarity rather than recreating the helpdesk domain.

## Boundaries

- HELPDESK_REVIEW remains the server-authoritative operator boundary.
- Resident ticket access remains property/occupancy scoped and self-only.
- Status transitions and resolution/closure codes remain server-authoritative.
- SLA policy, breach evaluation and escalation rules remain server-authoritative.
- Assignment targets must be active members of the current society.
- Human helpdesk acceptance, staffing quality and real service outcomes remain external.

## Delivery slices

### V4.21.1 — Helpdesk operator depth — merged via #718

- dedicated Admin Helpdesk workspace reachable from Management navigation;
- tenant-scoped reviewer/escalation-target context;
- auditable ticket assignment with append-only ASSIGNED activity;
- typed status, resolution/closure, comment, internal-note, reopen and escalation controls;
- existing prioritized SLA queue, activity history and SLA history exposed in Admin;
- API and Admin regression coverage.

### V4.21.2 — Helpdesk readiness & recovery evidence — in progress

- descriptive assignment, first-response, resolution, breach and escalation readiness;
- overdue/critical ticket prioritization and next-action guidance;
- preserve existing lifecycle/SLA rules and automated escalation.

### V4.21.3 — Resident service-recovery clarity

- improve resident ticket status, SLA/service-target clarity and next-action guidance;
- resolution/reopen evidence and property context;
- preserve self-only access and server-authoritative lifecycle rules.

### V4.21.4 — Evidence reconciliation

- full regression and CI;
- requirements traceability and roadmap reconciliation;
- V4.21 completion evidence;
- conservative repository-only re-score;
- Production/field readiness unchanged without external evidence.

## Quality gates

Tenant isolation, HELPDESK_REVIEW authorization, controlled transitions, valid resolution/closure codes, active-member assignment, append-only evidence, SLA breach/escalation rules and full CI remain mandatory.
