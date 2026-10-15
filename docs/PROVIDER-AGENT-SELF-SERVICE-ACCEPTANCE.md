# Provider Agent Self-Service Acceptance Criteria

The milestone is complete when:

1. a normal authenticated Aaraagate user can resolve a field-agent identity only when explicitly linked to one active `ConsumerProviderAgent` under an active VERIFIED provider;
2. the database prevents more than one active user per agent and more than one active agent identity per user;
3. platform-authorized controls can link and revoke an agent identity without granting society or provider-operator authority;
4. an agent can list only assignments scoped to their resolved agent and provider;
5. assignment event reads reject foreign assignment IDs;
6. an agent can perform only ACCEPTED, REJECTED, EN_ROUTE and ARRIVED transitions on their own assignment;
7. RELEASED remains unavailable to the field agent;
8. the existing `ConsumerDispatchService` remains the single authoritative state machine and audit-event writer;
9. all agent self-service endpoints remain Bearer-authenticated and outside `TenantGuard`;
10. migration restore, API validation, authorization regression and repository CI are green on the exact PR head.
