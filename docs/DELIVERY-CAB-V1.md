# Delivery and Cab V1 acceptance

The V1 workflow reuses the unified access-request model and occupant-based gate routing.

## Delivery
- Security can create a delivery arrival only for an occupied unit at an active gate.
- The request is routed to active occupants with gate approval enabled; ownership alone does not grant approval authority.
- Resident sees delivery-person identity plus provider and vehicle context when supplied.
- Resident approval is immediate and limited to 30 minutes for gate-originated delivery arrivals.
- Guard receives the decision and completes request-based check-in/check-out using the originating gate.

## Cab
- Security can create a cab arrival only for an occupied unit at an active gate.
- The request is routed to active occupants with gate approval enabled; non-resident ownership alone does not grant approval authority.
- Resident sees driver identity plus cab provider and vehicle number when supplied.
- Resident approval is immediate and limited to 15 minutes for gate-originated cab arrivals.
- Guard receives the decision and completes request-based check-in/check-out using the originating gate.

## Privacy and security
- Society scope, gate scope, occupancy validity and feature entitlement are enforced server-side.
- Gate-originated requests cannot be processed at a different gate.
- Delivery/Cab approvals do not require the resident to share a QR/pass back with the guard; the guard tracks the request directly.
- Visitor QR/pass behaviour remains unchanged.
