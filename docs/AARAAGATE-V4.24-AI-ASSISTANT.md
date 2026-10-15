# Aaraagate V4.24 — Permission-aware AI Assistant

Date: 2026-09-20  
Status: **REPOSITORY COMPLETE on merge of the V4.24 closure PR**  
Implementation baseline: `develop` through `87777cc380d9bb87c09c609973f5bff725b505a4`

## Goal

V4.24 extends the deterministic, grounded Aaraagate assistant into a permission-aware tool platform without giving AI direct database credentials or broad mutation authority.

The assistant remains an orchestration layer over authoritative Aaraagate domain data. Tenant scope, selected-property authorization, typed permissions and domain services remain authoritative.

## Completed capability

### Permission-aware read tools

The server-side tool registry now exposes only tools authorized for the caller's roles:

- Society finance
- Resident property status
- Helpdesk operations
- Security events
- Facilities
- Vendors and procurement
- Amenities and services discovery
- Resident notices
- Resident gate status
- Governance

Resident notice and gate queries require selected-property authorization. Gate retrieval is additionally constrained to the signed-in host and selected unit. Governance retrieval is society-scoped, descriptive and explicitly does not determine statutory validity.

### Mutation boundary

The fixed mutation allow-list remains:

- `CREATE_HELPDESK_TICKET`
- `BOOK_AMENITY`
- `CREATE_VISITOR_PASS`

These flows remain proposals that require explicit confirmation. No generic AI mutation endpoint was added. Finance, privacy, governance, access-control and destructive operations remain outside AI mutation authority.

### Grounding and fail-closed behavior

- supported requests are routed deterministically to registered tools;
- unsupported requests return no invented domain answer;
- prompt-injection attempts are blocked before domain retrieval;
- property-scoped reads validate the selected resident property before retrieval;
- authoritative-store errors propagate as failures instead of being converted into fabricated success;
- grounded responses identify their authoritative domain sources.

### Audit evidence

Every assistant read response that reaches the response boundary records privacy-minimal `AiAssistantRetrievalAudit` evidence containing tenant, actor, tool, intent, optional selected unit, source identifiers, status and timestamp.

Confirmed mutations remain traceable through `AiOperationProposal` and downstream domain audit trails.

The privileged Admin Assistant now surfaces both:
- retrieval evidence; and
- confirmed-action evidence.

Prompt text and returned domain payloads are intentionally excluded from the retrieval audit and from the privileged evidence UI.

### Resident and Admin experience

Resident and Admin Assistant surfaces call `GET /ai-operations/assistant/tools` and display only server-authorized capabilities. Property-vs-society scope is visible, and read tools are clearly marked read-only. Raw JSON fact dumps were replaced with readable evidence presentation.

Resident navigation remains unchanged: **Home, Gate, Services, Community, Profile**. The AI Assistant remains a contextual Home entry rather than a persistent navigation destination.

## Validation evidence

Merged implementation slices:

- PR #744 — permission-aware Resident Notices, Resident Gate and Governance read tools — merge `535dc77330dd7063a5784ee92cd36cd551567e1b`
- PR #745 — Resident/Admin permission-aware capability UI — merge `87777cc380d9bb87c09c609973f5bff725b505a4`

PR #745 exact-head validation passed:
- repository structure and change scope;
- full Flutter analyze/tests;
- full Admin access, browser accessibility, typecheck and production build;
- full API schema, migrations, lint, typecheck, tests, build and production readiness;
- dependency security;
- Security/Privacy review;
- Cross-role E2E;
- Role UAT;
- Policy, Pilot Acceptance, Staging Pilot and V4.11 readiness contracts.

The V4.24 closure slice adds regression coverage for:
- retrieval evidence UI without prompt/payload leakage;
- unauthorized selected-property fail-closed behavior before notice retrieval;
- authoritative retrieval failure without fabricated assistant success.

The closure PR must pass the same exact-head required gates before merge.

## Exit-gate assessment

- [x] permission-checked tool registry
- [x] tenant/property context enforced for scoped retrievals
- [x] explicit confirmation for every allowed mutation
- [x] fixed action allow-list and per-role tool filtering
- [x] prompt-injection resistant tool boundary
- [x] tenant-scoped retrieval and confirmed-action evidence
- [x] Resident grounding for dues/status, notices, services, amenities, helpdesk and gate status
- [x] Admin grounding for finance, helpdesk, security, facilities, vendors/procurement and governance
- [x] grounded source references rather than invented domain state
- [x] fail-closed behavior for unauthorized property and authoritative data failure
- [x] privileged UI reconciles retrieval and confirmed-action evidence
- [x] no unconfirmed generic mutation path

## Boundaries not claimed

V4.24 repository closure does **not** claim hosted LLM-provider availability, production AI quality, external-provider uptime, or real-society field acceptance. Those remain deployment/pilot evidence and belong to later readiness work.

High-risk finance, privacy, governance, access-control and destructive mutations remain read-only unless separately approved.

## Next milestone

After this closure PR merges, proceed to **V4.25 — Payments and accounting field-readiness**.
