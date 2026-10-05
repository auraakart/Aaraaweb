# Aaraagate V4.81.3 — Main Validation Reuse & Post-Main Concurrency Hardening

## Root cause

V4.81.2 exposed a release-orchestration inefficiency rather than a product defect. The exact staging tree had already passed protected API, Admin, Flutter, dependency, security, performance and cross-role validation before the main merge, but the generic `push: main` CI path unconditionally started the expensive API/Admin/Flutter/dependency suites again.

A second latent coupling existed in post-main health: it required `develop`, `staging` and `main` to remain byte-for-byte identical. Staging is the authoritative release source for main; Develop may advance to the next cycle after staging is frozen. Treating normal develop progress as a release failure would create unnecessary serialization and future delays.

## V4.81.3 control

On a push to main, canonical CI now compares the promoted main tree with the current staging tree.

When the main tree is the **exact staging tree**:

- Repository Structure and its semantic/security invariants still run.
- Required wrapper checks still resolve normally.
- Duplicate full API, Admin, Flutter and dependency-audit suites are skipped because that immutable staging tree already passed the protected pre-main PR gates.
- Post-main health, CodeQL, supply-chain evidence and Resident demo artifact workflows remain independent.

If main differs from staging for any reason, CI uses **fail-safe full validation** and runs all expensive suites. There is no trust-by-branch-name shortcut.

## Post-main health

Post-main health remains fail-closed on staging/main source drift. Develop may advance without invalidating the released main tree; its alignment is recorded as evidence instead of being a failure condition.

This allows the next development cycle to proceed without forcing the develop branch to remain frozen until all post-main workflows finish.

## Safety boundary

This optimization **does not weaken**:

- staging exact-tree promotion;
- full protected pre-main validation;
- independent main review;
- explicit owner approval for main;
- CodeQL or supply-chain checks;
- post-main source-equivalence verification;
- demo APK generation.

It removes duplicate execution only when source identity proves the expensive validation already ran against the same release tree.

## Release identity

- Root/API/Admin: `4.81.3`
- Resident/Guard: `4.81.3+48103`

Productionization and external-provider evidence remain outside this release-orchestration milestone.
