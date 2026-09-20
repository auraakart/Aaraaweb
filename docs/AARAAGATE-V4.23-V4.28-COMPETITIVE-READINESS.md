# Aaraagate V4.23–V4.28 Competitive Product Readiness Program

Date: 2026-09-20
Baseline: `develop` at `1fafcc1f6c9d8bba9a458b8f089b962c7ffc5560`
Status: V4.23 product-experience consolidation completed on `develop`; functional closure baseline `b8349322d29a6439605ca68ee358fe70d80a1c79`

## Goal

Concentrate the next product cycles on the six competitive gaps identified in the September 2026 review, without expanding into unrelated feature breadth. The objective is to convert Aaraagate from a feature-rich repository into a demonstrably deployable residential-community product.

The six priority areas are:

1. Admin UI/UX consolidation and cross-surface design consistency.
2. Permission-aware AI Assistant and Action Centre.
3. Real Indian payment/accounting workflow hardening.
4. External integration ecosystem and hardware/provider abstraction.
5. Society onboarding and migration.
6. Real-society pilot evidence and measurable operational readiness.

Repository implementation, field acceptance, hosted infrastructure and third-party provider activation remain distinct evidence classes. No cycle may claim production completion from code presence alone.

## Execution order

### V4.23 — Product experience consolidation

V4.23 completes the already-approved V4.22 Admin consolidation before additional product-depth work is credited.

Required work:
- finish Helpdesk → Privacy → Facilities → Documents → Occupancy → Finance/Governance migrations;
- remove duplicated presentation equivalents after each migration is validated;
- preserve domain authorization, API payloads and lifecycle behavior;
- align Admin typography, spacing, forms, status, readiness/evidence and action patterns;
- reconcile Resident and Guard shared presentation tokens where doing so does not reopen mobile information architecture;
- preserve the Resident navigation baseline: Home, Gate, Services, Community, Profile;
- keep AI as a contextual premium entry rather than a persistent bottom-navigation destination.

Exit gate:
- all V4.22 slices closed with rendered/behavior evidence;
- no critical accessibility, narrow-screen or stale-state regression in migrated routes;
- Admin lint/typecheck/build and affected domain regressions green.

### V4.23 closure evidence

V4.23 closed the V4.22 Admin consolidation dependency through the merged Helpdesk, Privacy, Facilities, Documents, Occupancy, Finance and Governance slices. Exact PR/merge-SHA evidence and repository-vs-field evidence boundaries are recorded in [AARAAGATE-V4.22-PROGRAM.md](AARAAGATE-V4.22-PROGRAM.md).

The Resident navigation baseline remains Home, Gate, Services, Community, Profile, and the AI Assistant remains a contextual premium entry rather than a persistent bottom-navigation destination. The Admin consolidation did not reopen mobile information architecture.

Repository closure does not imply production deployment, real-provider activation, signed-store release, physical hardware acceptance or real-society acceptance. Those remain later evidence classes.

### V4.24 — Permission-aware AI Assistant

Build on the existing read-only AI Action Centre and resident demo assistant.

Required work:
- permission-checked tool registry over existing backend APIs;
- tenant/property context mandatory for every data retrieval;
- explicit confirmation for mutations;
- action allow-list and per-role tool filtering;
- prompt-injection resistant tool boundary;
- audit record for assistant retrievals and confirmed actions;
- resident questions for dues, notices, services, amenities, helpdesk and gate status;
- admin questions for finance, helpdesk, security, facilities and governance;
- grounded answer references to domain objects rather than model-invented state;
- safe fallback when authorization, data freshness or provider availability is uncertain.

Initial mutation scope must stay narrow. High-risk finance, privacy, governance, access-control and destructive actions remain read-only until separately approved.

Exit gate:
- zero cross-tenant/cross-role tool leakage in negative tests;
- no unconfirmed mutation path;
- audit evidence exists for every assistant action.

### V4.25 — Payments and accounting field-readiness

Repository accounting is already deep; this cycle focuses on real operating workflows and provider boundaries.

Required work:
- payment-provider adapter contract with idempotent order, webhook verification, refunds and reconciliation;
- provider-independent transaction state model remains authoritative;
- bank statement import/reconciliation preview and duplicate detection;
- accountant-friendly exception queues;
- receipts and failed-payment recovery;
- configurable GST/TDS fields only where enabled;
- payment/accounting reconciliation evidence suitable for pilot use;
- sandbox/live credential separation and fail-closed configuration.

Real provider credentials and external callbacks remain deployment evidence, not repository completion.

Exit gate:
- replay-safe webhook tests;
- duplicate payment protection;
- accounting totals reconcile in fixture/sandbox evidence;
- no client-trusted payment success.

### V4.26 — Integration ecosystem

Create an integration layer so Aaraagate can support Indian society deployment without coupling core domains to specific vendors.

Required work:
- versioned provider interfaces for OTP/SMS, push, WhatsApp, payment gateway, access-control/ANPR/RFID and optional smart-meter providers;
- capability discovery and per-society configuration;
- normalized health/status and retry semantics;
- secrets only from deployment configuration;
- auditable provider changes;
- graceful degradation when a provider is unavailable;
- mock/reference adapters for repository validation;
- integration certification checklist.

Physical hardware installation and commercial vendor certification remain external.

Exit gate:
- core business flows work with reference adapters;
- provider failures do not bypass authorization or corrupt accounting/access state;
- integration swap does not require domain rewrites.

### V4.27 — Society onboarding and migration

Make switching from spreadsheets or another society platform operationally practical.

Required work:
- staged CSV/XLSX-compatible import contract for societies, blocks, units, residents, owners/tenants, vehicles, workforce and opening balances;
- schema validation and row-level errors;
- duplicate/conflict detection;
- preview-before-commit;
- idempotent/restartable migration batches;
- rollback or compensating strategy before publish;
- opening-balance reconciliation;
- onboarding checklist and progress dashboard;
- migration audit trail and exportable outcome report;
- society configuration wizard for gates, amenities, billing, roles and policies.

Exit gate:
- representative migration fixture passes with deterministic results;
- invalid rows never partially corrupt published state;
- every imported privileged relationship is auditable.

### V4.28 — Pilot evidence and deployable-product closure

Convert repository capability into measurable field evidence.

Required work:
- pilot society definition and named operational owners;
- Resident, Guard, Society Admin, Security Supervisor and Accountant acceptance scripts;
- KPI instrumentation for gate handling time, visitor approval latency, resident activation, collection rate, payment failures, helpdesk SLA, amenity booking, crash-free sessions and support burden;
- training records and escalation ownership;
- exact release SHA evidence;
- rollback, backup/restore and incident tabletop;
- signed Android/Play candidate evidence when available;
- hosted provider/monitoring evidence tracked separately from repository tests.

Exit gate:
- no Sev-1/Sev-2 unresolved blocker;
- agreed KPI thresholds have evidence;
- required roles sign off;
- production-readiness decision references evidence rather than repository status alone.

## Cross-cycle rules

1. No new broad module is introduced unless it directly supports one of the six areas.
2. Sensitive APIs require tenant scoping and typed permissions.
3. UI visibility never replaces backend authorization.
4. AI never receives unrestricted database access.
5. Provider adapters never become the source of accounting or access-control truth.
6. Migration jobs must be restartable and auditable.
7. Field KPIs remain PENDING_EXTERNAL until real evidence is attached.
8. Each material slice uses feature branch → PR → `develop`; `main` promotion remains a separate explicit release action.

## Competitive outcome target

The target is not additional feature count. The target is to close the gap between Aaraagate's repository breadth and incumbent operational maturity by improving consistency, deployment confidence, integration portability, migration speed, and measurable field outcomes.

The intended end state after V4.28 is:
- consistent operator and resident experience;
- safe, useful AI across existing domains;
- payment/accounting workflows ready for provider-backed pilots;
- swappable provider/hardware integrations;
- fast society onboarding;
- pilot evidence demonstrating real operational value.
