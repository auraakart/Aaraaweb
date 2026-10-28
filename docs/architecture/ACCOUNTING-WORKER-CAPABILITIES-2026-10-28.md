# Accounting worker capabilities — 28 October 2026

H27-03/H27-08 continuation from develop `afbb77eff11bfc9abedfddc0cb263e8cb8d3ef9c`. Develop only; hosted role/policy acceptance remains open.

Export and connector services already use tenant context. Their global dispatch still required broad root-table access. Migration `20261028080000_v510_accounting_worker_capabilities` replaces this with three fixed system-worker capabilities. No generic bypass, caller SQL, artifact content or journal data is exposed.

| Capability | Authority / result | Preserved behavior |
| --- | --- | --- |
| `aaraagate_claim_accounting_export(integer)` | Claim one export; id/society/format/date range only | Oldest queued or expired processing; SKIP LOCKED; attempt increment, last-attempt/lease/error clearing |
| `aaraagate_seed_accounting_deliveries(text)` | Seed completed same-society export/artifact pairs; count only | Same provider and `accounting-export:<job>:<provider>` key, conflict-safe insert, all eligible completed exports |
| `aaraagate_claim_accounting_deliveries(integer)` | Claim at most 20; six execution/routing fields | Existing due states and expired leases, attempt/lease/update metadata; stored keys/receipts preserved |

Functions are VOLATILE STRICT SECURITY DEFINER, fully qualify tables, pin `search_path=pg_catalog, pg_temp` and `row_security=on`, and atomically revoke PUBLIC EXECUTE. Null or sub-60-second claim intervals return no work. Existing valid configured intervals are unchanged. UUID resolves previously unspecified ties; delivery results follow due order. Claims commit before per-job tenant transactions and any provider network call. No direct-table fallback exists. Export executeClaimed accepts only the five fields it actually consumes; HTTP response contracts are unchanged. Export-worker logs now use the existing safeOperationalError descriptor, retaining safe name/code without exception payloads.

## Hosted provisioning prerequisite

Do not deploy these callers with a separate runtime role until reviewed owners, policies and explicit EXECUTE grants are provisioned. Migration owner is a bootstrap owner, not proof of production isolation. Use dedicated NOLOGIN NOSUPERUSER NOBYPASSRLS non-table-owner capability roles; runtime must have no membership, no CREATE in trusted schemas and no broad global table grants. Scope EXECUTE to the trusted internal worker caller, never resident/admin request parameters or AI tools. Provider is operator-configured adapter identity, not a user-supplied selector. Runtime still needs its tenant-scoped service rights. Retain the previous callback/reconciliation capability separation.

Provision each owner only the columns required by its function: export claim SELECT id/society/format/fromDate/toDate/status/createdAt/leaseUntil/attemptCount and UPDATE status/attemptCount/lastAttemptAt/leaseUntil/errorCode; seed SELECT job id/society/status and artifact jobId/societyId, INSERT delivery societyId/exportJobId/provider/idempotencyKey (plus conflict-key SELECT if needed by hosted policy); delivery claim SELECT its six results plus status/nextAttemptAt/leaseUntil/createdAt and UPDATE status/attemptCount/lastAttemptAt/leaseUntil/updatedAt. No owner needs artifact content, journal/economic values, artifact mutation, receipt/error-detail mutation or DELETE. Explicit SELECT/UPDATE/INSERT RLS policies must authorize only the appropriate capability owner on these tables; grant no policy to PUBLIC. Review separate owners/grants in the target hosted environment before activation. Fixture uses one combined non-login accounting owner for these three operations to exercise the union of required rights, not a mandate for hosted role consolidation.

## Evidence and limits

Seven additional disposable PostgreSQL cases exercise denied execution/no membership, pinned metadata/no artifact-content access, both-society seeding/deduplication/parent denial, one/20 claim bounds, eligibility/lease/key fidelity, concurrent locked rows/rollback and real export-to-connector handoffs under restricted RLS. Existing prior per-job cases keep their explicit simulated dispatch for adversarial wrong-tenant routing; they do not independently certify global dispatch. Copied tables preserve check/index constraints but omit public FK/trigger behavior. The existing real migrated Tally acceptance now uses the export worker and verifies public connector seeding/claim, retaining balanced exact amounts, formula protection and digest checks. No append-only public evidence is deleted.

Unit tests reject unrestricted fallbacks, retain bytes/keys, check process overlap, timer cleanup and safe errors. Export worker joins risk coverage with explicit floors; no existing floor is lowered. JSON and human tenant inventories are synchronized together. Full PostgreSQL validation occurs before broad CI regression; completed local broad checks run concurrently with CI.

| Item | Classification / reason | Evidence | Risk | Validation |
| --- | --- | --- | --- | --- |
| Root worker claim/seed SQL | CONSOLIDATE in fixed SQL capabilities | Same predicates, limits, locks, keys and metadata; no root fallback | Medium; provisioning is a release prerequisite | Restricted-role and real migrated PostgreSQL + unit tests |
| Raw export-cycle exception text | CONSOLIDATE on existing safe descriptor | Database/provider exceptions can contain payloads | Low | Secret-marker log test |
| Job request/user/hash fields in dispatch result | REMOVE from internal claim projection | executeClaimed consumes only five fields; callers/tests inspected | Low | Typed minimal handoff, real worker/Tally tests |
| Export formats, per-job scope, audit/retries/receipts | RETAIN | Approved workflows remain implemented | None from removal | Existing regression and reviewed diff |
| Files/dependencies/history | RETAIN | No complete file removal or dependency change | None from deletion | Diff and CI |

Seeding still scans all completed exports, preserving existing semantics; this is not a query-latency optimization. Functions reduce application transaction round-trips, but no measured speedup is claimed. Production role acceptance, other domains/jobs, provider acceptance, private storage and field evidence remain open. Do not enable blanket RLS. Rollback requires reverting callers before function removal; keep additive migration history and existing tenant/security controls.
