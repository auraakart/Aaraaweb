# Aaraagate V4.70.1 — Staging Promotion Hardening

Date: 2026-09-28

## Root cause

Staging supersession validates that staging-only commits are release/reconciliation history. The workflow used shell patterns that recognized only `Release:` and `chore(release):`. Historical repository release commits also use `release(vX.Y):`, so a legitimate V4.68 staging-candidate commit was misclassified as product history. This blocked an otherwise exact-tree V4.70 staging promotion before API smoke execution.

## Permanent fix

- Move release-history subject classification into `scripts/check-staging-release-history.mjs`.
- Accept the repository's supported release subject families case-insensitively:
  - `release:`
  - `release(<version>):`
  - `chore(release):`
- Continue rejecting feature, fix, merge, and arbitrary product-history subjects.
- Run a classifier self-test in normal CI so future release-title variants cannot silently break staging promotion.
- Keep the existing exact-develop-tree, staging ancestry, target freshness, and main/staging divergence protections unchanged.

This changes release validation only. It does not change the V4.70 product tree behavior or weaken staging safety controls.
