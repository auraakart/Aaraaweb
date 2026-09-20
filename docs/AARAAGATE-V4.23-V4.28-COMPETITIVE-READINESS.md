# Aaraagate V4.23–V4.28 Competitive Product Readiness Program

Date: 2026-09-20
Baseline: `develop` at `1fafcc1f6c9d8bba9a458b8f089b962c7ffc5560`

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

**Current repository status:** **COMPLETE on `develop` through `d29b4e62ec8adcf334d9234ad5825aefd3662dfa`.** V4.22 Admin consolidation is closed and the remaining Resident/Guard presentation-token drift was reconciled without reopening the approved Resident mobile information architecture.

Required work:
- [x] finish Helpdesk → Privacy → Facilities → Documents → Occupancy → Finance/Governance migrations;
- [x] remove superseded presentation equivalents in the migrated Admin routes after validation;
- [x] preserve domain authorization, API payloads and lifecycle behavior;
- [x] align Admin typography, spacing, forms, status, readiness/evidence and action patterns;
- [x] reconcile remaining Resident and Guard shared presentation-token drift without reopening mobile information architecture;
- [x] preserve the Resident navigation baseline: Home, Gate, Services, Community, Profile;
- [x] keep AI as a contextual premium entry rather than a persistent bottom-navigation destination.

Exit gate:
- all V4.22 slices closed with rendered/behavior evidence;
- no critical accessibility, narrow-screen or stale-state regression in migrated routes;
- Admin lint/typecheck/build and affected domain regressions green.

### V4.24 — Permission-aware AI Assistant

**Current repository status:** **REPOSITORY COMPLETE on merge of the V4.24 closure PR.** Backend read-tool expansion is merged through `535dc77330dd7063a5784ee92cd36cd551567e1b`; permission-aware Resident/Admin capability UI is merged through `87777cc380d9bb87c09c609973f5bff725b505a4`. Final audit-evidence reconciliation and negative fail-closed regressions are included in the closure PR. See [AARAAGATE-V4.24-AI-ASSISTANT.md](AARAAGATE-V4.24-AI-ASSISTANT.md).

Required work:
- [x] permission-checked tool registry over authoritative Aaraagate domain data;
- [x] tenant/property context enforcement for scoped retrievals;
- [x] explicit confirmation for mutations;
- [x] fixed action allow-list and per-role tool filtering;
- [x] prompt-injection resistant tool boundary;
- [x] retrieval audit plus confirmed-action evidence;
- [x] Resident questions for dues/status, notices, services, amenities, helpdesk and gate status;
- [x] Admin questions for finance, helpdesk, security, facilities, vendors/procurement and governance;
- [x] grounded answer references to domain objects rather than model-invented state;
- [x] fail-closed behavior when authorization or authoritative retrieval fails;
- [x] permission-filtered capabilities and privacy-minimal audit evidence in Resident/Admin surfaces.

Initial mutation scope remains narrow. High-risk finance, privacy, governance, access-control and destructive actions remain read-only until separately approved.

Exit gate:
- cross-role and selected-property negative tests fail closed;
- no unconfirmed generic mutation path;
- retrieval evidence is tenant scoped and excludes prompt/payload text;
- exact-head CI, Security/Privacy, Cross-role, Role UAT, Policy, Pilot, Staging and readiness gates must be green on the closure PR before merge.

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
