# Aaraagate V4.63.0 — SOS State Convergence & Recovery

Date: 2026-09-27
Status: Release candidate closed on `develop`; release identity is V4.63.0.

## Objective

Prevent duplicate or stale Resident SOS actions when network outcomes are uncertain, without widening emergency-response authority or introducing a parallel SOS model.

## Server duplicate-active protection

Resident SOS creation is serialized by society, unit and resident inside the existing transaction. After acquiring a transaction-scoped advisory lock, the service reuses an existing `ACTIVE` or `ACKNOWLEDGED` incident instead of inserting another active emergency and duplicate trigger event.

This remains scoped to the same resident and property. It does not merge incidents across residents or change responder authority.

## Resident status parity and recovery

The Resident model recognizes backend-authoritative `ACTIVE` status as active while retaining legacy `TRIGGERED` compatibility.

When a trigger response fails after the server may have committed, the client reloads `/sos/mine` and accepts recovered success only when an authoritative active incident exists for the selected property. It does not automatically submit a second SOS.

When cancellation has an uncertain outcome, the client reloads authoritative incidents and removes the stale Cancel action when the incident is already cancelled, resolved, or otherwise inactive. If it remains active, the original failure remains retryable.

## Regression contract

`pnpm check:v4.63` and CI enforce server advisory serialization and duplicate-active reuse, ACTIVE/TRIGGERED Resident status compatibility, authoritative trigger/cancel recovery, focused regressions, and aligned 4.63.0 runtime identity.

## Boundary

V4.63.0 does not change SOS responder permissions, acknowledgement/escalation/resolution rules, emergency-contact access, or field-response policy. It does not claim staging/main promotion, productionization, hosted acceptance, live emergency-provider integration, hardware certification or field-pilot acceptance.
