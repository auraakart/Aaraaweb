# Aaraagate V4.4 — Production Reliability Completion Evidence

Date: 2026-09-18
Status: Candidate completion evidence; final only after the reliability-metrics PR is green and merged to `develop`.

## Exit-criteria matrix

### Retry, backoff and notification durability
- Direct resident/consumer push delivery uses durable `PushDeliveryOutbox` work with dedupe keys, bounded retry/backoff, stale in-flight recovery and terminal failure evidence.
- Scheduled notices continue to use the existing `NoticeDispatch` queue with bounded exponential retry rather than being double-queued.
- Invalid device tokens are deactivated and do not remain in the active delivery set.

### Payment webhook replay and idempotency
- HMAC-validated callbacks are persisted before state mutation in `PaymentWebhookReceipt`.
- Provider event reuse with a different payload fails closed.
- Failed processing is retained for controlled `PAYMENT_RECONCILE` replay through the normal locked payment state machine.
- Replay actor/time/count and provider redelivery counts are retained.

### Booking concurrency, double submit and revocation
- Amenity capacity/overlap checks remain serialized by the existing amenity advisory transaction lock.
- The existing active exact-slot database uniqueness remains the hard duplicate boundary.
- V4.4 adds optional amenity booking idempotency and controlled manager revocation.
- External Services bookings add authenticated-user-scoped idempotency while preserving existing provider availability locking and row-locked cancellation.

### Scheduled-job idempotency
Existing evidence is sufficient; no replacement scheduler is introduced:
- one process refuses overlapping local sweeps;
- a PostgreSQL transaction advisory lock permits only one cluster sweep at a time;
- notice claims use `FOR UPDATE ... SKIP LOCKED`;
- stale in-flight notice work is reclaimable;
- direct-push drain uses its durable outbox claim state.
Focused `scheduled-work.service.spec.ts` proves lock refusal, cluster-owned execution, notice `SKIP LOCKED`, bounded retry and durable-push draining.

### Object authorization
Existing evidence is sufficient:
- society document keys are generated below `societies/<societyId>/documents/`;
- cross-society document keys are rejected before a download intent is signed;
- document verification repeats society-key validation before metadata/scanner access;
- provider-media object keys are server-generated below the authenticated provider identity;
- provider self-service lookups scope media by provider id;
- mismatched or malware-positive objects are removed/application-hidden.
No public object URL is treated as an authorization grant for private society documents.

### Backup, restore and rollback
Repository evidence is already operational:
- `.github/workflows/backup-restore-smoke.yml` applies all migrations, creates a logical PostgreSQL backup, restores into a clean database, and verifies both migration history and marker data;
- restore evidence is uploaded as a 30-day CI artifact;
- deployment rollback guidance requires an exact rollback SHA and prefers forward corrective migrations when safe;
- repository CI restore evidence does **not** claim that a real provider-managed production restore has been performed. A real isolated restore remains a pilot/production-environment acceptance action.

### Correlation, metrics and abuse protection
- request correlation IDs and structured request metadata logging remain active;
- clustered Redis/Valkey rate limiting protects OTP/auth/webhook/general API traffic while health probes are exempt;
- `GET /api/v1/health/metrics` exposes aggregate, non-PII process reliability metrics:
  - total/inflight/completed requests;
  - 2xx/4xx/5xx totals;
  - 5xx error rate;
  - average/max latency;
  - rate-limit hits by policy;
  - limiter-store degradation count.
The surface does not include request paths, user IDs, society IDs, tokens or request bodies.

## V4.4 completion boundary
V4.4 can be marked complete when:
1. the booking reliability PR is merged green;
2. the metrics/evidence PR is rebased onto that resulting `develop` SHA, passes CI, and is merged;
3. no P0/P1 reliability regression is introduced.

External production proof that requires real hosting/provider credentials remains tracked for V4.9/pilot acceptance and is not falsely represented as repository-complete evidence.
