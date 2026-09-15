# V2.3 Election Policy & Electorate Snapshot Foundation

## Purpose

This foundation prepares Aaraagate to support society-specific statutory/election workflows without assuming one nationwide eligibility rule. It does **not** enable ballot casting or statutory election execution.

## Safety boundary

Statutory/election functionality remains fail-closed. A society must first have `GOVERNANCE_POLLS` enabled and record an explicit governance election policy revision with a policy/bye-law reference.

Supported eligibility modes in this foundation are:

- `VERIFIED_OWNERS` — snapshot only active, currently effective, verified `UnitOwnership` relationships.
- `VERIFIED_OWNERS_AND_ACTIVE_OCCUPANTS` — include the verified-owner set and then current active `UnitOccupancy` relationships, deduplicated per user/unit. This mode must be explicitly selected by the society; it is not a default legal assumption.

The application does not infer tenant/occupant voting rights from Indian law, a state act, or generic apartment practice. The society is responsible for selecting a mode that matches its governing framework and recording the applicable reference.

## Evidence model

Election policy changes are append-only revisions. Older revisions are never overwritten.

Electorate snapshots are immutable evidence records tied to exactly one policy revision. Snapshot members preserve the source relationship identifier and whether eligibility came from verified ownership or active occupancy. Later changes to ownership or occupancy do not mutate an already-created snapshot.

Policy revision creation and electorate capture serialize on the society row to avoid a race where a snapshot could silently bind to a superseded policy revision.

A different governance actor must create the electorate snapshot from the actor who recorded the active policy revision. This introduces a minimum separation-of-duties control before any future ballot workflow is allowed.

## Explicitly not implemented

This foundation provides no API or database model for:

- ballot casting or vote storage;
- live or final election tallying;
- proxy, nomination, joint-ownership representative or disqualification handling;
- one-vote-per-unit, weighted voting or share-based voting semantics;
- quorum or turnout enforcement;
- secret-ballot guarantees;
- election opening/closing;
- certification, recount, challenge or cancellation;
- statutory result publication.

Those capabilities require separate policy models, privacy controls, separation-of-duties checks, negative authorization tests, and jurisdiction/society-specific validation before activation.

## Current APIs

Governance admins with the appropriate permissions can read the current policy revision, append a new revision, create an immutable electorate snapshot, list snapshots, and inspect snapshot member identifiers. All endpoints are tenant-scoped and additionally protected by the `GOVERNANCE_POLLS` entitlement.

Resident-facing community polls remain a separate non-statutory feature and continue to carry `statutoryUseProhibited` safeguards.
