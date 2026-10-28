# Accounting connector delivery context — 28 October 2026

Backlog: H27-15 (High exception disclosure / P1 stalled worker), H27-03/H27-08 partial. Baseline develop: `2dd5b416448d98ee5bebcb5eef47dca917639ae6`. Develop only; no release promotion.

The connector bridge had no request deadline, and raw thrown exception text could enter logs and persisted retry evidence. Per-job artifact reads/result/failure writes used root Prisma I/O despite society predicates. These paths now use the claimed society's transaction client; exception evidence uses the existing safeOperationalError descriptor; requests have a 10-second abort deadline. No network request runs inside a database transaction.

The immutable artifact bytes, digest, headers, provider receipt and idempotency key remain unchanged. Existing result statuses, retry/backoff/exhaustion, PROCESSING predicates and lease clearing remain intact. Timeout is uncertain transport failure and follows the existing retry path with the same key. Aborting the client does not prove the provider did not accept the export. Structured provider failureCode/failureMessage response fields remain bounded and retained; this slice sanitizes thrown exceptions, not approved business failure details.

Global seedCompletedExports and claim remain explicit root-client exceptions and production RLS activation blockers. Export HTTP/service paths, global export/connector dispatch and hosted roles/policies need separate conversion/acceptance. This slice adds no migration, role/grant, dependency, API shape or permission change.

Focused tests prove deadline abort, identical bytes/key, tenant-only per-job I/O, no root artifact fallback, safe exception persistence/logging, retries/exhaustion and unsupported-provider routing. The restricted-role fixture grows from 28 to 32 cases for both-society success, foreign job denial, scoped sanitized retry evidence and cross-society artifact relationship denial. Global dispatch is deliberately a simulated server-owned handoff in these cases; global seeding/claim permission is not certified. Copied tables do not reproduce all foreign keys/triggers; existing migrated finance/export acceptance remains required.

| Item | Classification / reason | Evidence | Risk | Validation |
| --- | --- | --- | --- | --- |
| Root per-job artifact/result/failure I/O | REFACTOR into tenant clients | Same SQL predicates/joins and claimed society | Medium | Strict unit + non-owner RLS and public finance/export CI |
| Raw thrown exception text | CONSOLIDATE on existing safe descriptor | Provider/DB error text can contain credentials or payloads; stable failure codes remain | Low | Secret-marker exception tests |
| Unbounded connector HTTP wait | REFACTOR to 10-second abort | Sequential worker could stall; retries retain request identity | Medium | Abort and real HTTP contract tests |
| Files/dependencies/global dispatch | RETAIN | No deletion/upgrade or unreviewed bypass | None from removal | Reviewed diff |

One context-setting query is added per scoped transaction; no measured latency gain is asserted. Provider requests are bounded, but actual provider acceptance and cross-society retry semantics remain external evidence. Rollback preserves tenant predicates and security controls. H27-03/H27-04/H27-08 remain partial; overall score remains provisional at 7.6.
