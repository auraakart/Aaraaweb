# Aaraagate Development Control

Updated: 2026-09-03

This repository is the active development baseline for Aaraagate. Changes must remain aligned with the product requirements and requirements traceability documents and should be implemented as complete vertical slices.

## Current priority
Complete the Domestic-help/workforce user journeys and operational UX vertical slice.

Execution order:
1. Close Resident assignment, leave and rating journeys plus Society Admin verification, rejection, suspension and reinstatement operations.
2. Verify schedule-, assignment-, worker- and occupancy-aware gate eligibility and attendance lifecycle behavior.
3. Harden workforce attendance concurrency, idempotent offline recovery, guard-session isolation, notifications and auditability.
4. Run targeted workforce/guard/resident tests first, then protected CI and staging smoke/E2E appropriate to workforce access risk.
5. Promote the validated Domestic-help/workforce milestone through staging and main using the standard release path.

Maintenance/Billing and Visitor/Guard are validated release baselines. Live payment-gateway activation remains environment/configuration dependent rather than a blocker to the gateway-independent product milestone.

## Next milestone sequence
After Domestic-help/workforce closure, proceed in this order unless a blocking defect changes priority:
1. Society Admin operational completeness across the remaining V1 modules.
2. Essential V1 reports and operational audit views.
3. Household-services marketplace/service-booking lifecycle completion.
4. Resident/Admin/Guard UX and design-system consistency pass.
5. Consolidated security, tenant-isolation, permissions and regression review.
6. Production-readiness work: observability, backup/restore validation, UAT, pilot rollout and deployment/rollback readiness.

## Usage-efficient execution policy
To conserve agentic/Codex usage without reducing quality:
- Treat `PRODUCT_REQUIREMENTS.md` as the product-scope source of truth.
- Treat `REQUIREMENTS-TRACEABILITY.md` as the feature-status and acceptance source of truth.
- Treat this file as the current execution-order source of truth.
- Do not perform a full-repository review for every milestone or every "proceed" request.
- Start each milestone from the current target and inspect only the affected modules plus direct authorization/data-flow dependencies.
- Batch related changes into one coherent vertical slice instead of creating repeated micro-fixes.
- Run targeted unit/integration/widget tests while developing; run full CI at milestone integration or release boundaries.
- Diagnose CI failures from the failing job/log first instead of re-auditing the repository.
- Reuse established architecture, role, security and UX decisions unless the requirement itself changes.
- Update traceability and this execution state when a milestone materially changes status.
- Reserve full-repository security/regression review for major release boundaries or when a cross-cutting architectural change justifies it.

## Branch and release policy
- `develop` is the active integration branch.
- `staging` is the release-validation branch for production-style migrations, build/startup smoke tests, critical functional smoke/E2E tests and UAT preparation.
- `main` remains the stable release branch.
- Production promotion path is `develop` → green CI → `staging` → green release validation/UAT/security approval → `main` → production.
- Do not merge a large `develop` delta directly to `main` merely because compilation succeeds.
- Do not overwrite unrelated existing work.
- No force-push or branch deletion should be allowed on protected release branches once GitHub protection is configured.

## Required engineering gates
Before a change is considered release-ready, relevant gates must include:
- Clean dependency installation from a deterministic lockfile once lockfile hardening is complete.
- Prisma schema validation and client generation.
- Prisma migrations against a clean PostgreSQL database.
- API lint, typecheck, tests and production build.
- Admin typecheck and production build.
- Resident/guard Flutter analysis and tests where present.
- High/critical dependency security audit.
- Tenant-isolation and permission tests for privileged/tenant-owned operations.
- Staging smoke validation for production startup and health.
- Functional smoke/E2E for critical workflows before production promotion.

## Security control
Every tenant-owned request and mutation must be society-scoped. Authorization must be server-side and based on membership, role, permission and feature entitlement where applicable. UI hiding is never an access-control boundary. Cross-society access must fail closed.

Ownership and occupancy are independent. Ownership alone must not grant occupancy-private access or routine gate authority. Routine gate notifications and approvals follow configured active occupants. Maintenance dues are payable by verified owners or current tenants for their respective unit, while broader property finance remains owner-only. General broadcasts must honor the Admin-selected owner-only or owner-and-occupants audience.

## Definition of production readiness
Production readiness requires UI states, input validation, authorization, tenant isolation, entitlement enforcement, audit review, automated tests, repeatable migrations, dependency security, staging validation, observability, backup/restore readiness, UAT and documented acceptance criteria.
