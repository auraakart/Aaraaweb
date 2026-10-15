# Aaraagate V4.51.1 — Post-Release Regression Hardening

Date: 2026-09-24  
Target: `develop` after V4.51

## Objective

Close the post-V4.51 health-check findings without widening product scope or changing established resident, guard, admin, finance, gate, community or AI behavior.

## Changes

1. **Post-main health** — replace merge-base ancestry containment with direct canonical-source comparison. Aaraagate promotes releases with squash commits, so branch history may diverge while the source trees are identical. The evidence artifact now records the exact branch and tree SHAs and reports source equivalence.
2. **Resident voice packaging** — after the Android wrapper is generated, configure and verify `INTERNET`, `RECORD_AUDIO` and the Android speech-recognition service query before analysis, tests and APK build. Voice remains draft-only and typed Helpdesk remains the fallback.
3. **Regression contract** — add a V4.51.1 repository checker to prevent ancestry-only post-main health logic or removal of the Android speech packaging prerequisites.
4. **Branch protection** — repository health still reports `develop`, `staging` and `main` as unprotected. The connected GitHub interface can read rules/protection state but exposes no branch-protection/ruleset write operation, so this administrative setting cannot be truthfully changed by this code milestone.

## Functional impact

No application-domain behavior is changed. Billing/payment truth, owner/current-tenant eligibility, payer-private evidence, gate recipient selection, Guard overstay lifecycle, Community boundaries, AI grounding and Helpdesk submission rules remain unchanged.

## Verification

V4.51.1 must pass its static regression contract plus the existing repository structure, API, Admin, Flutter and dependency-security gates. The Resident demo APK workflow must execute the generated-manifest configuration before the APK build.

## Release boundary

Productionization, hosted acceptance, live telephony and physical-device certification remain outside this milestone. Branch protection remains an administrative follow-up until an authorized GitHub ruleset/protection write surface is available.
