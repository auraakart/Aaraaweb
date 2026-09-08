# Consumer booking push notifications

## Objective

Give both independent-home users and society users timely external-service booking updates without coupling the consumer marketplace to society tenancy.

## Boundary

Consumer notification registration is authenticated with `BearerGuard` only. It does not use `TenantGuard`, does not derive provider authority, and does not expose society-specific data.

The existing Firebase transport remains the delivery mechanism. Consumer device registrations are stored separately from society-scoped resident registrations so an independent-home user never needs a synthetic society or home membership merely to receive marketplace notifications.

## V1 events

This slice sends push notifications when a consumer service booking moves to:

- `CONFIRMED`
- `CANCELLED`

The event payload contains only the consumer booking id, event type and status. Human-readable notification text uses the stored offering/provider relationship on the server.

## Registration API

- `POST /api/v1/consumer/notifications/devices/register`
- `POST /api/v1/consumer/notifications/devices/unregister`

Both endpoints derive the user from the authenticated session. The client never submits a trusted `userId`, `societyId`, `providerId` or `agentId`.

## Resident client behavior

When Firebase support is enabled, the Resident app registers the token for consumer notifications for every authenticated user. It also attempts the existing society-scoped resident registration; that second registration is best-effort because independent sessions intentionally do not have society tenant context.

Logout unregisters both consumer and society registrations best-effort.

## Reliability

Booking state changes commit before push delivery is attempted. FCM delivery failures are logged and do not roll back or fail the booking transition. Invalid/unregistered consumer tokens are deactivated.

## Deferred

- dispatch-assignment and ETA notifications
- agent-arrived notifications
- completion-request and completion-confirmed notifications
- payment notifications
- notification inbox/history
- provider-side push notifications
- deep-link navigation directly into a booking detail route
