# Aaraagate V3.3 — Guard App 2.0

## Objective
Deliver a fast, offline-resilient, multilingual security-operations experience suitable for large Indian residential communities while preserving society isolation, guard/supervisor authorization and auditable gate mutations.

## Baseline already available
- QR-first credential verification and check-in/check-out.
- Delivery, cab and walk-in approval flows.
- Parcel and workforce guard workflows.
- Tenant-scoped guard sessions and gate assignments.
- Secure offline check-in/check-out queue with idempotency and recovery tests.
- Realtime gate-event refresh.

## V3.3 scope
1. **Fast operations** — routine gate flow should remain low-tap; introduce searchable large-unit lookup and provider/repeat shortcuts.
2. **Offline-first hardening** — broaden safe queued operations where semantics allow it, surface retained/rejected actions and preserve per-society/per-guard isolation.
3. **Regional guard UX** — English, Hindi, Tamil, Telugu, Kannada, Malayalam, Marathi and Bengali operational vocabulary, with a path for voice prompts.
4. **Risk awareness** — overstay and watchlist/denylist visibility without allowing local bypasses.
5. **Operational passes** — material movement and move-in/move-out evidence flows with expiry/status/audit controls.
6. **Patrol & incidents** — checkpoint scans and incident capture with timestamp, gate/guard identity, notes and media-reference support.
7. **Supervisor operations** — gate/realtime/offline status plus operational exception counts and review queues.

## Exit gates
- Guard Flutter analyze and tests green.
- API lint/typecheck/tests/build and clean migrations green for new backend support.
- Guard vs supervisor permissions explicitly covered.
- Cross-society access rejected in tests.
- Offline queue remains idempotent, scoped and recoverable.
- Existing visitor, parcel and workforce regression remains green.
- Full repository CI green before merge to `develop`.

## Release boundary
V3.3 merges only to `develop`. Staging is used only when device/network behavior requires it. `main` remains a manually approved release boundary.
