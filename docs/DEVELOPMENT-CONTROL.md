# Aaraagate Development Control

Updated: 2026-09-12

This repository is the active development baseline for Aaraagate. Changes must remain aligned with `PRODUCT_REQUIREMENTS.md`, `AARAAGATE-V2-PROGRAM.md`, `REQUIREMENTS-TRACEABILITY.md`, architecture decisions and the security/role model. Implementation should proceed as coherent vertical slices rather than isolated UI or schema work.

## Current priority
Execute the Aaraagate V2 programme while preserving the validated V1 production baseline.

Current sequence:
1. V2 foundation: source-of-truth documents, bounded contexts, permission/segregation-of-duties baseline and audit/privacy design.
2. V2.1A accounting foundation: ledger, accounts, funds, immutable journal entries and auditable adjustments.
3. V2.1B receivables and reconciliation: charge generation, unit receivables, payment allocation, gateway reconciliation and bank reconciliation.
4. V2.1C occupancy lifecycle: move-in/move-out, tenancy documentation and authorization transitions.
5. V2.1D governance/emergency/privacy/payment-exception workflows.
6. V2.2 operational depth: assets/AMC/work orders, society vendors/procurement, helpdesk SLA, communications, documents, amenities and parcel desk.
7. V2.3 optional/advanced modules: parking, meters/utilities, analytics, integrations and later hardware/AI capabilities.
8. V2.4 full regression, migration/rollback verification, structured UAT and pilot validation before production promotion.

## Development authority and approval policy
- Feature implementation does not require GitHub approval for every feature-wise commit.
- Feature branches may be created, updated and integrated into `develop` after relevant automated checks are green and the change is internally consistent with the approved V2 requirements.
- `develop` is the continuous integration branch for completed V2 slices; it should not be blocked waiting for release approval.
- `staging` is the controlled release-validation branch and may receive consolidated milestone candidates for migration, smoke, security and UAT validation.
- **Any update to `main` requires explicit GitHub approval.** This is the human approval boundary for production-release changes.
- `main` updates must be deliberately limited. Prefer consolidated, release-ready milestone promotions rather than feature-by-feature merges to `main`.
- No feature branch should target `main` directly except an explicitly approved emergency hotfix.
- Do not bypass failing CI, required security gates or migration validation simply because a feature commit does not require human approval.
- Do not force-push protected release branches or overwrite unrelated work.

## Main-branch discipline
The purpose of limiting `main` updates is to keep the production baseline stable and auditable.

A `main` promotion should normally contain a coherent release candidate that has already been validated on `develop` and `staging`. Before requesting approval for `main`, the candidate must have:
- green required CI;
- clean/repeatable migrations;
- relevant security and authorization regression evidence;
- staging startup/health and critical functional smoke evidence;
- rollback/release SHA recorded;
- UAT evidence appropriate to the milestone risk;
- no unresolved critical/high blocker.

Small documentation-only or operational metadata changes should be batched with the next suitable release where practical instead of creating unnecessary `main` churn.

## Usage-efficient execution policy
To minimize agentic/Codex usage without reducing quality:
- Treat `PRODUCT_REQUIREMENTS.md` as the product-scope source of truth.
- Treat `AARAAGATE-V2-PROGRAM.md` as the V2 programme and sequencing source of truth.
- Treat `REQUIREMENTS-TRACEABILITY.md` as the feature-status and acceptance source of truth.
- Treat this file as the execution/governance source of truth.
- Inspect only the affected modules plus direct authorization/data-flow dependencies for normal feature slices.
- Batch related work into coherent vertical slices instead of repeated micro-fixes.
- Use targeted unit/integration/widget tests while developing; use full CI at integration and milestone boundaries.
- Diagnose CI failures from the failing job/log first rather than re-auditing the repository.
- Reuse established architecture, role, security and UX decisions unless requirements change.
- Update traceability when milestone acceptance materially changes.
- Reserve full-repository security/regression review for major release boundaries or cross-cutting architecture changes.

## Required engineering gates
Before a feature slice is integrated into `develop`, relevant gates must include:
- deterministic dependency installation;
- Prisma schema validation/client generation where applicable;
- clean-database migration validation for schema changes;
- API lint, typecheck, targeted tests and build where relevant;
- Admin typecheck/build for Admin changes;
- Resident/Guard Flutter analysis and tests for mobile changes;
- high/critical dependency security audit at integration boundaries;
- tenant-isolation and permission tests for privileged or tenant-owned operations;
- negative authorization tests for new administrative permissions;
- audit-event coverage for privileged mutations.

Before `main`, additionally require production-style staging validation, release/rollback evidence, UAT/security approval and any required backup/restore evidence.

## V2 architectural guardrails
- Society remains the primary tenant boundary. Every society-owned record and operation is society-scoped server-side.
- UI visibility is never an authorization boundary.
- Relationship roles (Owner/Tenant/Family) stay separate from operational roles and permissions.
- Accounting authorization is separate from payment-gateway authorization and from general Society Admin powers.
- Financial history is append-only/auditable: use reversals/adjustments rather than destructive rewriting of posted entries.
- Society vendors/procurement are separate from consumer External Services marketplace providers.
- Commercial marketplace placement/tier remains separate from provider verification/trust and society approval.
- Ownership and occupancy remain independent; gate routing follows active occupancy, not ownership.
- Privacy/data lifecycle mutations require explicit scoped permissions and audit evidence.
- Resident UX remains simple; complex finance/governance/facility/procurement administration belongs primarily in Admin/Operations surfaces.

## Security control
Every tenant-owned request and mutation must be society-scoped. Authorization must be server-side and based on membership, capability permission, relationship/resource scope and feature entitlement where applicable. Cross-society access must fail closed.

Ownership alone must not grant occupancy-private access or routine gate authority. Routine gate notifications and approvals follow configured active occupants. Maintenance dues remain payable according to the approved owner/current-tenant policy while broader owner-only property finance remains protected. General broadcasts must honor the configured audience.

Reports, exports and audit views must preserve the same authorization constraints as their source operations and must not widen access through aggregation or download endpoints.

## Definition of done
A V2 feature is complete only when requirement mapping, tenancy/authorization, validation, privacy/audit implications, migrations where relevant, targeted tests, client UX states, operational failure handling and traceability are complete. Cross-cutting finance, authorization, data-migration or privacy changes require milestone-level regression before staging/main promotion.

## CI status checkpoint and no-repoll policy (V4.89, 2026-10-09)

Prevent avoidable development stalls from repeated GitHub polling:

1. Read develop/staging/main once per slice, resolve exact PR head and scope; repository state is authoritative.
2. Publish one coherent PR. Allow required GitHub CI and Develop auto merge to run normally. Do not recreate slices that are already merged.
3. If workflow is still running and no action is possible, record the PR URL/run ID and report the pending gate. Do not continually poll each job or make unverified progress claims.
4. Once GitHub reports completion, verify PR merged status and develop branch head rather than assuming auto-merge succeeded. A manual merge is justified only when a green PR remains open at its exact tested head.
5. On failures, inspect that one failed job, patch narrowly, then run selective tests before required CI on the new head.
6. Preserve protected staging/main and independent release approvals. External queue latency and review timing cannot be guaranteed, but the redundant operator polling loop is avoidable.

## Bot-authored synchronize deadlock remediation (2026-10-09)

Root cause: `Develop auto merge` used `github.token` to call the GitHub
`/pulls/{number}/update-branch` API after concurrent development merges.
GitHub-suppressed `pull_request` workflow creation for these bot-authored
head updates. The new head thus had **no valid CI checks**, and the workflow
was `action_required`. Repeating the bot update did not fix this state.

Preventive controls:
- The CI auto-merge job **must never write to the PR branch** with `github.token`.
- If `develop` advanced, fail the stale exact-head merge gate with a clear
  actionable error. An independently authorized repository actor synchronizes
  the PR branch once, triggering a real `pull_request` workflow and required
  checks on the new SHA.
- Merge only an exact, latest, green PR head; never reuse old commit checks and
  never turn required CI off.
- Keep only one **non-draft**, merge-eligible mastermind PR active at a time;
  other feature slices can be prepared as drafts but are promoted only after
  current PR integration and branch synchronization. This reduces stale-base
  churn and runner waste.
- The regression test in `scripts/release-delay-controls.test.mjs` rejects
  reintroduction of token-driven PR updates. No additional `staging` or `main`
  commits are required.

These controls eliminate the observed bot-generated CI deadlock, but they do
not guarantee zero waiting for external runners or future independent reviews.
