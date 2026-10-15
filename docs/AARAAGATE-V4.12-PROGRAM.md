# Aaraagate V4.12 Development Program

Version: 4.12
Date: 2026-09-18
Baseline: `develop@3a551544a270cebb1899865ede01cccc83f88eb7`
Repository completion commit before final reconciliation: `9587eb1521d3940ecc49d8557a7f4dce8c574901`
Theme: Smart Amenities & Community Operations
Status: **Repository development complete; field policy/device acceptance remains external**

## Objective
Raise the amenities/community/services domain through operational depth rather than adding a generic social feed. V4.12 extends the existing amenity policy engine with attendance truth, deterministic waitlist recovery, descriptive operations insight and resident/admin workflow polish.

## Completed sequence

| Slice | PR | Merge commit | Repository outcome |
|---|---:|---|---|
| V4.12.1 Attendance lifecycle | #656 | `e1f032e979518060a851d078803de1b51eb45f0b` | Manager check-in, completion and no-show states; configurable check-in/no-show timing; attendance actor/note/timestamps; Admin actions and regression tests |
| V4.12.2 Waitlist and promotion | #657 | `cbb3697b08c867d33e0f4f30c0f4c88528ba1df3` | Society/property-scoped FIFO waitlist; capacity-only join; resident list/cancel; deterministic oldest-eligible promotion after future capacity release under locking and eligibility recheck |
| V4.12.3 Operations analytics | #658 | `087187bdd24e1c73175942ffb1475d72243a6037` | Read-only 30-day booking, attendance, no-show, cancellation, waitlist and promotion metrics plus per-amenity demand signals; explicitly non-predictive Admin snapshot |
| V4.12.4 Resident/Admin UX | #659 | `9587eb1521d3940ecc49d8557a7f4dce8c574901` | Property-scoped Resident waitlist position/history, active waitlist cancellation, and explicit consent before joining after a genuine capacity conflict; Admin attendance and analytics surfaces remain from earlier slices |
| V4.12.5 Evidence reconciliation | pending this reconciliation PR | — | Traceability, completion evidence and evidence-only re-score |

## Engineering boundaries preserved
- No physical access/check-in hardware.
- No external messaging/provider dependency.
- No automatic penalty or financial posting for no-shows.
- No AI/opaque queue ranking; promotion remains deterministic FIFO with current eligibility checks.
- No automatic Resident waitlist enrollment; the user explicitly chooses to join after the booking endpoint confirms a capacity conflict.
- Analytics remain descriptive and return `predictive:false`; they do not forecast demand or allocate capacity.
- `main` remains untouched without explicit release approval.

## Final repository gate
The merged functional slices passed their exact-head CI and affected regression contracts. V4.12.1–4 preserved clean migrations, API lint/typecheck/tests/build/runtime readiness, Flutter analysis/tests, Admin validation, dependency security and applicable cross-role/security/pilot/performance contracts. Field policy acceptance, representative-device acceptance and real-society outcomes remain separate evidence.
