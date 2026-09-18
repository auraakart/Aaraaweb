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
