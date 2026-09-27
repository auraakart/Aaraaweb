# Aaraagate V4.59 — Secure Physical Handover Convergence

Date: 2026-09-27
Status: Release candidate closed on develop; release identity is 4.59.0.

## Objective

Remove physical-handover shortcuts that contradict stronger verification flows. V4.59 does not add a new authority layer; it converges clients and public routes onto existing server-verified operational transitions.

## Slice 1 — Secure parcel handover

The parcel flow already has a short-lived resident pickup code and a security-desk `collect-with-code` transition. That transition validates the code, enforces expiry/attempt-lock rules, clears pickup credentials after success and records both `PICKUP_CODE_VERIFIED` and `COLLECTED` events.

The legacy resident `mine/:parcelId/collect` route allowed the recipient to mark the same parcel collected without security verifying the pickup code. The Resident app also exposed this as “I collected it”, contradicting its own secure-handover copy.

V4.59 removes that resident self-confirm route and client action. Residents keep read-own and pickup-code issuance; security keeps `PARCEL_PROCESS` and the existing code-verification handover. No parcel is marked collected merely from a Resident-client acknowledgement.

## Slice 2 — Pickup-code lifecycle integrity

Pickup-code issuance is now serialized per society and parcel using the repository's existing PostgreSQL advisory-lock pattern, and the code update plus `PICKUP_CODE_ISSUED` evidence are committed in one transaction. Resident blocks duplicate issuance taps while a request is active so a second tap cannot silently invalidate the code being generated.

The pickup dialog no longer hardcodes the ten-minute policy. It renders the server-returned expiry time and `maxAttempts` guidance, keeping the client aligned if the server policy changes.

## Slice 3 — Guard pickup recovery clarity

The Guard parcel desk now treats code verification failures as operational recovery states instead of exposing raw backend text. A malformed code is rejected locally before any handover call. Server responses for unissued, expired, locked or invalid codes instruct security to obtain/recheck a resident code and explicitly withhold handover until verification succeeds. Transport, session and permission failures likewise produce safe next steps.

These messages do not weaken authorization: the Guard client still calls only `collect-with-code`, and the server remains the authority for code validity, attempt locking and the collected transition.

## V4.59 release closure

The secure physical-handover milestone is closed on `develop` as a 4.59.0 repository release candidate after slices #920–#922. The closure removes Resident self-confirm collection, serializes and atomically records pickup-code issuance, keeps server-returned expiry/attempt policy authoritative in Resident, and gives Guard safe recovery guidance for invalid, expired, locked, unissued, transport and authorization failures.

The authoritative handover remains the security-desk `collect-with-code` transition. Resident ownership scope, Guard `PARCEL_PROCESS` authority, pickup-code attempt locking, pickup verification and collection evidence remain server-authoritative; no client can manufacture collection success locally.

## Regression contract

`pnpm check:v4.59` and CI require the verified security handover path, atomic/serialized pickup-code issuance, server-derived expiry/attempt guidance, Resident duplicate-submit protection, Guard recovery guidance, aligned 4.59.0 runtime identity and release-closure evidence while forbidding the legacy resident self-confirm API/client/UI tokens. Resident and Guard tests cover the pickup-code lifecycle and safe failure states.

## Boundary

V4.59 is closed as a repository release candidate on develop. This does not claim staging/main promotion, productionization, hosted acceptance, physical-device certification, signed store release or field acceptance.
