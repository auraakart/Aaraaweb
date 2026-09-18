# Aaraagate V3.4 — Services Marketplace 2.0

## Objective
Complete the marketplace lifecycle without duplicating the mature discovery, media, trust, availability and independent-home capabilities already present in the repository.

## Existing foundations retained
- verified providers and society approval;
- grouped service/provider comparison and ratings;
- provider media and media-safety pipeline;
- commercial offers and availability foundations;
- independent-home consumer booking, dispatch, payment-readiness and service-memory flows;
- society booking → time-limited service-provider gate authorization;
- property-scoped resident booking access.

## V3.4 gap closure
1. Append-only society booking timeline from request through fulfilment.
2. Authoritative provider gate check-in/check-out projected into that timeline.
3. Gate check-in promotes a confirmed society booking to `IN_PROGRESS` without bypassing existing gate idempotency.
4. Completion snapshots offering warranty/revisit terms from `ServiceOfferingContinuityPolicy`.
5. Resident-only timeline endpoint fails closed across society/user boundaries.
6. Resident UI exposes lifecycle, gate evidence and warranty/service history without leaking other property contexts.
7. Regression coverage preserves independent-home separation and existing marketplace behavior.

## Exit gates
- clean PostgreSQL migration deploy;
- timeline tenant/ownership tests green;
- gate mutation idempotency remains green;
- society booking → confirmation → gate entry → gate exit → completion → rating is represented end-to-end;
- warranty/revisit snapshot is immutable after completion;
- resident and independent-home marketplace tests green;
- API lint/typecheck/tests/build/readiness green;
- Resident/Guard analyze and tests green;
- Admin validation and dependency security green.

`main` and production promotion are out of scope for this milestone.
