# V2.3 Ballot Blueprint, Electorate Review & Decision Evidence

## Purpose

This V2.3 election setup layer builds on the immutable election-policy and electorate-snapshot foundation. It now provides:

1. append-only electorate review attestations;
2. non-executable ballot blueprints tied to immutable electorate snapshots; and
3. append-only approval, rejection and cancellation evidence for ballot blueprints.

It still does **not** enable statutory election execution or vote casting.

## Electorate review boundary

Electorate review is evidence, not a mutation of eligibility. A review attestation may mark the current snapshot `REVIEWED` or `BLOCKED`, but it never edits, adds or removes snapshot members.

A review can only be recorded for a snapshot bound to the current enabled election policy revision. The reviewer must be a different governance actor from the actor who created the electorate snapshot.

Review attestations are append-only and monotonically sequenced per snapshot. A later `BLOCKED` review therefore remains unambiguous and prevents new ballot-blueprint approval activity until a later valid review resolves the concern.

## Ballot blueprint boundary

A ballot blueprint contains only a title, question, 2–20 unique option labels, the immutable electorate snapshot reference and its policy/evidence linkage.

The database continues to constrain the blueprint itself to `DRAFT`. There is no API or database state for opening, publishing, executing or closing a ballot.

Blueprint creation requires the latest electorate review attestation to be `REVIEWED`. The blueprint creator must differ from both the snapshot creator and the electorate reviewer.

## Approval / rejection / cancellation evidence

Ballot decisions are append-only, monotonically sequenced evidence records:

- `APPROVED` records independent governance approval of the blueprint definition only. It does **not** make the ballot executable.
- `REJECTED` records a terminal rejection and requires a reason.
- `CANCELLED` records a terminal cancellation and requires a reason.

Approval and rejection require the blueprint to remain bound to the current enabled election policy and require the current electorate review to remain `REVIEWED`.

The approving/rejecting actor must be different from the ballot-draft creator, electorate-snapshot creator and current electorate reviewer. This extends separation of duties across policy setup, electorate capture, review, ballot drafting and approval evidence.

Cancellation is deliberately fail-safe. A governance manager may cancel an existing ballot blueprint even if the related policy is later disabled/superseded or the electorate review later becomes blocked. This ensures safety actions are not prevented by a stale or withdrawn policy state.

Once rejected or cancelled, a ballot blueprint decision history is terminal. After approval, the only permitted later decision is cancellation.

Every decision response continues to report `executable: false` and `castingEnabled: false`.

## Explicitly not implemented

This layer still does not implement:

- voter-facing ballot retrieval;
- ballot opening/closing or execution lifecycle;
- vote/cast records;
- secret-ballot storage or cryptographic secrecy;
- one-vote-per-unit or weighted voting semantics;
- joint-owner representative selection;
- proxy voting;
- nomination/candidate eligibility or disqualification;
- quorum/turnout enforcement;
- tallying or live result visibility;
- certification or statutory result publication;
- recount or post-result challenge processing.

Those capabilities remain fail-closed and require separate policy, privacy, authorization, evidence and society/jurisdiction-specific controls before activation.

## Tenant and entitlement controls

All APIs remain tenant-scoped, require `GOVERNANCE_POLLS`, and use `GOVERNANCE_READ` / `GOVERNANCE_MANAGE` permissions. Review, blueprint and decision evidence is append-only in PostgreSQL.
