# Consumer service notifications

## Purpose

External-service notifications must work for both independent-home users and society users without weakening society tenant isolation.

The notification path is intentionally user-scoped rather than society-scoped:

`Authenticated user -> ConsumerPushToken -> Consumer service lifecycle event -> FCM`

Society gate, notice and billing push delivery continues to use the existing society-scoped `DevicePushToken` path.

## Registration

The Resident app registers its FCM token with `/api/v1/consumer/notifications/devices/register` for every authenticated user. This endpoint is Bearer-authenticated and does not use `TenantGuard`.

When a valid society context is present, the app also keeps the existing `/api/v1/notifications/devices/register` registration so society-specific notifications continue to work. Independent-home sessions intentionally ignore failure of that society registration because they have no tenant context.

Consumer token unregister is user-scoped. A caller cannot unregister another user's token.

## Lifecycle notifications

Consumer push delivery is best-effort and happens only after authoritative database state has committed. FCM failures never roll back booking, dispatch or completion transitions.

Current notification events include:

- provider confirmation or decline;
- field-agent assignment;
- assignment acceptance;
- field agent en route;
- field agent arrived;
- assignment rejection or release;
- service started;
- service professional requested customer completion confirmation.

The push payload carries only navigation/state identifiers such as `bookingId`, `assignmentId`, event `type` and status. Authorization remains server-side when the app follows a notification.

## Security boundaries

- No society ID is required to register or deliver consumer-service push notifications.
- Consumer token ownership is derived from the authenticated Bearer session; no client-supplied user ID is trusted.
- Society-scoped `DevicePushToken` behavior remains unchanged.
- Provider/operator/agent actions never choose the notification recipient; the booking's stored `userId` is authoritative.
- Notification delivery failure cannot change transaction outcome.

## Data model

`ConsumerPushToken` stores one active registration per FCM token with authenticated `userId`, platform, optional device identifier and activity timestamps. The table is separate from society-scoped push registrations so independent-home support does not make `DevicePushToken.societyId` nullable or weaken existing tenant assumptions.
