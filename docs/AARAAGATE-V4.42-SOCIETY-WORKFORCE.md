# Aaraagate V4.42 — Society Workforce

## Goal

Add a society-scoped workforce capability for common-area workers such as housekeeping, gardening, maintenance, clubhouse and facility staff without conflating them with resident household domestic-help assignments.

## Ownership and segregation of duties

- Society Admin and Facility Manager can create, verify, configure, suspend and reactivate society workers.
- Committee Member, Auditor and Security Supervisor can receive read-only visibility where their existing operational responsibilities require it.
- Security Guard cannot manage the roster. Guard authority is limited to assigned-gate attendance processing.
- Residents do not manage or receive the society-wide workforce roster by default.
- Household Staff remains unit/household scoped and continues to use the existing domestic-help workflow.

## Repository implementation

- Dedicated Prisma models for society worker master data, gate assignments and attendance.
- Independent society-worker verification lifecycle: PENDING, VERIFIED, REJECTED, SUSPENDED.
- Worker metadata includes name, phone, role, department, employer, effective dates, shift schedule and allowed gates.
- Gate eligibility requires an active verified worker, active assigned gate, effective-date window and shift eligibility.
- Guard entry/exit is idempotent and stored in a dedicated attendance record rather than a resident-unit access request.
- Suspension is blocked while a worker is still checked in.
- Admin surface provides roster creation, verification, suspension/reactivation and current-presence visibility.
- Guard Daily Workforce separates Society workforce from Household staff and shows context-aware ENTER/EXIT actions.

## Boundary

This milestone implements repository-level workforce management and gate attendance. It does not claim biometric integration, payroll, HRMS integration, contractor KYC-provider integration, physical turnstile integration or hosted production acceptance.
