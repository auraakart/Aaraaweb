# V2.3 Election Hold / Challenge Control Foundation

## Purpose

This slice adds an append-only governance hold mechanism for a ballot draft. A hold is a fail-closed control for unresolved electorate, procedure, privacy/security, legal-policy or incident concerns. It does not implement challenge adjudication, ballot execution or vote casting.

## Evidence model

`GovernanceElectionHoldEvent` is append-only. Each ballot draft has a monotonically increasing event sequence. Supported actions are:

- `OPEN_HOLD`
- `RESOLVE_HOLD`
- `CANCEL_HOLD`

The current hold state is derived from the latest event. An `OPEN_HOLD` is active until a later `RESOLVE_HOLD` or `CANCEL_HOLD` event is appended.

Hold categories are `ELECTORATE`, `PROCEDURE`, `PRIVACY_SECURITY`, `LEGAL_POLICY`, `INCIDENT`, and `OTHER`. Every event requires a reason.

## Separation of duties

A governance actor who opens a hold cannot resolve or cancel that same active hold. Resolution/cancellation requires a different governance actor. Writes serialize on the society row to keep event sequencing deterministic.

This is a minimum control boundary, not a complete statutory challenge-adjudication process.

## Readiness behavior

Election readiness now includes `noActiveHold`. If the latest hold event is `OPEN_HOLD`, readiness returns:

- `configurationReady: false`
- blocker `ACTIVE_ELECTION_HOLD`
- the latest hold action, sequence, and category
- `executionEnabled: false`
- `castingEnabled: false`

A resolved or cancelled hold removes this specific blocker, but all other readiness prerequisites still apply.

## Explicit exclusions

This slice does not add:

- ballot opening or closing;
- voter credentials or cryptographic material;
- vote casting or vote storage;
- challenge adjudication rules or legal findings;
- quorum, tally or result computation;
- certification, recount or result publication; or
- any representation that Aaraagate has determined legal eligibility to conduct a statutory election.

Any future executable election lifecycle must remain fail-closed behind the full policy, electorate, procedure, privacy, approval and hold-control evidence chain.
