# Aaraagate V4.79.1.1 — CI Scope Hardening

Date: 2026-09-29  
Baseline: `develop@3960355dd16ccf082e209135a1d3f3ca3ca7c789`

## Root cause

V4.79 development was repeatedly paying for unrelated full-surface validation because every milestone semantic guard lives under `scripts/`, while the CI change-scope detector classified **all** `scripts/` changes as cross-cutting. In addition, each new V4.79 guard required another edit to `.github/workflows/ci.yml`, which itself forces API, Admin and Flutter validation.

That created a feedback loop: a narrow API/Admin milestone could wake Flutter, and adding the next repository contract changed CI again.

## Fix

1. Versioned semantic contract files matching `scripts/check-v*.mjs` no longer activate API/Admin/Flutter by themselves.
2. Runtime/build scripts remain cross-cutting and still activate all surfaces.
3. V4.79 repository contracts are auto-discovered by one Repository structure step using `scripts/check-v4.79*.mjs`.
4. Future V4.79 slices therefore do not need to edit `ci.yml` merely to register a semantic guard.
5. Actual runtime paths remain authoritative for scope: API changes run API validation, Admin changes run Admin validation, Resident/Guard changes run Flutter validation.
6. Unknown runtime paths and package/build configuration continue to fail safe to full validation.

## What this does not weaken

- Required check names and branch protection are unchanged.
- Repository structure still runs every V4.79 semantic guard.
- Main remains approval-gated.
- Milestone-boundary full regression can still be requested explicitly through cross-cutting/runtime changes.
- Productionization evidence remains separate.
