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

## Safety and privacy boundary

The security-event ledger is operational audit evidence, not a user-behaviour analytics stream. It must remain minimal, purpose-limited and free of credentials/secrets. Retention and access policy will be reviewed in later V4.5 slices together with privacy retention/deletion controls.

DPDP-oriented documentation in V4.5 describes product/operational controls only. It must not claim legal certification or statutory compliance without qualified legal review.

## Next V4.5 slices

1. resident privacy self-service request/export/deletion workflow;
2. privileged/admin audit visibility and negative-permission expansion;
3. sensitive-data logging/redaction review and tests;
4. document/file authorization regression review;
5. privacy retention/deletion enforcement points and legal-hold interaction;
6. security-event reporting/retention completion and V4.5 closeout.
