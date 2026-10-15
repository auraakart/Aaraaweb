# Aaraagate V4.75 — Portfolio Outcome Depth

Date: 2026-09-28  
Baseline: `develop@9ea26db1474c7279d76795e4973c0c2d6ad651f2`

## Objective

V4.75 deepens the existing Super Admin Portfolio command centre instead of creating a second platform-analytics domain.

**Productionization remains explicitly excluded.**

## 1. Aggregate-only cross-society outcomes

The existing `GET /api/v1/platform/analytics/portfolio-command-centre` now accepts optional `from` / `to` range parameters and returns aggregate outcome evidence for every society.

The default range remains the reporting service's existing 30-day window.

Per-society aggregates include:
- authoritative billed and collected receivable value plus collection percentage;
- resolved Helpdesk volume, SLA met/breached counts and compliance percentage;
- visitor gate throughput and average processing seconds;
- scheduled-notice dispatch attempted/dispatched counts and delivery handoff percentage;
- active vendor contracts expiring within 30 days.

No resident, unit, payer, visitor or ticket-level records are returned by this platform endpoint.

## 2. Authoritative finance semantics

Collection metrics reuse the same accounting truth used by society outcome reporting:
- receivable debit/credit/waiver adjustments are included through the range end;
- payment allocations are net of append-only allocation reversals;
- collected value is capped by net billed value;
- receivables voided after the historical range end remain part of that historical cohort.

The endpoint now requires both `PLATFORM_CONSUMER_BOOKING_READ` and `PLATFORM_CONSUMER_PAYMENT_READ`.

## 3. Existing attention model retained

Current-state exception evidence remains unchanged:
- SOS;
- critical/overdue facility work;
- Helpdesk SLA breaches;
- overdue maintenance invoices;
- pending gate approvals.

Contract expiry is added as a transparent `WATCH` reason. Range outcome percentages do not silently change the existing attention severity model.

## 4. Super Admin UX

The existing Platform page now shows:
- weighted portfolio collection percentage;
- portfolio Helpdesk SLA compliance;
- visitor gate throughput;
- scheduled-notice delivery handoff success;
- contracts expiring in 30 days;
- the same outcome context per society.

The page remains read-only for portfolio analytics. Existing society lifecycle, entitlement and Society Admin controls remain separate explicit workflows.

## Safety boundaries

- Aggregate-only cross-society data.
- No cross-tenant record drill-through.
- No autonomous remediation.
- No society quality ranking.
- No predictive score.
- No mutation from analytics.
- Finance visibility requires platform payment-read permission.

## Verification

Focused API coverage verifies weighted outcome calculations, aggregate-only response shape and non-mutation boundaries. Authorization regression locks the dual platform permission requirement, and the V4.75 semantic CI contract protects API/Admin truth alignment.

## External exclusions

V4.75 does not claim hosted production acceptance, market adoption, field outcomes, staging/main promotion, or production-readiness improvement.
