# Aaraagate V4.50 — Reliability & Experience Convergence

Date: 2026-09-23  
Baseline: `main@bf79664318ba43e8668d2fb397722dc29bfffeb1`

## Objective

Close the post-V4.49 reliability gaps without widening productionization or hardware scope. V4.50 focuses on database-enforced gate idempotency, evidence-grounded safety prioritisation, coordinated Admin authentication recovery, Admin shell maintainability and policy-correct billing copy.

## Implemented slices

1. **Concurrent-safe overstay escalation** — an append-only migration adds a canonical `SecurityIncident.sourceKey`, backfills one canonical legacy incident per access request, and adds a society/category/source unique index. Escalation locks the source `AccessRequest` inside a transaction before checking/inserting.
2. **Grounded gate AI** — the Action Centre retains one permission-scoped gate query while returning the actual oldest open critical incident, oldest visitor overstay and stalest patrol checkpoint. An open CRITICAL gate incident outranks other cards at the same HIGH severity.
3. **Admin session reliability** — the canonical Admin client coordinates refreshes per society/role, reuses current stored credentials and retries a request once after an unauthorized response. Provider operator sessions remain separate.
4. **Admin maintainability and policy copy** — marketplace and maintenance billing move out of the Admin console shell; billing copy reflects owner/current-tenant eligibility and payer-private data separation.
5. **Operator-facing AI explanation** — recommended focus, why-now evidence and next step are visible while the Action Centre remains read-only.

## Verification

Repository CI must pass the V4.50 regression contract, clean PostgreSQL migration deploy, API lint/typecheck/tests/build, Admin tests/typecheck/build, Flutter validation and dependency/security gates before promotion.

## Boundaries

This milestone does not claim hosted production acceptance, live provider integration, physical hardware certification, signed app-store release or real-society pilot acceptance.
