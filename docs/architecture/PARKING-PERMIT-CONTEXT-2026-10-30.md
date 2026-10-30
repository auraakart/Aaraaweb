# Visitor parking permit tenant context — 30 October 2026

Batch R, H27-03/H27-08 continuation. Baseline develop `7652a1add1dcdf1d1ec33bc168191268ffc9eaa2` (PR #1542). ParkingPermitService list/eligibleVisitors/create/close still used root SQL/unscoped transactions. These four paths now use the selected tenant client. Building joins explicitly require the visitor unit's society; overlap reads explicitly include societyId.

## Preserved behavior and limits

Retains 500-row read limits/order, visitor/pass/slot society joins, active approved pass eligibility, permit windows within pass validity, allowed visitor/temporary/accessible slots, overflow policy, plate/note normalization and limits, slot/pass row locks, overlap checks/exclusion constraint, conflict mapping, terminal conditional updates and atomic parking event evidence. HTTP contracts, guards, permissions, existing migrations and database triggers are retained. No complete file/dependency removal, upgrade, production grant or policy activation. Context does not by itself enforce hosted RLS. Added transactions/context setting have not been benchmarked; no latency improvement is claimed.

Six new restricted-role cases exercise both-society eligibility/list/create/close/event evidence, foreign slot/visitor/pass/permit IDs, pass status/validity and slot/policy restrictions, concurrent overlap rejection and adjacent windows, direct exclusion-constraint enforcement, rollback after actual event writes, and malformed foreign building parents. Copied ParkingSlot/ParkingPolicy/ParkingPermit/ParkingEvent tables retain migrated defaults/checks/indexes, including the exclusion constraint. LIKE copies omit public FKs/triggers; one new real migrated workflow covers scope guards, terminal transitions, overlap handling and append-only event protection inside a rollback fixture. Production triggers are never disabled.

Before publication: 499 runnable risk tests passed (five Redis cases reserved for CI); API typecheck/lint, SQL parameter contracts, complexity, tracked-secret scan and 44 invariants pass. New selected ParkingPermitService coverage: 100% statements/functions/lines, 97.5% branches; new floors 90/85/100/90 retain existing thresholds. Selected coverage is not whole-repository assurance. Complete protected PostgreSQL/API validation is required before develop merge; no local PostgreSQL acceptance claimed.

Static inventory: 287 tables, 455 runtime/script files, 221 migrations, 2,457 DB sites (1,714 raw / 743 ORM), 967 routes, 221 context calls, 13 indirect SQL sites and zero migration policy signals. Both generated outputs are synchronized. Static markers are not authorization evidence.

## Delay diagnosis and completion correction

Recovery verified PR #1542 fully merged on 29 October and develop at `7652a1add1dcdf1d1ec33bc168191268ffc9eaa2`; no previous CI or PR was stuck. Work ended after the accepted assignment slice without beginning the already-authorized parking slice. This was a turn/completion handoff gap, not a demonstrated repository build failure. The screenshot selects main and shows an Initial commit that differs from current GitHub data; live main remains the 24 October release `29f95ecaef53c5a03af8858ea89ca58cf2fe0811`, while development is visible at https://github.com/auraakart/Aaraaweb/tree/develop. No specific browser-cache cause is established.

Recovery resumed the exact saved source slice without repeating prior completed suites or reinstalling the surviving pinned toolchain. Complete implementation, exact-candidate CI, explicit develop merge and tested-tree verification before closure. Preserve exact candidate/run/next action in the durable checkpoint; no new per-slice approval is required within the authorized develop work. Do not equate fix/* auto-merge job success with a merge, imply background progress after a turn ends, or promise permanent unattended execution across interruptions. Main/staging are not promoted as part of this source hardening slice.

## Change and deletion ledger

| Item | Decision | Risk / validation |
| --- | --- | --- |
| Root permit reads and write transactions | Refactor to existing tenant helper | Medium; strict root rejection, restricted-role and migrated lifecycle |
| Building/overlap society predicates | Add explicit same-society filters | Low; foreign parent/substitution tests |
| Locks, exclusion, validity, close status and event atomicity | Retain | Actual concurrency/constraint/rollback and real migrated tests |
| APIs, guards, files, dependencies, migrations and policies | Retain | No complete file removal, upgrade or production policy activation |

Remaining: broader parking allocation/operations and other domains/jobs, hosted ownership/grants/policies, parent-derived/private storage enforcement, actual provider and device/field acceptance. Overall health stays provisional 7.6; full definition of done remains open.
