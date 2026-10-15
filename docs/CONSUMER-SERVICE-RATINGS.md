# Consumer service ratings

## Purpose

Allow the authenticated booking owner to rate a completed external-service booking without coupling feedback to society roles, provider-operator authority, payments or gate access.

## Rules

- only the authenticated booking owner can read or create the rating for that booking;
- only `COMPLETED` bookings can be rated;
- one immutable rating per booking in this milestone;
- rating is an integer from 1 to 5;
- optional comment is limited to 1000 characters;
- provider and offering IDs are copied from the authoritative booking, never trusted from the client;
- repeat create requests return the existing rating rather than creating duplicates;
- provider aggregate computation uses only persisted completed-booking ratings.

## API

- `GET /api/v1/consumer/services/bookings/:id/rating`
- `POST /api/v1/consumer/services/bookings/:id/rating`

Example body:

```json
{ "stars": 5, "comment": "Great service" }
```

## Deferred

Rating edits/deletion, moderation, public review text, provider replies, ranking effects, incentives, dispute coupling and commercial policy are intentionally out of scope.
