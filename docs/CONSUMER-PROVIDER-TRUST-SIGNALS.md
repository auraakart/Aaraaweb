# Consumer provider trust signals

External-service discovery now exposes provider trust signals derived only from authoritative Aaraagate transaction data.

## Signals

- **Average rating** and **rating count** come from immutable `ConsumerServiceRating` records created by completed-booking owners.
- **Completed jobs** counts external `ConsumerServiceBooking` records in `COMPLETED` state for the provider.
- Only active, verified service providers are returned by the trust-summary endpoint.

## API boundary

`GET /api/v1/consumer/services/providers/trust` uses the existing Bearer-authenticated consumer path. It does not use `TenantGuard` and therefore works for both independent-home and society users. The endpoint accepts no client-supplied provider, user, society or unit identifier for authorization.

The Resident external-services screen joins these provider-level summaries only onto offerings already returned by location-scoped serviceability discovery. The signals are informational and do not change provider ordering, serviceability, pricing or booking authorization.

## Out of scope

This milestone does not add rating-based ranking, paid placement, review-text publication, rating editing/deletion, moderation, incentives or provider replies.
