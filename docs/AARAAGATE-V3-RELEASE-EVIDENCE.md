# Aaraagate V3 Release Evidence

Version: 3.x post-audit integration candidate  
Status: Repository implementation evidence complete; external production acceptance still required  
Target branch: `develop`  
Release branch policy: `main` promotion remains a separate manually approved action.

## Purpose

This record maps the Aaraagate V3 program to repository evidence and makes a strict distinction between what automated code/CI can prove and what requires real production providers, hardware, infrastructure or pilot users.

## Integrated milestone evidence

### V3.1 — Integrated baseline hardening
- Tenant/property isolation and role-negative contracts remain part of CI and role/security review workflows.
- Resident, Admin, Guard and API validation are exercised by the main CI workflow.
- Multi-property and independent-home boundary tests remain in the Resident test suite.

### V3.2 — Society Finance Engine
- Finance/ledger/payment reconciliation implementations and contract tests are integrated.
- Production merchant credentials and live gateway certification remain external acceptance items.

### V3.3 — Guard App 2.0
- Offline queue/recovery, unit lookup, delivery/cab quick arrivals, watchlists, overstay, material/move passes, patrol checkpoints and incidents are integrated.
- Post-audit hardening adds auditable shift handover with incoming-guard acknowledgement.
- Post-audit hardening adds a dedicated school-transport pickup/drop workflow through the existing resident approval, audit and realtime access pipeline.
- Guard analyze/tests are required by CI.
- Real gate-device field performance remains external acceptance evidence.

### V3.4 — Services Marketplace 2.0
- Society and independent-home service journeys, booking lifecycle, provider dispatch, gate timeline, completion/rating and warranty/history surfaces are integrated.
- Real commercial provider/payment rollout remains external acceptance evidence where credentials are required.

### V3.5 — Facility & Society Operations ERP
- Asset, maintenance, vendor/procurement, utility, inventory/spares and staff-task workflows are integrated with finance/audit boundaries.

### V3.6 — AI-assisted Operations 1.0
- Read summaries remain permission/tenant scoped.
- Mutating AI actions continue to require explicit confirmation and delegate to normal domain services rather than bypassing authorization.
- Post-audit hardening expands confirmed actions to:
  - create helpdesk ticket;
  - create amenity booking;
  - create visitor pre-approval/pass.
- Action-specific permissions prevent a permission from one domain being reused to confirm a different domain action.
- AI execution remains bounded by existing domain-service validation.

### V3.7 — Access Integration Platform
- ANPR, boom-barrier and RFID simulator contracts are integrated.
- Simulator state is society-scoped.
- Real vendor protocol/hardware certification remains external acceptance evidence.

### V3.8 — Governance & Community Administration
- Governance audience, ownership/occupancy visibility and audit behavior are integrated and role scoped.

### V3.9 — Analytics, Localization & WhatsApp
- Analytics derives from authoritative operational sources.
- Eight-language critical Resident gate vocabulary is integrated.
- Post-audit CI regression coverage requires every supported language map to contain the complete current English critical gate vocabulary, preventing silent missing-key fallback for that localized scope.
- WhatsApp remains provider-interface based with a simulator in repository CI. A real approved Meta/BSP provider and templates remain external acceptance items.

### V3.10 — Staging, Pilot & Production Readiness
- Redis runtime reliability contract is integrated.
- PostgreSQL migration/backup/restore smoke is integrated.
- Object-storage removal cleanup/retry hardening is integrated.
- Access-integration tenant isolation, Guard supervisor audit attribution and Universal Search society-operator visibility fixes are integrated.
- CI, Security/Privacy, Role UAT, Policy, Staging Pilot contract and Pilot Acceptance contract are required evidence before integration.

## Automated quality gates

The integration candidate is expected to pass the repository workflows applicable to its exact head, including:
- CI: repository structure, API lint/typecheck/tests/build/readiness, Admin validation, Resident analyze/tests, Guard analyze/tests and dependency security;
- Backup restore smoke;
- V2 Security Privacy Review contract;
- V2 Role UAT contract;
- V2 Policy Pilot contract;
- V2 Staging Pilot Execution contract;
- V2 Pilot Acceptance contract;
- V3 Runtime Reliability when its path filters apply.

The V2-named contracts remain useful inherited acceptance contracts; their names do not imply that post-V3 code is exempt. They execute against the candidate code and protect the established role/security/pilot invariants.

## External production acceptance — not proven by repository CI

The following must not be represented as production-proven until real environment evidence exists:

1. **Payment gateway** — real merchant credentials, signed production webhooks, replay/reconciliation behavior and settlement evidence.
2. **Push notifications** — real FCM/APNs credentials, Android/iOS device fleet delivery, invalid-token cleanup and provider outage behavior.
3. **WhatsApp** — approved BSP/Meta credentials, approved templates and real delivery callbacks.
4. **Access hardware** — real ANPR/RFID/boom-barrier vendor protocols, device failure modes and field latency.
5. **Production infrastructure** — deployed DNS/TLS, production secrets, object storage lifecycle configuration, monitoring/error-tracking destinations and alert routing.
6. **Representative performance/load** — p95/p99 and throughput measurements using production-like data volume, concurrent users and infrastructure. CI smoke timing is not a substitute for this evidence.
7. **Controlled pilots** — signed/recorded society pilot and independent-home pilot using representative users, policies and data.
8. **Accounting/legal review** — society-specific GST/TDS/statutory treatment where applicable.

## Post-audit hardening included in this candidate

- Expanded AI low-risk actions through existing domain services and action-specific permissions.
- Added Guard shift handover lifecycle and acknowledgement.
- Added Guard school-transport arrival workflow without weakening generic access-type validation.
- Added localization completeness regression coverage for the current critical Resident gate vocabulary.

## Release decision

Repository evidence can support merging this hardening candidate to `develop` once its exact-head workflows are green. It does **not** itself authorize production promotion. Promotion to `main` remains a separate explicit manual decision after the external production acceptance items required for the intended rollout have evidence or formally accepted waivers.
