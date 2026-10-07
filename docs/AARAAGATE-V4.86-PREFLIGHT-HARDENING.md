# Aaraagate V4.86 — Mastermind Preflight Hardening

## Why this patch exists

The V4.86 product implementation was correct, but the first PR required multiple CI cycles because three compatibility defects were discovered only after the expensive full matrix had already started:

1. a Resident privacy widget test assumed a lazily built card was already in the tree after new transparency content lengthened the screen;
2. existing Reports outcome tests did not add one mocked SQL result after the new gate-fallback aggregate query was introduced;
3. the Resident app constructor gained a required Easy Mode dependency and existing smoke harnesses were not updated.

These were validation-order problems, not production architecture failures.

## Permanent control

A new **Mastermind preflight** job runs before API/Admin/Flutter/dependency full validation on pull requests.

The preflight:
- derives the actual changed surface from the PR base/head;
- for API changes: generates Prisma, runs lint and typecheck, then uses Vitest related-test discovery for changed API source plus directly changed specs;
- for Admin changes: runs Admin typecheck;
- for Resident changes: runs Flutter analysis first, then the established risk-weighted Resident behavioural suite;
- for Guard changes: runs Flutter analysis and the established risk-weighted Guard suite;
- stops the expensive full matrix from fanning out when compatibility preflight is red.

The same logic is available locally as:

`bash scripts/mastermind-preflight.sh <base-sha> <head-sha>`

## Execution discipline

Future mastermind cycles must:
1. create `mastermind/*` branches;
2. batch implementation before the first PR push;
3. run the preflight contract before considering the branch ready for full CI;
4. freeze the branch while CI is running;
5. change the branch only for concrete failed evidence;
6. verify the PR actually merged and the target branch moved, rather than treating a green controller job as proof of merge.

## Boundaries

This patch changes CI orchestration only. It does not alter V4.86 product behavior, release identity, hosting, external integrations, gate authority, payment authority, or productionization.
