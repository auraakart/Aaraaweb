# Parking operations tenant context — 30 October 2026

Batch U; baseline develop `28ae274df66f431aa9c3768cba84ede55f8a0ce8` (PR #1545).

ParkingOperationsService policy/read/update, credential/read/issue/revoke and violation/read/report/resolve now use the existing tenant transaction helper. Credential building joins explicitly require the unit's society, and issuance requires an active vehicle with a same-society household. Native 23505 and Prisma P2010/meta.code 23505 duplicates return the existing safe credential conflict, matching the actual database error shape accepted in Batch T. Unrelated failures propagate. These eight small methods form one bounded source slice; no controller permission, endpoint, DTO, schema, grant or policy change.

## Preserved behavior and acceptance limits

Policy remains a society-keyed upsert with maximum 1–12, all three flags, actor and update timestamp. Credential normalization, optional notes, one active credential per vehicle, society-wide value uniqueness (including revoked values), 500-row ordering, active-only revocation, actor/timestamp and COALESCE note retention remain. Violations retain normalized code, default WARNING severity, optional same-society slot/vehicle/permit references, 500-row ordering and open-only resolution with actor/time/note. References need to belong to the society; this batch does not invent a requirement that all optional references describe one physical incident. No new ParkingEvent actions or audit model is introduced.

Strict root-rejection tests cover all eight operations, missing context, validation, normalization/defaults, parent predicates, safe/unchanged errors and terminal updates. Six new non-owner FORCE RLS cases cover both-society policy/credential lifecycle, foreign/inactive/malformed parents, duplicate values and concurrent active-vehicle issuance, every violation reference substitution, active-only resolution and rollback after completed callbacks write state. The fixture adds only ParkingViolation to existing migrated copies; checks/indexes remain, while LIKE omits public foreign keys/triggers. VehicleType enum alignment remains intact.

One additional public migrated workflow integrates policy, credentials, allocation, violation resolution and revocation; it verifies allocation stops when the required credential is missing/revoked. Outer rollback preserves immutable ParkingEvent evidence without disabling triggers. Dedicated role tests are separate from real public constraints and do not prove hosted RLS activation.

## Delay recovery and completion boundary

Recovery confirmed PR #1545 merged and all its required gates passed. No prior CI or approval was stuck. Execution ended after that accepted slice, leaving already-authorized operations work unstarted. This was a turn handoff gap; the screenshot selects main, while development is on develop. No particular browser-cache cause is established.

Recovery reused the clean repository, pinned toolchain and saved checkpoint, then resumed the pending service directly. Complete source, tests, exact-candidate required CI, explicit develop merge and tested/merged tree verification before marking this slice accepted. Record exact next action in the same durable report. fix/* auto-merge remains a no-op. Do not imply execution continues between turns or promise unattended work across an interruption. There is no new per-slice approval requirement.

| Change | Purpose / risk |
| --- | --- |
| Eight root reads/write operations → tenant helper | Close the remaining ParkingOperationsService context gaps |
| Same-society credential building/household joins | Prevent malformed-parent disclosure/issuance |
| Narrow native/Prisma duplicate mapping | Preserve intended safe credential conflicts for actual DB error shapes |
| Tests, selected risk floor and inventory | Retain existing floors and distinguish copied/public/hosted evidence |
| Existing files, migrations, constraints, APIs and dependencies | Retained; no complete file removal |

Local selected risk: 577 passed / five Redis cases reserved for CI; selected ParkingOperationsService coverage 100% statements/branches/functions/lines. Complete protected PostgreSQL/API validation and all required gates precede merge; no local database acceptance claimed. No latency gain or complete multi-tenant production acceptance is claimed. Concurrent policy changes/parent deactivation and arbitrary SQL access remain separate boundaries; this slice retains current lifecycle semantics.

Main/staging unchanged. Other domains/jobs, parent-derived/private storage, hosted ownership/grants/policies and real provider/device/field evidence remain open. H27-03/H27-08 partial, H27-04 open; health stays provisional 7.6.
