# V2.3 Election Procedure Policy Foundation

## Purpose

This foundation records the society-specific procedural references that would be required before any statutory/digital election execution could be designed. It does **not** implement those rules and does **not** enable voting.

Each append-only procedure revision is bound to the current enabled election policy revision and must document all of the following:

- joint-ownership handling;
- proxy handling;
- vote entitlement / vote basis;
- quorum / turnout requirements;
- ballot secrecy / privacy requirements;
- challenge procedure;
- recount procedure;
- certification procedure; and
- result-publication procedure.

Aaraagate does not choose a nationwide default for any of these topics. The society must record the applicable governing reference. Where its governing framework permits a topic to be non-applicable, that non-applicability should be recorded explicitly rather than represented by an empty value.

## Evidence and separation of duties

Procedure revisions are append-only and monotonically versioned under the current election-policy revision. Recording a revision serializes on the society row, and the actor who recorded the current election-policy revision cannot also record its procedure revision.

A new election-policy revision creates a new policy context; procedure revisions attached to an older policy are not treated as current.

## Execution boundary

Procedure-policy APIs are governance-admin configuration/evidence only. Responses report `executionEnabled: false` and `castingEnabled: false`.

This foundation does not provide:

- voter-facing election retrieval;
- proxy assignment or validation;
- joint-owner representative selection;
- vote-weight calculation;
- quorum/turnout calculation;
- ballot opening/closing;
- vote/cast storage;
- secret-ballot implementation;
- tallying;
- certification execution;
- recount execution;
- challenge adjudication; or
- statutory result publication.

Those capabilities remain fail-closed until separately designed, reviewed and tested against the configured society framework.

## Authorization

All APIs remain tenant-scoped, require the `GOVERNANCE_POLLS` entitlement and use `GOVERNANCE_READ` / `GOVERNANCE_MANAGE` permissions.
