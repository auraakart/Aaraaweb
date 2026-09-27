# Aaraagate V4.59 — Secure Physical Handover Convergence

Date: 2026-09-27
Status: Development started on develop; release identity remains 4.58.0.

## Objective

Remove physical-handover shortcuts that contradict stronger verification flows. V4.59 does not add a new authority layer; it converges clients and public routes onto existing server-verified operational transitions.

## Slice 1 — Secure parcel handover

The parcel flow already has a short-lived resident pickup code and a security-desk `collect-with-code` transition. That transition validates the code, enforces expiry/attempt-lock rules, clears pickup credentials after success and records both `PICKUP_CODE_VERIFIED` and `COLLECTED` events.

The legacy resident `mine/:parcelId/collect` route allowed the recipient to mark the same parcel collected without security verifying the pickup code. The Resident app also exposed this as “I collected it”, contradicting its own secure-handover copy.

V4.59 removes that resident self-confirm route and client action. Residents keep read-own and pickup-code issuance; security keeps `PARCEL_PROCESS` and the existing code-verification handover. No parcel is marked collected merely from a Resident-client acknowledgement.

## Slice 2 — Pickup-code lifecycle integrity

Pickup-code issuance is now serialized per society and parcel using the repository's existing PostgreSQL advisory-lock pattern, and the code update plus `PICKUP_CODE_ISSUED` evidence are committed in one transaction. Resident blocks duplicate issuance taps while a request is active so a second tap cannot silently invalidate the code being generated.

The pickup dialog no longer hardcodes the ten-minute policy. It renders the server-returned expiry time and `maxAttempts` guidance, keeping the client aligned if the server policy changes.

## Regression contract

`pnpm check:v4.59` and CI require the verified security handover path, atomic/serialized pickup-code issuance, server-derived expiry/attempt guidance and duplicate-submit protection while forbidding the legacy resident self-confirm API/client/UI tokens. Resident widget coverage confirms active-property isolation and the pickup-code lifecycle.

## Boundary

This is a V4.59 development slice. It does not claim a 4.59.0 release, staging/main promotion, productionization, physical-device certification or field acceptance.
