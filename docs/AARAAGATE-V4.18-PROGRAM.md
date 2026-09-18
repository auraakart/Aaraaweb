# Aaraagate V4.18 Program — Document Repository & Records Governance Depth

Date: 2026-09-18  
Status: In progress  
Baseline: `develop` after V4.17 repository closure

## Why V4.18

The post-V4.17 audit identified Society Documents as the clearest remaining P1 repository-depth gap.

The backend already provides tenant-scoped document storage, upload verification/safety scanning, classified audiences, publish/archive transitions, authorized download intents and append-only document events. However, the Admin workflow exposed a property-owner-only audience without supplying the required unit scope, and it did not expose the existing document event history. The schema also already reserves a `VERSION_REPLACED` evidence event without an operator supersession workflow.

V4.18 closes document-operations depth without claiming hosted object-storage acceptance or legal/statutory document validity.

## Boundaries

- Document access remains server-authorized; UI visibility is never treated as the authorization boundary.
- Property-owner-only documents require explicit tenant-scoped unit targeting.
- Object storage remains private and accessed through bounded upload/download intents.
- Safety scanning remains required before a document draft is created.
- Document history remains append-only.
- Legal validity, retention-law interpretation, statutory notice service and hosted storage acceptance remain external.

## Delivery slices

### V4.18.1 — Document operator depth — merged via #705 — merged via #705

- tenant-scoped property selector for property-owner-only documents;
- fix Admin/API contract so required `unitId` is supplied;
- friendly property context in management rows;
- expose append-only document lifecycle history in Admin;
- API and Admin regression coverage.

### V4.18.2 — Controlled supersession & version lineage — in progress — in progress

- implement a bounded replacement flow using the existing `VERSION_REPLACED` event vocabulary;
- preserve prior versions and immutable history;
- prevent destructive replacement of published evidence;
- expose current-versus-superseded lineage to operators;
- no legal-validity inference.

### V4.18.3 — Resident document clarity

- improve published-document property/audience context;
- version/current-document clarity where relevant;
- preserve server-authorized audience/property filtering and download intents.

### V4.18.4 — Evidence reconciliation

- full regression and CI;
- requirements traceability and roadmap reconciliation;
- V4.18 completion evidence;
- conservative repository-only re-score;
- Production/field readiness unchanged without external evidence.

## Quality gates

Tenant scoping, audience authorization, private object-storage boundaries, malware/safety scan verification, append-only evidence, typed operator inputs and full CI remain mandatory.
