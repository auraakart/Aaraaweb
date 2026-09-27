# Aaraagate V4.60 — Gate Decision Recovery

Date: 2026-09-27
Status: Release candidate closed on `develop`; release identity is V4.60.0.

## Objective

Remove duplicate/stale Resident gate-decision behavior without widening access authority or creating a parallel gate state model.

## Slice 1 — Resident gate mutation serialization

Each visible gate request card now permits only one approve, deny or cancel mutation at a time. Once an action starts, sibling mutation controls on that card are disabled until it completes. This prevents rapid taps from issuing parallel resident decisions while keeping the existing backend transition checks authoritative.

## Slice 2 — Authoritative stale-decision recovery

ResidentDataController wraps approve/deny/cancel mutations with a recovery reload. If a mutation fails because Guard/realtime activity or another resident already changed the request, the controller reloads the current access-request state before rethrowing the failure. Network and authorization failures also attempt the same safe read refresh; the original mutation error remains the surfaced error.

## Slice 3 — Authoritative outcome clarity

When a Resident decision loses a race and the recovery reload shows a different status, Gate now reports that refreshed status instead of only showing a generic failure. Status pills also use state-appropriate tones: pending remains warning, approved/checked-in are positive, denied is danger, and cancelled/checked-out are neutral. This is presentation of authoritative state only; no client-side transition is invented.

## Slice 4 — Visitor-pass cancellation review

Approved visitor cards now show the server-returned validity window before offering cancellation. Cancelling an approved visitor pass requires an explicit review dialog that explains the credential becomes unusable immediately; the server cancellation call is not sent until the resident confirms. The existing audited cancellation transition remains authoritative.

## Authority boundary

V4.60 does not change current-occupancy/gate-approver authorization, access-request states, visitor validity windows, credential issuance, Guard check-in/check-out authority or audit semantics. The server continues to perform conditional status updates and rejects stale transitions.

## V4.60 release closure

The milestone is closed on `develop` after PRs #924–#926. The four slices remain intentionally bounded to Resident gate decision serialization, authoritative stale-state recovery, state-accurate outcome presentation and review-before-cancel for approved visitor passes. Server authorization, compare-and-swap access transitions, visitor validity policy, Guard authority and audit evidence remain unchanged.

## Regression contract

`pnpm check:v4.60` and CI require the per-card mutation lock, controller recovery reload, focused duplicate-tap/stale-state tests, visitor-pass cancellation review, aligned runtime identity and release-closure evidence.

## Boundary

V4.60 is closed as a repository release candidate on `develop`. This does not claim staging/main promotion, productionization, hosted acceptance, live provider integration, hardware certification, signed store release or field-pilot/business acceptance.
