# Aaraagate V4.5 — Privacy, Security and Trust Controls

Date: 2026-09-18
Status: In progress
Baseline: V4.4 repository reliability complete on `develop`

## Goal

Make privacy/security controls visible, auditable and suitable for enterprise/RWA adoption without overstating legal certification.

## Baseline audit

Already implemented before V4.5:
- tenant and permission guards across sensitive society modules;
- explicit privacy-operations permissions and admin case workflow;
- consent registry with record/withdraw/history operations;
- privacy purpose/data-category/processor/incident registry foundations;
- document classification and server-side object authorization;
- refresh-token rotation, replay detection and session revocation;
- restricted-role and permission-negative tests;
- production health/readiness, backup/restore and reliability evidence.

Confirmed V4.5 gaps:
- session revocation/replay outcomes were not durably visible as security audit events;
- resident self-service privacy request/export/deletion surfaces are not yet present;
- logging redaction and privileged-access audit completeness require a dedicated V4.5 review;
- security-event reporting needs an explicit baseline beyond gate/access audit events.

## V4.5.1 — Session revocation security events

Implemented in the first V4.5 slice:
- `Session.revocationReason` classifies successful logout and compromise-driven revocation;
- explicit logout records `LOGOUT`;
- refresh-token replay records `REFRESH_REPLAY`;
- compare-and-set refresh rotation conflict records `REFRESH_ROTATION_CONFLICT`;
- a PostgreSQL trigger writes `SecurityEvent` in the same database transaction as the first `revokedAt` transition;
- the security ledger stores user/society/session identifiers, event type, reason and timestamp only;
- access tokens, refresh tokens, token hashes, OTP values and request payloads are not persisted in the security-event ledger;
- repeated writes to an already-revoked session do not emit another revocation event because the trigger requires `OLD.revokedAt IS NULL` and `NEW.revokedAt IS NOT NULL`;
- `GET /api/v1/reports/security-events` is protected by `AUDIT_READ` and current-tenant guards;
- the feed is SQL-scoped by `societyId` and supports a constrained event-type filter;
- independent-home events can be retained with no society context and are therefore not exposed by a society-scoped audit feed.

## V4.5.2 — Resident privacy self-service

Implemented:
- authenticated residents can list only their own privacy cases in the active society context;
- independent-home users can submit and track society-less privacy cases without inventing a society tenancy;
- self-service request types are constrained to ACCESS, CORRECTION and ERASURE;
- Resident UI exposes data-access, correction and erasure-review requests from the existing Privacy & data use screen;
- ambiguous network retries reuse a subject-scoped request key; exact retries return the original case and changed-payload key reuse fails closed;
- case creation records a minimal `SELF_SERVICE_CREATED` audit event without storing credentials or request payloads beyond the user-provided case summary;
- society-context requests continue through the existing society privacy-operations queue;
- society-less independent-home requests route to a dedicated platform privacy queue;
- platform privacy read/manage permissions are restricted to Super Admin and are not granted to Society Admin, Committee or Auditor roles;
- platform processors can review status, legal hold and case history using the same privacy case engine rather than a second workflow;
- erasure remains a review request, not immediate deletion: completion is blocked while legal hold is active;
- the Resident screen explicitly avoids claiming regulatory certification or unconditional deletion.

The ACCESS action creates a governed data-access case; it does not silently generate an immediate export archive. Actual export assembly/retention processing remains an operations workflow and will be addressed with retention/deletion enforcement later in V4.5.

## Safety and privacy boundary

The security-event ledger is operational audit evidence, not a user-behaviour analytics stream. It must remain minimal, purpose-limited and free of credentials/secrets. Retention and access policy will be reviewed in later V4.5 slices together with privacy retention/deletion controls.

DPDP-oriented documentation in V4.5 describes product/operational controls only. It must not claim legal certification or statutory compliance without qualified legal review.

## Next V4.5 slices

1. privileged/admin audit visibility and negative-permission expansion;
2. sensitive-data logging/redaction review and tests;
3. document/file authorization regression review;
4. privacy retention/deletion enforcement points and legal-hold interaction;
5. security-event reporting/retention completion and V4.5 closeout.


## V4.5.3 — Privileged/admin audit visibility

Implemented in this slice:
- the Admin reports workspace now exposes the existing society-scoped `SecurityEvent` feed alongside the general audit feed for audit-authorized roles;
- the dedicated `AUDITOR` role is recognized by the Admin reports UI rather than being incorrectly hidden by a hard-coded role allowlist;
- the security view remains privacy-minimal: event type, reason, user/session identifiers and timestamp only; access/refresh tokens, token hashes, OTP values and request payloads are not exposed;
- permission regression coverage proves `AUDITOR` has audit/privacy read visibility without privacy, finance or society-configuration mutation authority;
- `ACCOUNTANT` and other roles without `AUDIT_READ` remain denied by the API permission guard even if a client attempts the endpoint directly.

The next V4.5 slice is the sensitive-data logging/redaction review and tests, followed by document/file authorization regression review.


## V4.5.4 — Sensitive-data logging redaction

Implemented in this slice:
- retained the existing metadata-only HTTP request log contract, which excludes query strings, authorization headers and request bodies;
- introduced a shared `safeOperationalError` descriptor that emits only a constrained error name and safe provider/client error code;
- removed raw exception messages and stacks from reviewed FCM, realtime notification, facilities automation, occupancy automation, payment reconciliation and External Services push-failure logs;
- changed durable payment retry evidence so upstream gateway exception text is not persisted as `failureMessage`; only the safe descriptor is retained;
- added unit tests proving secret-bearing exception messages/stacks are never reflected by the descriptor;
- added source-regression coverage over the reviewed operational logging paths to prevent reintroduction of raw `.message`/`.stack` logging.

This is a product security/privacy control, not a claim that every external infrastructure log sink is configured correctly. Hosted log retention, access control and destination policy remain deployment evidence.

The next V4.5 slice is the document/file authorization regression review, followed by privacy retention/deletion enforcement and security-event retention/closeout.
