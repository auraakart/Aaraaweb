# V2.3 Ballot Blueprint & Electorate Review Foundation

## Purpose

This slice adds two governance-admin setup controls on top of the immutable election policy/electorate foundation:

1. append-only electorate review attestations; and
2. non-executable ballot blueprints tied to an immutable electorate snapshot.

It still does **not** enable statutory election execution or vote casting.

## Review boundary

Electorate review is evidence, not a mutation of eligibility. A review attestation can mark the current snapshot `REVIEWED` or `BLOCKED`, but it never edits, adds or removes snapshot members.

A review can only be recorded for a snapshot bound to the current enabled election policy revision. The reviewer must be a different governance actor from the actor who created the electorate snapshot.

Review attestations are append-only. If concerns are found later, a new `BLOCKED` attestation is appended; older evidence is retained. The latest attestation controls whether a ballot blueprint may be created.

## Ballot blueprint boundary

A ballot blueprint contains only:

- a title;
- a question;
- 2–20 unique option labels;
- the immutable electorate snapshot reference; and
- policy/evidence linkage.

A blueprint is permanently constrained to `DRAFT` in this slice. There is no API or database state for opening, publishing, executing or closing it.

Blueprint creation requires the latest electorate review attestation to be `REVIEWED`. The blueprint creator must differ from both the snapshot creator and the electorate reviewer.

## Explicitly not implemented

This slice does not implement:

- voter-facing ballot retrieval;
- ballot opening/closing;
- vote/cast records;
- secret-ballot storage or cryptographic secrecy;
- one-vote-per-unit or weighted voting semantics;
- joint-owner representative selection;
- proxy voting;
- nomination or candidate eligibility;
- disqualification handling;
- quorum/turnout enforcement;
- tallying or live result visibility;
- certification, recount, challenge or cancellation;
- statutory result publication.

Those capabilities remain fail-closed and must be introduced only after their policy, privacy, authorization, evidence and jurisdiction-specific controls are separately designed and tested.

## Tenant and entitlement controls

All APIs are tenant-scoped, require `GOVERNANCE_POLLS`, and use `GOVERNANCE_READ`/`GOVERNANCE_MANAGE` permissions. The setup records are append-only database evidence.
