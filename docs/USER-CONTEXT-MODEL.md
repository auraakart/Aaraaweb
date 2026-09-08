# Aaraagate user context model

## Scope

Aaraagate authentication is user-centric. Society membership is an access context, not the identity itself.

A single user may have one or more society/property contexts. A user with no society membership may still use the platform as an independent-home consumer for external services.

## Required login behaviour

1. Authenticate the user once.
2. Resolve every active society/property context available to that user.
3. A user with exactly one society context may enter it directly.
4. A user with multiple society contexts must choose a property immediately after login.
5. A user with no society membership enters the independent-home experience.
6. A signed-in multi-society user may switch society/property context without repeating OTP; the server validates the target membership and issues a new society-scoped session.

## Society/property context

A society context is scoped by `userId + societyId`, with property relationships derived from active `UnitOwnership` and `UnitOccupancy` records. Roles are evaluated inside the selected society only.

The context chooser displays the society plus the user's linked properties where available. Both ownership and occupancy are represented, and multiple roles in the same society must not create duplicate society choices.

The first chooser appears immediately after login for users with multiple society contexts. After entering a society, the same list is available under **My Properties** so the user can switch context without signing out.

Changing a client-side society or unit identifier must never grant access. Every protected API call must revalidate the active session context and the user's relationship to the requested resource. Authenticated context switching is permitted only when the server confirms an active membership in the target society.

## Independent-home context

An active Aaraagate user with no society membership may authenticate and receive a platform-scoped session without a `societyId`.

Allowed initial capability:

- external/household services marketplace.

Explicitly unavailable in independent-home context:

- gate and visitor management;
- society workforce/staff workflows;
- society notices;
- maintenance billing and society payments;
- society helpdesk;
- society reports and committee/admin functions;
- society SOS workflows that depend on society/gate operations.

Hiding navigation is not a security boundary. Society APIs must reject sessions that do not carry a valid society context.

## UI terminology

Use **My Properties** / **Choose Property** rather than **Choose Apartment**, so the model remains valid for flats, villas, independent houses and future property types.

## Infrastructure

Hosting, production infrastructure and deployment-provider decisions are deliberately outside this change and can be decided later.
