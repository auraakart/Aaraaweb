# Aaraagate V4.68 — Emergency Contact Mutation Recovery

Date: 2026-09-28
Status: Repository release candidate closed on develop; release identity is 4.68.0.

## Slice 1 — Emergency contact retry safety

Emergency-contact add/remove flows now recover safely from ambiguous network outcomes without changing household membership or gate authority.

- Contact creation carries a request-bound idempotency key.
- The API verifies the existing household-manage-own boundary before processing the request.
- Same-key creates are serialized inside a transaction and replay only when normalized name, phone, relation and priority match the original intent.
- Reusing a key for changed contact intent fails closed with conflict.
- The Resident controller keeps the request identity for the same contact shape when a response or recovery read is lost, and reloads the authoritative household read model before accepting an uncertain outcome.
- Deactivation is idempotent only after the contact has been proven to belong to the same society/household; an already-inactive scoped contact is returned instead of producing a retry-only 404.
- The Resident screen delegates non-demo mutation/recovery to the controller and no longer manufactures contact state locally.

Historical EmergencyContact rows remain valid because the new idempotency key is nullable. The non-null key is unique per society and household.

## Boundary

Emergency contacts remain household information only. This release does not create resident membership, occupancy, gate-approval authority or new administrative permissions. Repository release truth is closed on `develop`; staging/main promotion and production/external acceptance remain separate.
