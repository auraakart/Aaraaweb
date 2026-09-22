# Aaraagate V4.44 — Workforce Operational Completeness

## Goal

Complete the repository-level operational workflow for society common-area workers without mixing them with resident household staff or adding production-only integrations.

## Implemented slices

1. **Worker edit and shift management**
   - Admin/Facility Manager can update role, department, employer, assigned gates and recurring shift schedule.
   - Every configuration change produces a society-worker lifecycle event.

2. **Leave / absence**
   - Society-worker leave is stored as a dedicated society-scoped record.
   - Overlapping active leave is blocked.
   - Active leave automatically removes the worker from gate eligibility for the leave dates.
   - Leave creation/cancellation is recorded in the lifecycle timeline.

3. **Attendance filtering and export**
   - Attendance can be filtered by worker, gate, date range and current-inside state.
   - Admin UI supports CSV export of the currently filtered attendance view.

4. **Operational exception visibility**
   - Operations summary shows active roster, inside-now, on-leave, expected-now, pending verification and suspended counts.
   - It surfaces long-open attendance for review.
   - "Expected now, not inside" is explicitly descriptive and is not treated as an automated absence finding.

5. **Worker lifecycle timeline**
   - Worker creation, configuration, verification, rejection, suspension, reactivation, leave and attendance correction are recorded as immutable lifecycle events.
   - Authorized read-only roles can view the timeline; only management roles can mutate workforce state.

6. **Guard exceptions and attendance correction**
   - Guard lookup explains deterministic block reasons such as wrong gate, leave, outside shift, inactive or unverified.
   - Guards cannot override these rules.
   - Admin/Facility attendance correction requires a reason and writes an auditable lifecycle event with previous and corrected timestamps.

## Security / segregation of duties

- Society Admin and Facility Manager retain workforce-management authority.
- Security Guard remains limited to assigned-gate attendance processing and deterministic eligibility lookup.
- Security Supervisor, Committee and Auditor access remains read-only according to the existing permission matrix.
- Residents do not manage Society Workforce.
- Household Staff remains a separate household-scoped domain.

## Explicit boundary

This milestone does not add payroll, HRMS, biometric devices, contractor KYC-provider integration, physical turnstiles, real-world hosting acceptance or production operations.
