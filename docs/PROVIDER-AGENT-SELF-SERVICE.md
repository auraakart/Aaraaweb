# Provider Agent Self-Service

## Goal

Allow an Aaraagate user who has been explicitly linked to an operational `ConsumerProviderAgent` record to act as that field agent on their own assigned external-service jobs.

## Identity model

`Aaraagate User -> ConsumerProviderAgentIdentity -> ConsumerProviderAgent -> ServiceProvider`

The identity is independent from society membership, guard roles and provider-operator permissions. A user must have exactly one active agent identity. The linked agent and provider must both be active and the provider must be VERIFIED.

The database enforces at most one active identity per user and at most one active user per agent.

## Linking and revocation

V1 linking is a platform-authorized operation guarded by `PLATFORM_PROVIDER_VERIFY`. This avoids letting a provider browser session bind arbitrary Aaraagate users to field-agent identities before an invitation/verification flow is designed.

Platform endpoints:

- `POST /api/v1/platform/services/provider-agents/:agentId/identity`
- `POST /api/v1/platform/services/provider-agents/:agentId/identity/:userId/revoke`

## Agent self-service API

All agent routes require Bearer authentication and do not use `TenantGuard`.

- `GET /api/v1/provider-agent/services/me`
- `GET /api/v1/provider-agent/services/assignments`
- `GET /api/v1/provider-agent/services/assignments/:assignmentId/events`
- `POST /api/v1/provider-agent/services/assignments/:assignmentId/status`

The assignment queue is scoped by both resolved `agentId` and `providerId`. It exposes only fulfilment information required for the assigned job, including offering, service address, schedule, notes and dispatch timestamps.

## Allowed field-agent actions

A field agent may perform only these existing dispatch transitions on their own assignment:

- `ACCEPTED`
- `REJECTED`
- `EN_ROUTE`
- `ARRIVED`

The shared dispatch state machine remains authoritative and continues to enforce valid predecessor states and row locking. `RELEASED` remains a provider/platform operational action; agents cannot release their own assignment.

Agent actions use the authenticated Aaraagate `userId` as `actorUserId`, making the assignment event audit trail attributable to the actual field agent rather than the provider operator.

## Security boundaries

- the client never supplies a trusted provider ID or agent ID for self-service scope;
- assignment IDs are rechecked against the resolved agent and provider before events or mutations are exposed;
- no society role, gate role or `TenantGuard` participates in external provider-agent authorization;
- agent identity grants no ability to manage provider areas, offerings, availability, booking acceptance, other agents or provider configuration;
- agent dispatch changes do not implicitly change the consumer booking fulfilment state machine.

## Deferred

- invitation/claim UX for linking an agent by verified phone;
- dedicated field-agent mobile application;
- push notifications;
- live GPS, routing and ETA;
- masked calling;
- automatic society gate-entry linkage;
- provider payouts/settlement and KYC/commercial rules.
