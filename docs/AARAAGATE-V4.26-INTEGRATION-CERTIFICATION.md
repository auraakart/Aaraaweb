# Aaraagate V4.26 — Integration Certification Checklist

Date: 2026-09-20  
Scope: repository validation contract only. Commercial certification, live credentials, provider approval and physical hardware/site acceptance remain external.

## Contract baseline

All integration families expose the versioned metadata contract `aaraagate.integration.v1` through the Integration Registry.

Supported families:
- OTP/SMS
- WhatsApp
- Push
- Payment gateway
- Access control / ANPR / RFID
- Object storage
- Smart meter
- Accounting connector

## Provider certification checklist

A provider implementation is not production-certified merely because it satisfies the repository interface. Before activation, verify:

1. **Identity and scope**
   - provider family and provider key are explicit;
   - society enablement is configured under tenant scope where applicable;
   - provider credentials are supplied only through deployment secret configuration;
   - no provider credential is persisted in `SocietyIntegrationConfiguration`.

2. **Authorization and isolation**
   - provider callbacks cannot bypass Aaraagate authorization;
   - society/resource scope is resolved server-side;
   - cross-society identifiers fail closed;
   - direct provider access to Aaraagate database tables is prohibited.

3. **Idempotency and replay**
   - retryable write/callback operations carry stable idempotency or external event keys;
   - duplicate payloads replay safely;
   - conflicting reuse is rejected or quarantined;
   - retries never duplicate financial, access or meter state.

4. **Failure and degradation**
   - normalized health reports READY / DEGRADED / UNCONFIGURED or the domain-equivalent runtime state;
   - degradation follows the registry retry/degradation metadata;
   - optional provider failure does not bypass authentication, payment verification, gate authorization or accounting integrity;
   - manual fallback is available for access-control operations.

5. **Secrets and privacy**
   - logs use safe operational error summaries;
   - request bodies, credentials, tokens and secret-bearing exception text are not logged;
   - secret rotation does not require domain rewrites;
   - test/reference adapters never activate silently in production.

6. **Domain truth boundaries**
   - payment provider state remains evidence, not accounting journal truth;
   - push handoff is not represented as device display/read proof;
   - access-device state does not override server authorization;
   - smart-meter ingestion quarantines invalid/unmapped readings instead of rewriting meter history;
   - accounting connectors transport immutable exports and do not mutate journals.

7. **Operational evidence**
   - health/readiness checked in the target environment;
   - retry/backoff/manual-fallback behavior exercised;
   - failure recovery and duplicate handling exercised;
   - provider-specific webhook/callback authentication validated;
   - representative field/device test evidence retained separately from repository CI.

## Repository reference adapters / boundaries

- OTP: non-production test provider plus production MSG91 SMS adapter boundary.
- WhatsApp: versioned contract is exposed but production transport remains intentionally unconfigured until approved provider/template integration exists.
- Push: Firebase/FCM delivery with durable outbox retry semantics.
- Payment: configured HTTP reconciliation/refund adapter with sandbox/live separation and idempotent operations.
- Access control: simulator/reference adapters for ANPR, RFID and boom barrier plus manual fallback.
- Object storage: S3-compatible adapter with fail-closed unconfigured behavior.
- Smart meter: existing utility integration ingestion boundary with key rotation, meter mapping, idempotency, quarantine and reprocessing evidence.
- Accounting connector: configured HTTP transport for immutable accounting export artifacts.

## Exit evidence for V4.26 repository completion

Before V4.26 is marked repository-complete:
- capability registry is permission-scoped and secret-safe;
- society selection changes are auditable;
- provider contracts report version, retry ownership and degradation behavior;
- smart-meter boundary is represented in the shared integration registry;
- all required CI, security/privacy, cross-role, performance and readiness gates are green;
- documentation does not claim live-provider or physical-hardware certification.
