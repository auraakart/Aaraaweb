# Parking permit closure lifecycle — 30 October 2026

Batch S; baseline develop `30baf982da9b2decf72cd93580a8a98fbd5737d4` (PR #1543). [PR #1544](https://github.com/auraakart/Aaraaweb/pull/1544).

## Demonstrated defect

The public `ParkingPermit_scope_guard` called creation eligibility checks on terminal updates. Real VisitorVerificationService check-in marks the pass USED and visitor CHECKED_IN; check-out leaves the pass USED and marks the visitor CHECKED_OUT. These normal transitions prevented completing or cancelling an existing permit. Deactivating its slot caused the same failure.

Test-only candidate `486187537e3808b1725450d4e0aff93e49a8476b`, CI `40992401826`, API job `123857830537` reproduced all six failures on clean migrated PostgreSQL (six failed / 22 passed in the workflow group). Four failed with the active approved visitor-pass guard, two with the active-slot guard. No local database acceptance is claimed.

## Forward fix and retained boundaries

New migration `20261030060000_v510_parking_permit_terminal_lifecycle` replaces only the existing trigger function. An ACTIVE-to-CANCELLED/COMPLETED update may bypass mutable creation eligibility only when society, slot, visitor, visitor pass, start and end are unchanged. Every path still checks slot society, visitor/pass relationship and society, and containment within pass validity. Inserts, reactivation, retargeting and window edits retain the original active-slot/approved-visitor/active-pass eligibility checks. Existing triggers, foreign keys, terminal metadata checks and overlap exclusion remain active. No API, service authorization, tenant helper, dependency, production grant or policy change.

Six migrated regressions cover both close actions after actual check-in, actual check-out and slot deactivation, foreign-society denial, exactly-once close/event evidence, and new-permit refusal. Direct SQL probes verify that insert, society/slot/visitor/pass substitution, start/end edits and reopening cannot use the exception. Savepoints recover deliberately rejected statements; an outer rollback preserves append-only evidence without disabling triggers.

## Change ledger and validation

| Change | Purpose / risk |
| --- | --- |
| One forward CREATE OR REPLACE FUNCTION migration | Restore legitimate closure; scope and eligibility exception reviewed together |
| Six public migrated lifecycle cases with direct SQL probes | Database behavior, not copied-table trigger inference |
| Generated tenant inventory and summary | 222 migrations; other source/access/context counts unchanged |
| Existing historical migrations, files, constraints, service APIs and dependencies | Retained; no complete file removal |

API typecheck/lint pass locally. Complete protected validation on the final candidate is required before merge. The intentionally red reproduction candidate must not be merged. Exact final candidate, tested tree, run and merge evidence belong in the PR and health checkpoint. Main/staging remain unchanged for this slice.

Residual limits: editing parent pass validity to exclude the original permit still fails the retained containment check; this batch does not authorize such edits or relax that rule. Copied non-owner RLS tests do not copy public triggers; these lifecycle cases use real public migrated tables. Hosted policy/grant acceptance, broader parking allocation/operations, provider and field/device evidence remain open. Overall health stays provisional 7.6.
