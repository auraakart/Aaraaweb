# Aaraagate V4.36 — Architecture Convergence & Technical Debt Closure

Date: 2026-09-21  
Baseline: `develop@ce15ed136acae20f2e27a1e8c358bb506c4537b9`

## Objective

Converge the post-V4.35 codebase around shared contracts, typed mobile boundaries, repository-enforced API drift protection and a single current-state documentation index. This cycle deliberately avoids new product breadth and productionization.

## Ordered slices

1. **V4.36.1 Shared types adoption** — make `@aaraagate/types` a real Admin dependency and use its session contract in high-frequency Admin domains.
2. **V4.36.2 Shared API client adoption** — route Operations Control, Helpdesk, Finance and Governance through `@aaraagate/api-client`.
3. **V4.36.3 Configuration consolidation** — use `@aaraagate/config` for canonical Admin session/config conventions and enforce workspace transpilation.
4. **V4.36.4 Flutter typed-model expansion** — introduce typed service-catalogue and Guard arrival boundary models and stop propagating raw maps through those paths.
5. **V4.36.5 Contract drift protection** — generate and validate a repository API route inventory from Nest controllers and client call-sites, and fail CI on unreviewed drift.
6. **V4.36.6 Documentation & technical-debt reconciliation** — establish a current-capability index, mark superseded marketplace docs, and add an architecture-convergence regression gate.

## Boundaries

- No reduction in server-side authorization, society isolation, SoD, audit or idempotency.
- No production/live-provider claims.
- Shared packages reduce duplication; they do not move domain authority into clients.
- Typed mobile models are introduced at JSON boundaries first; broad UI rewrites are explicitly avoided.
- `main` remains untouched. Promotion target after green develop integration is `staging`.
