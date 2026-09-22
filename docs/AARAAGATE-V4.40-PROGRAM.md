# Aaraagate V4.40 — Stabilization & Residual Debt Closure

## Goal

Continue the post-V4.39 health recommendations without expanding product scope: reduce remaining repository complexity, move more UI code behind typed boundaries, and make the supported JavaScript runtime explicit.

## Slices

1. **Residual branch review** — retain divergent branches unless canonical containment or exact merged-head evidence proves deletion safe; continue branch-hygiene evidence rather than force deletion.
2. **Admin decomposition** — move legacy operational domain types out of the monolithic Admin console into a dedicated typed contract module.
3. **Guard typed-boundary continuation** — replace parcel-desk and parcel-recipient raw-map boundaries with typed models consumed directly by the Guard UI.
4. **Runtime modernization** — declare Node 22 / pnpm 10 repository runtime support to align local and CI execution.
5. **Regression contract** — add a V4.40 repository check preventing reintroduction of the extracted Admin types or raw Guard parcel boundaries.
6. **Promotion** — after required checks pass, promote the exact validated develop state through staging and then main.

## Non-goals

- No production hosting changes.
- No real payment/KYC/provider configuration.
- No physical hardware integration.
- No weakening of RBAC, tenant isolation, audit, privacy, payment or release gates.

## Acceptance criteria

- Admin console no longer owns the extracted domain type block.
- Guard parcel UI has typed parcel and recipient boundaries.
- Flutter tests cover invalid parcel-recipient identity.
- Node/pnpm baseline is explicit and CI-enforced.
- Existing repository, API, Admin, Flutter and dependency-security gates remain green.
- Branch cleanup stays evidence-driven; unresolved divergent work is preserved.
