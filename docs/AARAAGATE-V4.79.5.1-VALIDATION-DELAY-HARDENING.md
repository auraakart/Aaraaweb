# Aaraagate V4.79.5.1 — Validation Delay Hardening

Date: 2026-09-29

Baseline: `develop@eee66b1827d42b766db084d392ecd5675acaa49b`

## Root causes closed

### 1. Stale onboarding regression ran too late

V4.79.5 intentionally replaced browser-derived onboarding readiness with the authoritative server plan at `/onboarding/readiness`. The legacy V4.27 Admin regression still expected the old browser fan-out and therefore required one corrective feature-head update.

The V4.79.5.1 semantic guard now executes that V4.27 onboarding regression from the fast Repository Structure gate. Future onboarding architecture drift is therefore detected before expensive Admin validation and before a long PR cycle is consumed.

### 2. Backup Restore scope depended on GitHub PR-files API availability

The first V4.79.5 head produced a false Backup Restore failure because the scope detector received an HTTP 502 from GitHub while calling the pull-request files API. No database backup or restore failure occurred.

The scope detector now:
- checks out the exact repository history with full fetch depth;
- reads PR base/head SHAs from the workflow event;
- computes changed paths locally with `git diff --name-only`;
- never calls the GitHub PR-files API for scope classification.

This removes transient GitHub metadata API availability from the backup-scope decision.

## Narrow CI fast path

The release-control classifier now recognizes changes limited to the Backup Restore `change-scope` job as control-plane-only, while comparing the rest of that workflow byte-for-byte against the PR base. Any change to the actual PostgreSQL drill, staging auto-merge controller, application code, schema, package graph or unrelated workflow still falls back to normal full validation.

## Boundaries

This is CI/repository orchestration hardening only. It does not weaken backup/restore execution when schema/release evidence changes, does not automate main, and does not claim productionization.
