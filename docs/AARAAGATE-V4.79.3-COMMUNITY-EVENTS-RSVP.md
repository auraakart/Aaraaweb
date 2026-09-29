# Aaraagate V4.79.3 — Community Events + RSVP

Date: 2026-09-29

Baseline: `develop@cd2a30d289dc192f2bf116e016434bcaaa078d79`

## Objective

Add a lightweight community-event capability for Indian residential societies without misusing governance meetings, polls or legal voting records.

## Implemented

- Separate `CommunityEvent` and `CommunityEventRsvp` persistence.
- Draft → published/cancelled lifecycle.
- COMMUNITY and OWNER_ONLY audience scopes.
- Current owner/occupant validation for resident visibility; OWNER_ONLY requires current verified ownership.
- Optional event capacity enforced transactionally on the server.
- One RSVP per authenticated user per event, mutable between GOING and NOT_GOING while RSVP remains open.
- Resident UI exposes upcoming event details, capacity and the resident’s own response.
- Admin UI exposes only aggregate GOING / NOT_GOING counts, never participant names or phone numbers.
- The capability reuses the existing NOTICES entitlement and NOTICE permissions rather than introducing a parallel product entitlement.

## Deliberate legal/governance boundary

Community-event RSVP is operational planning only. It is not:
- statutory meeting attendance;
- quorum evidence;
- voting or a resolution;
- consent to legal/financial decisions;
- an association election or proxy;
- proof of physical attendance.

`GovernanceMeeting` and `GovernancePoll` remain separate authoritative models for their existing purposes.

## External boundary

No ticketing/payment, external event provider, WhatsApp RSVP, production field acceptance or legal interpretation is claimed in this slice.
