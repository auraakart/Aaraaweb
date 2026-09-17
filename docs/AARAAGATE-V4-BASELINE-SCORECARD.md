# Aaraagate V4.0 Baseline Lock and Competitive Scorecard

Date: 2026-09-18  
Milestone: V4.0  
Status: Baseline evidence prepared for integration  
Integration branch: `develop`  
V4 program merge SHA: `e837bbee7099a63106c951984286b3d096df8bd9`

## Purpose

V4.0 establishes the exact engineering and product baseline from which Aaraagate V4 will be measured. It prevents scope drift, records the current quality evidence, identifies release-blocking debt, and maps every score gap to a V4 milestone.

This scorecard is analytical product/engineering scoring, not an app-store rating. Planned-only capability does not count. Repository implementation, automated validation and explicitly identified external evidence are kept separate.

## Locked V4 baseline

The V4 program was merged to `develop` after all PR-triggered workflows on its exact head passed. The baseline immediately before V4 implementation already contained the completed post-V3 hardening set: permission-aware AI action expansion, Guard shift handover, school-transport workflow, localization completeness regression coverage and consolidated V3 release evidence.

The V4 implementation baseline is therefore:

- `develop` integration SHA after V4 program merge: `e837bbee7099a63106c951984286b3d096df8bd9`.
- V4 scope authority: `docs/AARAAGATE-V4-PROGRAM.md`.
- Prior implementation evidence: `docs/AARAAGATE-V3-RELEASE-EVIDENCE.md`.
- Staging and main are intentionally not part of normal V4 milestone promotion.

## Baseline automated quality evidence

The exact V4 program candidate completed the following pull-request workflows successfully before merge:

- CI;
- V2 Security Privacy Review;
- V2 Role UAT Contract;
- V2 Policy Pilot Contract;
- V2 Staging Pilot Execution Contract;
- V2 Pilot Acceptance Contract.

The CI workflow verifies the following repository baseline:

### API
- clean PostgreSQL migration application;
- Prisma schema validation and client generation;
- lint;
- TypeScript typecheck;
- API test suite;
- production build;
- production-mode startup and readiness checks;
- database and Redis-backed auth-state readiness.

### Admin
- authorization/access-boundary tests;
- typecheck;
- production build.

### Resident mobile
- Flutter dependency resolution;
- static analysis;
- Flutter test suite.

### Guard mobile
- Flutter dependency resolution;
- static analysis;
- Flutter test suite.

### Repository/security
- repository structure and branding-boundary checks;
- release/staging contract checks;
- production preflight exercise;
- high/critical npm dependency audit.

This is sufficient to mark the repository baseline as green for V4.0. It is not equivalent to production pilot evidence.

## Open-work classification

At baseline-lock time there are no open pull requests targeting `develop`.

The known open staging/acceptance items are not application-code P0/P1 defects in the V4 baseline. In particular, the existing hosted-staging blocker records missing external staging API configuration and explicitly states that no application-code defect was identified from that failed hosted acceptance run. Older UAT evidence also remains environment/manual-acceptance work rather than a V4 repository baseline regression.

### P0/P1 baseline decision

- P0 application defects: none identified from current repository/CI evidence.
- P1 application defects that invalidate V4 implementation: none identified.
- External acceptance blockers: present and retained as final-release evidence requirements; they do not block V4 code development.

If a later milestone exposes a true baseline regression, it must be classified against this record rather than silently absorbed into feature scope.

## Competitive baseline score

The V4 starting score is locked to the previously reviewed implementation assessment:

| Dimension | V4 baseline | V4 target | Primary milestone ownership |
| --- | ---: | ---: | --- |
| Gate and security | 8.4 | >= 9.0 | V4.2 Guard Operations 3.0; V4.7 access integration where applicable |
| Resident experience/features | 8.7 | >= 9.0 | V4.2, V4.6, V4.8 |
| Accounting/billing/ERP | 7.4 | >= 8.6 | V4.1 RWA Finance and Reconciliation |
| Administration/governance | 8.2 | >= 8.7 | V4.1, V4.5, V4.8 |
| Amenities/community/services | 8.4 | >= 8.8 | V4.4 reliability, V4.6 AI workflows, V4.8 UX/analytics |
| Architecture/platform design | 8.8 | >= 9.0 | V4.4, V4.5, V4.7 |
| Differentiation potential | 9.3 | >= 9.3 | Preserve through V4; strengthen via V4.6 AI and multi-property/home continuity |
| Production/field readiness | 6.3 | >= 8.0 before pilot | V4.3 migration, V4.4 reliability, V4.5 trust, V4.9 final evidence |
| Overall competitive score | 7.9 | >= 8.6 | Whole V4 program |

## Score-gap interpretation

### Largest gap: Accounting/ERP
The biggest competitive drag is not absence of billing, but the need for deeper finance evidence: opening balances, reconciliation depth, adjustments, bank statement import, payables, budgets, funds, accountant exports and stronger invariant testing. This is why V4.1 is first after baseline lock.

### Second largest gap: Production/field readiness
Repository quality is materially stronger than the raw 6.3 field-readiness score suggests, but real production credentials, realistic load, real devices/hardware, hosted infrastructure and controlled pilots remain external evidence gaps. V4.3-V4.5 reduce the software-side uncertainty before those proofs are attempted.

### Gate operations gap
Guard capability breadth is already strong. V4.2 is therefore focused on deterministic offline behavior, speed, low-connectivity recovery, multilingual/low-literacy usability and measurable workflow latency rather than adding broad new gate feature categories.

### Differentiation
Independent-home mode, multi-property identity, External Services, AI-assisted operations and the link between service booking and physical access remain strategic differentiators. V4 must preserve these while deepening maturity elsewhere.

## Evidence checklist by milestone

### V4.1 Finance
- ledger invariant tests;
- opening-balance migration tests;
- duplicate payment/webhook tests;
- bank-reconciliation mismatch tests;
- finance-role segregation;
- resident dues/receipt and admin-finance end-to-end evidence.

### V4.2 Guard
- offline/online transition tests;
- retry/dedup/conflict tests;
- low-connectivity behavior;
- localization completeness;
- <=5-second routine pre-approved flow target under normal test conditions;
- <=3 primary taps for routine high-frequency actions where practical.

### V4.3 Migration
- validation/dry-run evidence;
- duplicate/referential-integrity tests;
- large-import performance evidence;
- rollback evidence;
- opening-balance reconciliation;
- cross-society isolation.

### V4.4 Reliability
- failure-injection tests;
- concurrency and double-submit protection;
- retry/idempotency contracts;
- notification deduplication;
- backup/restore evidence refresh;
- no unresolved P0/P1 reliability defect.

### V4.5 Privacy/security
- tenant/property isolation negatives;
- consent/retention/access-log coverage;
- session/device revocation;
- object authorization;
- privileged-action audit evidence.

### V4.6 AI
- tenant/permission negative tests;
- explicit confirmation for consequential actions;
- all mutations through existing domain APIs;
- authoritative-data grounding for operational answers.

### V4.7 Access integration
- vendor-neutral adapter contracts;
- simulator contract tests;
- idempotent command/event handling;
- manual fallback when integrations fail.

### V4.8 Analytics/UX
- authoritative event sourcing for KPIs;
- critical journey analytics;
- accessibility/localization review;
- outcome dashboards tied to measurable operational metrics.

### V4.9 Final release consolidation
- complete regression suite;
- security/tenant/finance/offline/migration checks;
- release evidence pack;
- competitive re-score >= 8.6;
- one staging promotion only after V4 completion;
- main promotion only after explicit release approval and final gates.

## Scope-control rules established by V4.0

1. New feature ideas discovered during V4 are deferred unless they directly close a documented score gap or resolve a P0/P1 defect.
2. Milestones should deepen existing bounded contexts rather than create parallel implementations.
3. Staging/main are not used as iterative development branches.
4. One milestone branch and one primary PR should be the default.
5. Targeted tests are used during implementation; broad regression occurs at milestone boundaries.
6. External credentials/hardware cannot become reasons to stall repository work when simulator/contract evidence is possible.
7. No milestone may claim score improvement without implemented and tested evidence.

## V4.0 exit decision

V4.0 exit criteria are satisfied when this scorecard PR is green and merged:

- the V4 `develop` baseline is known and green;
- competitive scores and targets are documented;
- score gaps are assigned to milestones;
- no unowned repository P0/P1 baseline defect exists;
- external acceptance blockers are explicitly separated from implementation blockers.

Upon V4.0 integration, the next implementation milestone is **V4.1 — RWA Finance and Reconciliation Hardening**.
