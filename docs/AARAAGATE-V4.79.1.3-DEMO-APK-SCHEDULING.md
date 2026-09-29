# Aaraagate V4.79.1.3 — Demo APK PR Scheduling

Date: 2026-09-29

## Root cause

The Resident Demo APK workflow ran on every Resident pull request even though repository completion evidence explicitly classifies it as supplementary packaging evidence rather than a protected merge requirement. The workflow repeats Resident dependency resolution, analysis and tests, then performs an Android debug build. Under constrained GitHub Actions concurrency this packaging job could occupy the final available runner while the canonical `CI` workflow waited in the queue.

The direct demo release was already published only from a push to `develop`, so the PR-time run did not publish the artifact residents actually consume.

## Fix

- Remove the `pull_request` trigger from `.github/workflows/resident-demo-apk.yml`.
- Preserve automatic builds on pushes to `develop` and `main`.
- Preserve `workflow_dispatch` for explicit packaging checks.
- Preserve the existing Flutter 3.47 compatibility, speech-permission configuration, fixture verification, Resident analysis/tests and debug APK build.
- Preserve direct `resident-demo-latest` publication on merged `develop` commits.
- Add a semantic repository guard preventing the supplementary APK workflow from returning to PR-time runner contention.

## Quality boundary

Protected pre-merge quality remains with Repository structure, API validation, Admin validation, Flutter validation and dependency security. Resident analysis/tests continue there. Demo APK packaging still executes automatically immediately after a Resident change merges to `develop`, so packaging evidence is retained without blocking source integration.
