# Aaraagate V4.37 — Repository Integrity & Maintainability Closure

Date: 2026-09-21

## Objective

Close the repository-health recommendations identified after V4.36 without adding product breadth or making productionization claims. The cycle strengthens maintainability, release discipline, test diagnostics and architectural convergence while preserving current runtime behavior.

## Slices

1. **V4.37.1 Repository integrity gate** — CI enforces the canonical app/package boundaries, retired-surface removal, current-state documentation and an explicit Admin console growth ceiling.
2. **V4.37.2 Admin regression normalization** — preserve the existing regression coverage while grouping tests into core, finance/governance, operations and UI-contract suites for clearer failure diagnosis.
3. **V4.37.3 Admin decomposition guardrail** — prevent further growth of the legacy Admin console; new behavior must be extracted into focused modules/components rather than enlarging the shell.
4. **V4.37.4 Typed-boundary continuation** — continue replacing raw mobile/API maps opportunistically at high-risk JSON boundaries; broad rewrites remain out of scope.
5. **V4.37.5 Release topology clarity** — document the canonical promotion flow as feature branch → develop → staging → main and avoid special ancestry-repair branches unless recovery is genuinely required.
6. **V4.37.6 Git governance closure** — repository CI defines the required validation contract. GitHub branch/ruleset settings should require the corresponding checks for protected branches; this setting is external to source code and must be verified separately.

## Repository invariants

- Canonical runtime surfaces are `apps/admin`, `apps/resident`, `apps/guard` and `services/api`.
- Retired `apps/security` and `apps/web` surfaces must not return.
- Shared TypeScript contracts remain in `packages/types`, `packages/api-client` and `packages/config`.
- Server-side authorization, society isolation, SoD, auditability and idempotency remain authoritative.
- No product behavior is weakened to simplify repository structure.
- Productionization, live-provider certification and real-world acceptance remain excluded.

## Branch governance target

The canonical branch flow is:

`feature/* → develop → staging → main`

Required checks should include repository integrity, API validation, Admin validation, Flutter validation and dependency security. Branch settings are intentionally treated as repository governance rather than application code and should be verified in GitHub after this cycle lands.

## Completion evidence

V4.37 is repository-complete when:

- `pnpm check:v4.37` passes;
- normal CI remains green;
- Admin regression coverage is preserved through named suites;
- the canonical branch model is documented consistently;
- no retired runtime surface is reintroduced;
- the oversized Admin shell cannot silently grow beyond the recorded ceiling.
