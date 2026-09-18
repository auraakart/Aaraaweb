# Aaraagate V4.7 — Vendor-Neutral Access Integration Hardening

Date: 2026-09-18
Status: Repository implementation candidate
Baseline: V4.6 complete on develop

## Goal

Harden the V3.7 access-integration foundation so societies can connect different physical-access ecosystems without coupling core gate operations to any single hardware vendor.

## Existing V3.7 foundation reused

- hardware-neutral AccessDeviceAdapter;
- ANPR, boom-barrier and RFID simulators;
- society/gate/device mapping;
- adapter health and last-seen evidence;
- idempotent device commands;
- external event deduplication;
- tenant-scoped device/event reads;
- GATE_READ / GATE_MANAGE authorization;
- manual gate processing implemented independently in AccessModule.

## V4.7 hardening

### Common adapter contract

ANPR, boom-barrier and RFID simulators now share regression coverage requiring:
- health reporting;
- deterministic idempotent command receipts;
- fail-closed offline behavior.

### Semantic idempotency safety

A duplicate command idempotency key is accepted only when command and payload match the original evidence. Reusing the key for a different command fails closed.

A duplicate external event identifier is accepted only when event type, timestamp and payload match the original event. Reusing an external event identifier for different evidence fails closed.

This prevents vendor retries from silently re-labeling an earlier access action or event.

### Manual fallback

A failed persisted hardware command returns:
- available=true;
- path=MANUAL_GATE_OPERATION;
- the adapter failure reason.

Core manual visitor/access processing remains in AccessModule and has no dependency on AccessIntegrationModule. A regression test protects that architectural separation, so an ANPR/barrier/RFID failure cannot remove normal guard processing.

### Audit visibility

Gate readers can inspect tenant-scoped command history per active device. The audit view includes command status/result and actor/time evidence while deliberately excluding the original command payload.

Device events remain tenant/device scoped and retain their vendor event deduplication evidence.

### Future compatibility path

The repository now declares compatibility contracts for:
- biometric devices;
- smart locks;
- intercom/CCTV;
- lift access;
- EV gateways.

Every future adapter must:
- own its vendor transport/protocol implementation;
- have no direct database credentials/access;
- use idempotent commands;
- use externally deduplicated event identifiers;
- expose health capability;
- preserve a manual fallback path.

These targets are compatibility contracts, not claims of production hardware support.

## Production hardware boundary

Real vendor protocols, credentials, callback authentication, network topology and field-device certification remain provider/site-specific external work. V4.7 proves the repository abstraction, simulator behavior, persistence safety and manual-fallback architecture. Production activation requires a vendor adapter implementation plus site acceptance against the same contract.

## Exit criteria

- ANPR, boom-barrier and RFID pass common contract tests.
- Command and event retries cannot collide semantically.
- Hardware failure cannot block manual gate operations.
- Automated command evidence remains tenant scoped and auditable.
- Device/site mapping and health remain society/gate scoped.
- Compatibility requirements exist for biometric, smart-lock, intercom/CCTV, lift and EV extensions.
- Full exact-head API/Admin/Flutter/security/role/pilot gates pass before merge.

No staging or main promotion is part of V4.7.
