# Aaraagate V4.59.0 — Secure Physical Handover Release Closure

Date: 2026-09-27

## Release identity

- root workspace: `4.59.0`
- API: `4.59.0`
- Admin: `4.59.0`
- Resident: `4.59.0+45900`
- Guard: `4.59.0+45900`

## Closed slices

- PR #920 — removed Resident self-confirm parcel collection and retained the security-desk `collect-with-code` transition as the authoritative handover.
- PR #921 — serialized pickup-code issuance per parcel, committed credential rotation plus `PICKUP_CODE_ISSUED` evidence atomically, blocked duplicate Resident issuance taps and rendered server-returned expiry/max-attempt guidance.
- PR #922 — mapped Guard pickup verification failures to safe recovery guidance, rejected malformed six-digit codes before the API call and explicitly withheld handover until server verification succeeds.

## Authority and evidence invariants

V4.59.0 does not widen parcel ownership or Guard authority, create a client-side collection state, or bypass pickup-code verification. The server continues to enforce current parcel state, pickup-code expiry, attempt locking and `PARCEL_PROCESS`; successful security verification records the existing pickup verification and collection evidence before clients reload authoritative state.

## Historical regression compatibility

The V4.58 Resident service-recovery regression guard continues to require its exact historical feature and closure evidence while accepting later aligned runtime versions. This prevents the completed V4.58 release check from blocking legitimate V4.59.0 identity progression.

## Boundary

This closure is repository evidence on `develop` and does not claim staging/main promotion, productionization, hosted acceptance, live provider/payment/KYC integration, physical-device certification, signed store release or field-pilot/business acceptance.
