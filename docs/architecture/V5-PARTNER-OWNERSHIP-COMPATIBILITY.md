# V5.1.0 partner ownership and compatibility migration

Version: 1.0, 2026-10-11. Development foundation only. Partner onboarding, transfers, licensing enforcement, brand activation, custom domains and production rollout remain later gated slices.

## Contract and affected modules

| Module | Implementation |
| --- | --- |
| Prisma schema / migration `20261011113000_v5_partner_ownership_compatibility` | Partner, PartnerMembership and SocietyEntitlementCompatibility; required Society.partnerId and ownershipVersion |
| societies controller | Explicit legacy response projection for list/create/detail; existing guards and permission requirements retained |
| entitlement service / auth | Existing live tier/boolean override resolver, sessions, membership and AppRole remain unchanged |
| API scripts / canonical CI | Deterministic tenant register; disposable historical PostgreSQL upgrade, fixture reconciliation, failure rollback and replay checks |
| V5 manifest / roadmap | V5.0.2 inventory complete; V5.1.0 schema foundation implemented, broader V5.1 work still pending |

Society remains the operational tenant. Partner is a separate commercial owner. PartnerMembership stores OWNER, BRAND_MANAGER, COMMERCIAL_ADMIN and SUPPORT as a dedicated enum, active flag and unique (partnerId,userId,role) key. Partner membership creates no SocietyMembership and grants no operational permission. No new partner write route is exposed. Do not use new roles in the existing role guard until V5.2 defines and tests the audience matrix.

Built-in owner: UUID `00000000-0000-4000-8000-000000000001`, slug `aaraagate`, ACTIVE. Its identity cannot be deleted/reidentified, renamed by slug, or terminated. New custom partners default to DRAFT. Partner slug is unique and lowercase, 2–63 characters. Society's owner FK restricts owner deletion; membership's user FK retains user deletion cascade. ownershipVersion starts at 1 and must be positive. Future audited transfer operations must update it transactionally and handle history/revocation/invalidation; this migration is not a transfer implementation.

## Expand and reconcile

The atomic migration creates the built-in owner, adds required fields with constant defaults, establishes FKs/indexes and captures an immutable compatibility snapshot for every existing society, including suspended societies. PostgreSQL's constant ADD COLUMN default handles legacy rows and older servers that omit ownership fields. This is the concrete deviation from the roadmap's general nullable-expand pattern: no host deployment or old-reader switch is needed to test the additive default. No legacy data column is renamed, dropped or repurposed.

The snapshot stores the original tier, raw JSON overrides, effective feature array, migration identity and capture time. Its frozen catalogue matches all 16 existing feature keys and their four tier mappings. Only boolean overrides apply, exactly as in the existing resolver; unknown keys, nonboolean values, arrays and scalar JSON do not alter effective features. JSON null is retained as JSON null. Capturing a suspended society does not activate it: the live resolver still requires ACTIVE status.

Snapshots are evidence for subsequent legacy licensing/grant conversion, **not live subscription grants or a new feature resolver**. Existing Society.productTier/featureOverrides remain authoritative. Immutable UPDATE protection prevents ordinary snapshot mutation; deletion cascades when the society is deleted to preserve the existing deletion behavior. This is not tamper resistance against database owners. New post-cutover societies need no snapshot until a future licensing conversion; their default ownership and live entitlements work normally.

Replaying the SQL skips already captured snapshots and does not reset custom ownership or versions. Replay may capture societies created after the first cutover using their current legacy fields. Prisma normally deploys this migration once; replay is a disposable test/reconciliation procedure, not a requirement to edit migration history.

## Validation and Definition of Done

Required protected CI: clean full-chain Prisma deploy on PostgreSQL 16; a separate disposable database upgraded through all 189 pre-V5 migrations; 64 fixtures spanning every tier, both society statuses, boolean allow/deny, unknown fields, wrong types, arrays, strings and JSON null; exact legacy-field and effective-feature equality; old-server SQL insert; FK/unique/version/default-owner constraints; immutable snapshots; replay after entitlement/ownership changes; user/society deletion cascade; reserved-slug failure rolls back all newly introduced DDL. The society API PostgreSQL test checks exact pre-V5 list/create/detail keys and database-supplied default ownership. Existing auth, branding and entitlement tests remain required.

A feature-catalogue unit test prevents accidentally changing the cutover mapping before this slice lands. Future catalogue changes must explicitly retain this historical mapping and adjust that baseline check with documented replacement evidence rather than editing the applied migration.

Local evidence: Prisma validate/generate; API lint/typecheck/build; focused branding/entitlement/auth/Prisma/society tests; compiled Nest branding HTTP smoke; full historical-chain rehearsal with the same SQL fixtures in PostgreSQL WASM. Native PostgreSQL protected CI is authoritative for integration; WASM is supplemental. Test fixtures are synthetic and the smoke requires a disposable database flag and CREATEDB access, destroys its temporary database in finally, and adds no hosted infrastructure.

Slice Done means the above gates pass at the exact PR head, the migration and scope register are reviewed, default/legacy behavior is retained, and the develop PR is merged under existing governance. It does not mark all V5.1 commercial schema or V5.2 isolation complete. Remaining V5.1: explicit ownership history/transfer contract and future legacy license/grant conversion once licensing authority and defaults are defined. Brand revisions belong to the branding slice. No staging/main promotion or productionization is part of this slice.

## Failure, rollback and risks

- Migration uses a five-second lock timeout and 120-second per-statement timeout. It briefly serializes Society writes to capture a consistent cutover. Measure duration and database lock impact in the intended development/test dataset; a large portfolio needs a separately reviewed batch/cutover strategy before hosted rollout.
- A reserved slug/identity collision fails rather than taking over a pre-existing partner. Reconcile the conflicting synthetic/test registry under review, verify transaction rollback, then use the established Prisma failed-migration resolution procedure on the disposable test database before retry. Do not overwrite the reserved identity silently.
- Before partner activation, rollback application code to the preceding develop build and keep additive tables, defaults, FKs and snapshots. Older server INSERTs remain compatible. Verify legacy create/list/detail, bearer context and current entitlements again. Do not drop ownership fields after any custom ownership data exists.
- If fixture equality or a required gate fails, do not merge or activate partner readers. Investigate before replaying. Restore disposable databases from fixtures for rehearsals; no production data or migration execution has been authorized here.
- Database schema ownership alone supplies no strict tenant isolation. Do not onboard white-label partners or trust a client-supplied partnerId until the V5.2 authorization/DB-role/workers/cache/storage gates close.
