# Aaraagate V4.8 — Outcome Analytics, Adoption and Operational UX

Date: 2026-09-18
Status: Repository implementation candidate
Baseline: V4.7 complete on `develop`

## Goal

Measure whether Aaraagate improves society operations and make completed V4 capabilities visible through usable, accessible operational surfaces. V4.8 does not add generic page-view tracking and does not treat vanity metrics as outcome evidence.

## Outcome analytics

The society endpoint is:

`GET /api/v1/reports/analytics/outcomes?from=<ISO>&to=<ISO>`

It requires `ADVANCED_REPORTS` plus `REPORTS_READ`. Finance values are included only when the caller also has `FINANCE_READ`.

### KPI definitions

- **Maintenance collection percentage** — allocations recorded by the range end against the net economic value of authoritative `Receivable` records issued in the selected range. Net billed value includes append-only debit/credit/waiver adjustments recorded by the range end; receivables voided after the range end remain part of that historical cohort.
- **Outstanding ageing** — authoritative receivable balance as of the selected range end (`Receivable` + append-only adjustments − allocations), grouped by current / 1–30 / 31–60 / 61–90 / 90+ day buckets.
- **Reconciliation exceptions** — unresolved `PaymentReconciliationCase` records.
- **Complaint SLA compliance** — resolved/closed helpdesk tickets with resolution evidence at or before their configured resolution due time divided by tickets with measurable SLA evidence.
- **Gate processing time** — average visitor request creation-to-entry time for entries in the selected range.
- **Visitor approval turnaround** — request creation to the first authoritative `ACCESS_APPROVED` audit event.
- **Guard offline-sync outcomes** — aggregate sync runs, actions considered, synced, retried, unresolved and supervisor-review-required counts reported by the Guard app. No credential, visitor or guard identity is stored in this aggregate.
- **Amenity utilization evidence** — active amenity count plus confirmed booking count, distinct booking users and confirmed booking-hours. V4.8 deliberately does not claim an availability-capacity percentage because amenity schedules/blackouts vary by policy.
- **Notification delivery success** — scheduled notice dispatch handoff success from `NoticeDispatch`. This is not claimed as handset-open/read confirmation.
- **External service discovery-to-booking conversion** — distinct pseudonymous users who created a society service booking divided by distinct pseudonymous users who viewed service discovery in the same period.
- **Service completion/cancellation rate** — completed and cancelled `ServiceBooking` records divided by bookings created in the selected period.
- **Resident activation** — current eligible owner/occupant users with a society session created in the selected period divided by eligible users.
- **Multi-property switching usage** — distinct pseudonymous users who switch society/property context through the authenticated switching flow.

## Independent-home engagement

Platform-authorized operators can use:

`GET /api/v1/platform/analytics/outcomes?from=<ISO>&to=<ISO>`

This reports independent-home:
- booking count;
- completed/cancelled count and rates;
- distinct booking users;
- distinct independent-home entrants;
- booking engagement percentage.

It requires `PLATFORM_CONSUMER_BOOKING_READ`. It is not available through a society-scoped report.

## Privacy-minimal usage evidence

V4.8 introduces `OperationalUsageEvent` only for product behavior that cannot be derived safely from existing domain records.

Stored fields are limited to:
- optional society id;
- constrained event type;
- SHA-256 pseudonymous subject hash;
- day bucket;
- occurrence timestamp.

The table does **not** store:
- phone number;
- name;
- unit/property id;
- visitor/service details;
- device identifiers;
- prompt contents;
- notification contents.

Society usage events are deduplicated per event type, pseudonymous subject and day to avoid turning normal UI refreshes into inflated engagement counts.

## Guard telemetry safety

`GuardOfflineSyncMetric` stores daily aggregate counts only. It contains no credentials, idempotency keys, access-request ids, visitor data or guard user ids.

Telemetry failure is non-blocking. Guard check-in/check-out, offline queue persistence and recovery continue even if the analytics endpoint is unavailable.

## Operational UX

### Admin outcome dashboard
The existing Reports workspace now displays:
- operational outcome cards rather than only raw activity totals;
- explicit no-denominator/no-completed-event states instead of misleading zero percentages;
- finance outcomes only for finance-authorized roles;
- screen-reader labels for KPI cards;
- evidence/measurement caveats inline.

### Access integrations workspace
V4.7 hardware-neutral integration capability is now visible in Admin through:
- adapter health;
- mapped gate/device health;
- recent command evidence;
- explicit manual-fallback status;
- future adapter compatibility requirements.

Read-only roles see health/evidence. Only roles with the existing gate-management authority receive mutation controls.

### Accessibility / responsive behavior
V4.8 uses the existing responsive Admin layout and Material Flutter typography. New Admin KPI cards expose readable text labels and ARIA descriptions rather than color-only meaning. Empty/error/refresh states remain explicit.

## Evidence boundaries

The following claims are intentionally **not** made:
- notice dispatch success is not proof a human read the notice;
- amenity booking-hours are not a percentage of every policy-valid available slot;
- production hardware compatibility is not certified by simulator results;
- independent-home analytics do not expose user-level identity;
- repository analytics do not substitute for production monitoring or legal/privacy assessment.

## Exit criteria

V4.8 repository completion requires:
- authoritative outcome KPI endpoint with permission-aware finance fields;
- privacy-minimal usage evidence for otherwise unobservable adoption flows;
- independent-home aggregate outcome endpoint with platform permission boundary;
- aggregate guard offline-sync measurement with non-blocking telemetry;
- Admin outcome dashboard;
- Admin access-integration operational workspace;
- analytics authorization/privacy/regression tests;
- clean migration validation;
- API/Admin/Resident/Guard build and test validation;
- V4 security/privacy, role, policy and pilot contracts green.

No `staging` or `main` promotion is part of V4.8.
