# Aaraagate V4.63.0 — SOS State Convergence & Recovery Release Closure

Date: 2026-09-27

## Release identity

- root workspace: `4.63.0`
- API: `4.63.0`
- Admin: `4.63.0`
- Resident: `4.63.0+46300`
- Guard: `4.63.0+46300`

## Closed slice

- PR #934 — serialize Resident SOS creation by society/unit/resident, reuse an existing ACTIVE/ACKNOWLEDGED incident after retries, align Resident ACTIVE/TRIGGERED status handling, and recover uncertain trigger/cancel outcomes by re-reading authoritative SOS state.

## Authority and recovery invariants

V4.63.0 does not widen SOS responder permissions, acknowledgement/escalation/resolution authority, emergency-contact access or field-response policy. Recovery does not manufacture a local SOS result: the client re-reads the existing authoritative incident state and only treats an uncertain action as recovered when that state proves the outcome.

The backend duplicate-active guard remains scoped to the same society, unit and resident. It does not merge emergencies across residents or properties.

## Historical regression compatibility

The V4.62 household-staff recovery guard remains intact while V4.63.0 advances runtime identity. V4.63 CI preserves the completed V4.56–V4.62 recovery and authorization contracts before validating SOS-specific evidence.

## Boundary

This closure is repository evidence on `develop` and does not claim staging/main promotion, productionization, hosted acceptance, live emergency-provider integration, physical-device certification, signed store release or field-pilot/business acceptance.
