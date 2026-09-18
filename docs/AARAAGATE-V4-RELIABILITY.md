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
- OTP verification remains protected by its existing challenge/verification logic in addition to rate limiting.
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

## Remaining V4.4 work
Continue bounded audits for:
1. webhook replay/operational evidence;
2. booking double-submit/revocation evidence;
3. scheduled-job idempotency evidence;
4. object authorization regressions;
5. backup/restore and rollback evidence consolidation;
6. production metrics/reliability acceptance evidence.
