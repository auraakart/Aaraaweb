# Aaraagate Accounting Connector Operations

Status: V2.3 provider-neutral integration runbook

This runbook describes the generic accounting-export bridge implemented by Aaraagate. It does not claim certification or native support for any specific accounting product. A vendor-specific bridge should be validated separately before production use.

## Operating boundary

Aaraagate remains the source of accounting truth. The connector transports a completed, immutable accounting export artifact; it does not rewrite journal entries, payment history or the stored artifact.

The outbound adapter sends the artifact bytes to the configured bridge at `POST {ACCOUNTING_CONNECTOR_BASE_URL}/accounting/exports`. The request includes:
- `Idempotency-Key`
- `X-Aaraagate-Society-Id`
- `X-Aaraagate-Export-Job-Id`
- `X-Aaraagate-Contract-Version`
- `X-Aaraagate-Export-Format`
- `X-Aaraagate-Artifact-Filename`
- `X-Aaraagate-Artifact-Sha256`
- optional `Authorization: Bearer ...` when an API key is configured

The request body is the immutable CSV or JSONL artifact. The bridge must return JSON with a delivery status supported by the adapter: `ACCEPTED`, `DELIVERED`, `FAILED` or `UNKNOWN`.

## Deployment configuration

The API reads these environment variables:

- `ACCOUNTING_CONNECTOR_PROVIDER`: provider/bridge identifier. Default: `configured-http`.
- `ACCOUNTING_CONNECTOR_BASE_URL`: bridge base URL. Required before delivery can start.
- `ACCOUNTING_CONNECTOR_API_KEY`: optional bearer credential for the bridge. Store this only in the deployment secret store; never commit a real value.
- `ACCOUNTING_CONNECTOR_AUTO_DELIVER`: must be exactly `true` to enable the worker. Default: `false`.
- `ACCOUNTING_CONNECTOR_INTERVAL_MS`: worker cycle interval. Default: `300000` ms; code enforces a minimum of `60000` ms.
- `ACCOUNTING_CONNECTOR_MAX_ATTEMPTS`: maximum transport attempts before terminal `FAILED` with `DELIVERY_RETRY_EXHAUSTED`. Default: `5`; minimum `1`.

The worker claims at most 20 delivery records per cycle. Its processing lease is derived from the effective interval and is at least 60 seconds; it is not separately configurable.

## Safe enablement sequence

1. Configure the bridge URL and any required API key in the deployment secret/configuration store.
2. Keep `ACCOUNTING_CONNECTOR_AUTO_DELIVER=false`.
3. Deploy and confirm the Admin Accounting Exports readiness card reports `READY DISABLED`.
4. Validate the downstream bridge contract and authentication in the intended environment using controlled test data outside automatic delivery.
5. Confirm finance users can generate and securely download an Aaraagate export artifact.
6. Enable `ACCOUNTING_CONNECTOR_AUTO_DELIVER=true` only after the bridge workflow has been accepted for that environment.
7. Redeploy/restart the API so the worker starts with the new setting.
8. Confirm readiness reports `ACTIVE`, then monitor the connector-health and delivery tables.

Do not enable automatic delivery merely because a bridge URL exists. The switch is intentionally independent and opt-in.

## Readiness states

`GET /api/v1/accounting/connector-deliveries/readiness` is protected by the existing accounting entitlement and `FINANCE_READ` permission. It returns configuration state only and deliberately does not return the bridge URL or API-key value.

- `NOT_CONFIGURED`: no bridge base URL is configured.
- `READY_DISABLED`: the bridge is configured but automatic delivery is disabled.
- `ACTIVE`: the bridge is configured and automatic delivery is enabled.

The readiness endpoint does not perform a provider network call. It therefore proves configuration presence, not remote availability or vendor acceptance.

## Delivery and retry semantics

Completed export artifacts are seeded idempotently into the delivery table. The stable idempotency key is derived from export job + provider and is reused across retries.

Multiple API instances claim work with PostgreSQL row locks and `SKIP LOCKED`. A `PROCESSING` record with an expired lease becomes reclaimable, allowing crash recovery.

Non-terminal provider outcomes (`ACCEPTED`, `UNKNOWN`) are retried with bounded exponential backoff starting at 60 seconds and capped at 3600 seconds. Transport exceptions are retried until `ACCOUNTING_CONNECTOR_MAX_ATTEMPTS` is reached.

Terminal provider outcomes are `DELIVERED` and `FAILED`. Unsupported provider records fail closed rather than being sent through an unrelated configured adapter.

## Manual retry control

Manual retries are restricted to `FINANCE_MANAGE` and only permitted for `FAILED` or `UNKNOWN` deliveries. Under the current permission map this management capability is available to Super Admin and Accountant, while Society Admin and Committee Member remain finance-read only.

A manual retry:
- row-locks the society-scoped delivery record,
- records an append-only `MANUAL_RETRY` action with actor, prior status and prior attempt count,
- starts a fresh bounded retry cycle,
- keeps prior receipt/failure evidence available on the delivery record,
- does not mutate journal entries or the export artifact.

The latest manual interventions are visible at `GET /api/v1/accounting/connector-deliveries/actions` for finance-read users.

## Operational monitoring

The Admin Accounting Exports workspace provides:
- readiness state,
- pending/delivered/failed/retry-exhausted counts,
- oldest pending age,
- terminal success rate,
- provider-level delivery breakdown,
- delivery attempt count, provider receipt and failure code,
- manual retry history.

Investigate sustained pending age, repeated `UNKNOWN`, retry exhaustion or a falling terminal success rate before enabling a larger rollout.

## Disable and rollback

To stop new automatic connector activity, set `ACCOUNTING_CONNECTOR_AUTO_DELIVER=false` and restart/redeploy the API. This prevents the worker from starting on the new process.

Disabling the connector does not delete delivery records, export artifacts or accounting entries. Existing records remain evidence for investigation. Do not delete or rewrite accounting history to compensate for a connector failure; resolve the downstream issue and use the controlled retry path where appropriate.

## Pilot acceptance checklist

Before a production-society pilot:
- bridge TLS, endpoint ownership and authentication are validated;
- real secrets are stored outside Git and logs;
- a test export reaches the intended downstream system with the correct society and contract metadata;
- duplicate submission with the same idempotency key does not create duplicate downstream accounting effects;
- failure, timeout and retry behavior has been exercised;
- the Admin readiness/health/history views are accessible only to the intended finance roles;
- disabling auto-delivery has been tested;
- downstream reconciliation/acceptance responsibility is agreed with the society/accounting operator;
- any vendor-specific mapping or certification claim has separate evidence.
