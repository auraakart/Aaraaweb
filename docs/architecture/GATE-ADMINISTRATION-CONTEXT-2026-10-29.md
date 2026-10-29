# Gate administration tenant context — 29 October 2026

Batch P, H27-03/H27-08 continuation. Baseline develop `d3dbb403a32415ba336d5c25410249861dc33276` (PR #1540). GatesController list/create/activate/deactivate still used root gate reads/writes after AccessService conversion. They now establish per-operation tenant transactions; lookup and write share the transaction and activation updates explicitly include societyId.

## Preserved behavior and scope

Gate names/codes retain trimming and uppercase normalization; omitted active defaults true and explicit false is preserved. Same-society duplicate preflight retains its BadRequest response, while identical codes remain allowed in different societies under the existing database uniqueness constraint. Listing remains alphabetical. Foreign/missing activation IDs retain the existing error. Request DTOs, controller routes, guards, permissions, response shapes, audit history and assignment delegation are unchanged. GateAssignmentService already scopes its operations and is not reimplemented here.

No migration, role/grant/policy, dependency, complete file or feature removal. Context prepares selected callers for enforcement; hosted RLS is not activated. Transactions add context-setting overhead; no measured performance improvement claimed.

## Validation

Before publication: 464 runnable risk tests passed (five dedicated Redis cases reserved for CI), API typecheck/lint, SQL parameter contracts, complexity boundaries, tracked-secret scan and all 44 stable domain invariants. New gate tests reject root-client access and cover normalized creation/defaults, duplicate denial, scoped updates, foreign/missing IDs, persistence errors and missing context. Existing gate permission tests remain in the selected risk suite.

New selected GatesController coverage: 90% statements, 57.14% branches, 69.23% functions, 89.18% lines. New floors are 85/55/65/85; all existing floors are retained. Untouched audit/assignment delegation branches are not fully covered by these tests; the figures are neither full-repository nor complete controller assurance.

Three added restricted-role database cases cover both-society discovery/creation, same-code isolation/duplicate denial, foreign activation/deactivation and rollback after actual writes followed by response failure (including creation). The fixture reuses migrated Gate columns/defaults/indexes and the existing restricted runtime role; no new copied enums or tables are needed. Copies omit public FK/trigger behavior. One new real migrated workflow covers creation, duplicate handling and local/foreign activation. Complete protected database/API acceptance is required before develop merge; no local PostgreSQL acceptance claimed.

Static inventory: 287 tables, 455 runtime/script files, 221 migrations, 2,457 DB sites (1,714 raw / 743 ORM), 967 routes, 217 tenant-context calls, 13 indirect SQL sites and zero migration policy signals. Both generated outputs are synchronized. Static markers are not authorization proof.

## Decision and deletion ledger

| Item | Decision | Risk and evidence |
| --- | --- | --- |
| Root gate administration reads/writes | Refactor to existing tenant helper | Medium; strict-root, permission, behavioral, restricted-role and migrated validation |
| Activation update predicates | Retain ID and add explicit societyId | Low; foreign-ID rejection and same-society update tests |
| APIs, guards, normalization, uniqueness, audit/assignment delegates | Retain | Existing permission contracts and full API regression |
| Files, dependencies, migrations and policies | Retain | No complete file removal, upgrade or policy activation |

Remaining: restricted-role gate assignment acceptance, other operational domains/jobs and parent-derived/private storage enforcement, hosted ownership/grants/policies, actual provider and independent device/field evidence. Overall health remains provisional 7.6; the full definition of done is open.
