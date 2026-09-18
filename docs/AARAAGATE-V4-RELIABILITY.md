# Aaraagate V4.4 — Production Reliability

Date: 2026-09-18
Status: In progress
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

## Remaining V4.4 work
Continue bounded audits for:
1. scheduled-job idempotency evidence;
2. object authorization regressions;
3. backup/restore and rollback evidence consolidation;
4. production metrics/reliability acceptance evidence.
