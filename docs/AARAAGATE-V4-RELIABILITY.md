# Aaraagate V4.4 — Production Reliability

Date: 2026-09-18
Status: Repository closeout in progress
Baseline: V4.3 complete on `develop`

## Goal
Raise production reliability without duplicating controls already implemented in V2/V3/V4. Existing mechanisms remain authoritative unless a concrete gap is found.

## Baseline audit

Already present before V4.4:
- request correlation IDs and structured request metadata logging;
- Redis-backed authentication state with production readiness checks;
- payment idempotency and durable gateway-operation retry state;
- scheduled-work cluster advisory locking and notice retry/backoff;
- Guard offline queue replay/idempotency;
- backup/restore smoke workflow;
- production startup/readiness CI;
- invalid push-token lifecycle cleanup;
- tenant-scoped object/data authorization across critical domains.

Confirmed V4.4 gap:
- no global API request-rate limiting or clustered abuse-protection middleware was present.

## V4.4.1 — Clustered API rate limiting

Implemented:
- global API middleware backed by the existing `AuthStateStore.increment()`;
- production counters therefore use configured Redis/Valkey rather than process-local state;
- health and CORS preflight traffic are exempt;
- OTP request: 5 requests / 300 seconds / client;
- OTP verify: 10 requests / 300 seconds / client;
- auth refresh: 30 requests / 60 seconds / client;
- payment webhook: 600 requests / 60 seconds / client;
- general API: 300 requests / 60 seconds / client;
- standard `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` and `Retry-After` response headers;
- 429 response before controller execution when a bucket is exhausted;
- caller-provided forwarding headers are ignored unless `TRUST_PROXY_HEADERS` is explicitly enabled;
- client identifiers are SHA-256 hashed before being used in rate-limit store keys;
- limiter-store failures degrade open with structured warning logs instead of turning a Redis incident into an API-wide outage.

## Safety notes
- Rate limiting is an abuse/reliability control, not an authentication or authorization boundary.
- OTP request remains protected by the existing per-phone Redis/Valkey request window, while the middleware adds a client-level abuse layer. OTP verification retains its per-challenge attempt cap in addition to the client-level limiter.
- Health/readiness probes remain available during traffic spikes.
- Payment webhook limits are intentionally higher than user-facing limits; webhook signature/idempotency controls remain authoritative.
- Enabling trusted proxy headers requires ingress configuration that overwrites client-supplied forwarding headers.

## V4.4.2 — Durable direct push delivery

Implemented:
- `PushDeliveryOutbox` persists resident/consumer direct push business events before transport;
- target-scoped unique dedupe keys prevent repeated business transitions from creating duplicate queued work;
- gate/access, maintenance, parcel and emergency resident pushes use the outbox;
- consumer service booking/dispatch pushes use the outbox;
- scheduled notices deliberately remain on the existing recipient-level `NoticeDispatch` retry queue and are not double-queued;
- immediate outbox attempt preserves low-latency gate/service UX;
- transient FCM failures return work to PENDING with bounded exponential backoff;
- stale IN_FLIGHT work is reclaimable and due batches use `FOR UPDATE SKIP LOCKED`;
- delivery stops after eight attempts in FAILED state with the last error retained;
- invalid device tokens continue to be deactivated immediately;
- the scheduled cluster-owned sweep drains due direct-push work;
- outbox payloads contain notification business data only; no auth/session secret is stored.

## V4.4.3 — Payment webhook receipt and replay

Implemented:
- HMAC verification remains mandatory before a provider callback can create receipt evidence;
- verified events are persisted in `PaymentWebhookReceipt` with provider event/order/payment ids, payload, SHA-256 digest, receive count and processing state;
- provider event ids remain globally idempotent and a reused event id with different payment data is rejected;
- successful payment mutation still runs through the existing locked `PaymentEvent` + `Payment` state transition contract;
- processing failures are retained as FAILED receipts with bounded last-error evidence while the payment mutation is rolled back;
- provider redelivery increments receive evidence and can safely retry a previously failed receipt;
- finance administrators can list society-scoped webhook receipts and replay a failed receipt through the same state machine;
- replay attempts retain actor/time/count audit evidence;
- cross-society receipt lookup/replay fails closed;
- the rate limiter now matches the real `/billing/payment-webhooks/gateway-adapter` route so signed provider traffic receives the intended webhook bucket rather than the general API limit.

## V4.4.4 — Booking retry and revocation reliability

Implemented:
- amenity booking creation accepts an optional tenant-user-scoped idempotency key; exact retries return the original booking while key reuse with a changed unit/amenity/window fails closed;
- the amenity booking database boundary enforces the idempotency key and existing amenity-scoped advisory locking continues to serialize capacity/overlap checks;
- Resident amenity requests now send an idempotency key;
- active amenity bookings can be revoked by an authorized amenity manager with actor/reason audit evidence;
- the Admin amenity workspace exposes controlled revocation for active bookings;
- External Services booking creation accepts an optional authenticated-user-scoped idempotency key, serializes same-key requests, returns the original booking on an exact retry, and rejects changed payload reuse;
- the External Services database boundary enforces the consumer booking key with a partial unique index, preserving legacy rows without keys;
- the Resident service-request screen retains one request key across ambiguous submission failures, allowing safe direct retry; changing location or schedule explicitly resets the key;
- existing provider availability locking remains authoritative for service-capacity concurrency, while consumer cancellation continues to use row locking plus compare-and-update semantics.

## V4.4.5 — Scheduled-work idempotency evidence

Verified:
- a process-local running guard prevents overlapping scheduler ticks in one API process before a second database transaction starts;
- a PostgreSQL transaction advisory lock ensures only one replica owns the shared operational sweep at a time;
- helpdesk SLA state events are emitted only when the calculated state differs from the stored state;
- automatic helpdesk escalation is guarded by `escalationLevel=0` both when selecting and updating candidates, preventing repeated first-escalation effects;
- SOS acknowledgement escalation is guarded by `autoEscalatedAt IS NULL` both when selecting and updating candidates, preventing duplicate automatic escalation events;
- scheduled notice recipients are claimed with `FOR UPDATE ... SKIP LOCKED` and moved to `IN_FLIGHT` before transport;
- successful notice completion and failed retry transitions both require the dispatch to still be `IN_FLIGHT`;
- failed notice delivery returns to durable `PENDING` state with bounded exponential backoff and retained error evidence;
- durable direct-push work continues to use its separate outbox dedupe/claim/retry contract and is drained only after the cluster-owned sweep.

No scheduler runtime rewrite was required; V4.4 adds explicit regression evidence around the existing controls.

## V4.4.6 — Object authorization regression evidence

Verified representative high-risk object boundaries:
- billing payment creation refuses invoices that are outside the authenticated society/property relationship;
- payment history/receipt access remains payer/verified-owner scoped, and webhook receipt inspection/replay remains society-scoped;
- amenity booking creation rejects a unit outside the current resident property context;
- External Services society-unit booking resolves access from current occupancy or verified ownership rather than trusting a client-supplied society id;
- notice-delivery observability rejects a cross-tenant or missing notice before returning metrics;
- privacy operations validate society relationship and list cases only inside the current society;
- facility work-order event reads and status mutations fail closed when the object is not present in the current society; the V4.4 closeout adds direct negative regression tests for both paths.

These checks complement TenantGuard/RBAC/permission enforcement; they do not treat controller permissions as a substitute for object scope.

## V4.4.7 — Backup, restore and rollback evidence

Repository evidence:
- `Backup restore smoke` applies the complete Prisma migration chain to a clean PostgreSQL source;
- the workflow writes a verification marker, creates a custom-format logical backup, restores it into a separate clean database, verifies restored data, migration history and schema presence, and uploads non-sensitive run evidence;
- the V4.4 booking schema changes passed this restore drill on their exact PR head;
- production startup/readiness CI verifies the API can build, start in production mode and satisfy dependency readiness after clean migrations;
- the production runbook defines immutable-artifact rollback, migration safety, post-rollback health/database/critical-flow verification and incident recording.

Still deployment-owned:
- managed-provider automated backup configuration;
- retention/PITR settings;
- an isolated restore using the actual hosted provider;
- a real application/readiness check against that restored hosted database.

Repository CI must not be represented as proof that those provider controls are already enabled.

## V4.4.8 — Production observability acceptance boundary

Repository controls available:
- unauthenticated `/api/v1/health`, `/api/v1/health/live` and dependency-aware `/api/v1/health/ready`;
- release metadata includes environment, app version, commit SHA and uptime;
- production preflight validates required production configuration without printing secret values;
- domain observability exists for notice delivery and payment reconciliation;
- durable retry/error evidence exists for push delivery, scheduled notices, gateway/webhook processing and related reliability paths.

Hosted acceptance still requires real environment evidence for:
- external health/availability checks;
- API request latency and 5xx-rate monitoring;
- process/container restart monitoring;
- PostgreSQL availability, connection saturation and storage growth;
- alert delivery/routing with severity and deployed commit/version;
- provider backup/restore/PITR evidence;
- actual deployment/rollback event evidence;
- pilot traffic and real-device/role UAT.

Aaraagate must not claim production-live observability merely because the repository contains health endpoints and runbooks.

## V4.4 repository closeout

V4.4 code/repository reliability work is complete once this closeout branch passes the standard exact-head gates. The milestone has hardened rate limiting, durable push delivery, payment webhook replay, booking retry/revocation, scheduled-work idempotency, object-scope regression coverage, backup/restore evidence and production-operability contracts.

The **field/production evidence portion remains intentionally open** until hosted staging/pilot supplies the external evidence listed above. This does not block starting V4.5 development on `develop`; it does block claiming production-live readiness or completing V4.9 release acceptance.
