# Aaraagate V4.6 — AI Operations 2.0

Date: 2026-09-18
Status: Repository implementation candidate
Baseline: V4.5 complete on `develop`

## Goal

Turn the V3 AI-assisted operations foundation into a differentiated, permission-aware operations assistant grounded in authoritative Aaraagate data. V4.6 does not introduce a generic chatbot and does not permit AI-originated direct database mutation.

## Reused V3 foundation

V3 already provided:
- tenant-scoped AI operation proposals;
- resident helpdesk and finance summaries;
- admin helpdesk and overdue-finance summaries;
- confirmation-gated helpdesk, amenity and visitor actions;
- execution through existing domain services;
- idempotent repeat confirmation and cancellation.

V4.6 extends these contracts rather than replacing them.

## V4.6 implementation

### Entitlement and authorization boundary
- the complete `/ai-operations` controller is gated by `AI_ASSISTANT`;
- normal tenant authentication and permission guards remain mandatory;
- free-form assistant routing applies the permission required by the selected tool at runtime;
- unsupported or unauthorized requests fail closed;
- the assistant does not receive a broad bypass permission.

### Grounded read tools
The assistant supports permission-aware queries for:
- society overdue maintenance, collection trend and ageing evidence;
- resident selected-property invoice, complaint, amenity-booking and service-booking status;
- helpdesk SLA/open-work summaries;
- privacy-minimal security-event summaries;
- facility asset/work-order/preventive-maintenance summaries;
- society vendor/procurement summaries;
- active amenity and approved External Services discovery.

Every response identifies its intent and authoritative source tables and marks whether a mutation occurred. Unsupported prompts explicitly return an unsupported result rather than fabricating an answer.

### Resident actions
- natural-language complaint text can be converted into a helpdesk proposal;
- selected-property authorization is checked before proposal creation;
- the proposal remains non-mutating until explicit user confirmation;
- confirmed execution still routes through `HelpdeskService`, preserving normal domain authorization, validation and audit behavior;
- existing amenity and visitor proposals retain their action-specific confirmation endpoints.

### Admin drafting
- authorized notice managers can create English, Hindi or Tamil notice copy;
- notice drafting is copy generation only;
- drafts explicitly require human approval;
- the AI endpoint cannot publish the notice.

### Mutation safety
- the only runtime AI mutation allow-list remains:
  - `CREATE_HELPDESK_TICKET`
  - `BOOK_AMENITY`
  - `CREATE_VISITOR_PASS`
- no generic AI mutation endpoint exists;
- direct finance, security, facility, vendor, notice or payment mutation is not exposed;
- failed proposal execution stores a constrained operational error descriptor rather than the raw upstream exception message.

### Audit visibility
- privileged audit readers can view society-scoped AI proposal evidence;
- audit output intentionally excludes proposal payload text;
- normal downstream domain audit trails remain authoritative for executed business actions.

### User experience
Resident:
- Enterprise-entitled Assistant destination;
- grounded answer/source presentation;
- explicit complaint proposal and confirmation UI;
- Assistant is intentionally hidden from offline demo mode because it requires authenticated live data.

Admin:
- dedicated Aaraagate Assistant workspace;
- grounded operations query UI;
- human-review-only notice drafting;
- recent AI action evidence when the signed-in role has audit permission;
- navigation shown only when the society has the `AI_ASSISTANT` entitlement.

## Safety invariants
1. AI does not directly mutate business-domain tables.
2. All business mutations pass through existing authenticated domain services.
3. High-impact actions require explicit confirmation.
4. Society and selected-property context are enforced before resident-scoped actions/data.
5. Tool selection cannot widen the caller's normal role permissions.
6. AI entitlement is enforced server-side.
7. Unsupported questions do not receive invented operational answers.
8. Sensitive free-form prompt/payload text is not exposed in the privileged AI audit list.

## External model/provider boundary

The current V4.6 assistant uses deterministic intent routing and authoritative database/domain-service grounding. This deliberately keeps the safety contract independent of any specific LLM provider.

A future model provider may be inserted only as a language interpretation/drafting layer in front of the same allow-listed tools. It must not receive direct database credentials or acquire mutation authority. Provider evaluation, cost, model selection and production credentials remain deployment/product decisions and are not required to prove the V4.6 repository safety contract.

## Exit criteria

V4.6 repository completion requires:
- `AI_ASSISTANT` entitlement gating;
- runtime permission-negative tests;
- explicit mutation allow-list regression;
- explicit-confirmation regression;
- selected-property authorization regression;
- grounded/unsupported-answer regression;
- Admin build and Resident/Guard Flutter regression;
- full milestone exact-head CI and V4 security/role/policy/pilot contract gates.

No `staging` or `main` promotion is part of this milestone.
