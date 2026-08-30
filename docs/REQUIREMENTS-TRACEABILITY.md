# Aaraagate Requirements Traceability

This document is the implementation guardrail for the Aaraagate build. Features are only complete when their requirement, UX intent, security model and acceptance criteria are defined.

## Product pillars
1. Security-first gated-community operations
2. Resident-first everyday experience
3. Guard-first speed and simplicity
4. Admin-grade operational control
5. Privacy, auditability and role-based access
6. Mobile-first, accessible and scalable UI

## Current implementation
| Area | Status | Acceptance direction |
|---|---|---|
| Application foundation | In progress | Monorepo + strict TypeScript + reusable app shell |
| Design system | In progress | Mobile-first cards, quick actions, persistent navigation, accessible contrast |
| Resident home | Prototype | Gate status, quick actions and community updates visible without deep navigation |
| Authentication | In progress | OTP/session architecture with secure role handling |
| RBAC | In progress | Resident, family, guard, admin and operations roles |
| Society structure | In progress | Society → block → floor → unit → household |
| Visitor management | Planned | Pre-invite, instant approval, QR/OTP, entry/exit and audit trail |
| Guard application | Prototype | Large touch targets, minimal typing, offline queue and sync |
| Admin operations | Foundation | Residents, gates, notices, complaints, staff and reports |
| Maintenance/billing | Planned | Bills, status, receipts and ledger-ready data model |
| Security/audit | In progress | Least privilege, masked data, immutable audit events |

## Definition of done
A feature is not production-ready until it has requirement mapping, responsive UI, loading/empty/error states, authorization checks, validation, audit implications reviewed, tests, and documented acceptance criteria.
