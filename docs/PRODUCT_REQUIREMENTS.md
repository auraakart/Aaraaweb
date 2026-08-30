# aaraagate Product Requirements

Version: 1.0  
Date: 2026-08-30

## Product position

aaraagate is a multi-society SaaS operating system for Indian gated communities. V1 prioritizes Security, Residents, Domestic Help, Services and Payments.

## V1 roles
- Super Admin
- Society Admin / RWA
- Resident
- Security Guard

## V1 modules
1. Authentication and role-based access
2. Society > Block > Floor > Flat hierarchy
3. Resident / family / owner / tenant management
4. Resident Flutter app
5. Guard Flutter app
6. Visitor management with QR/OTP
7. Domestic-help management and entry/exit
8. Delivery management
9. Vehicle registration
10. Notices and push notifications
11. Complaints / ticketing
12. Household service directory and service requests
13. Maintenance bills and online payments
14. Society Admin dashboard
15. Super Admin dashboard
16. Audit logs, backups, monitoring and production security basics

## Explicitly deferred
Phase 2: amenities, advanced parking, accounting, marketplace, service-provider app, advanced reports, polls/AGM, EV charging, WhatsApp integrations.

Phase 3: AI assistant, smart gates, ANPR, RFID/access-control integrations, parcel lockers, predictive analytics and broader property-management integrations.

## Product principles
- Security before feature count.
- Privacy by design; collect only necessary information.
- Resident experience must be simple and fast.
- Guard workflows must work in real gate conditions and low bandwidth.
- Every society's data must be strongly isolated.
- Payments must be server-verified and auditable.
- AI, when introduced, must be permission-aware and action-safe.
- Hardware is optional for V1.

## Definition of done
- Requirement matches this approved specification.
- Authorization and tenant isolation are verified.
- Happy path and failure paths are implemented.
- Database migrations are repeatable.
- API validation and error handling are present.
- Automated tests pass.
- No secrets are committed.
- Logs do not expose unnecessary personal/payment information.
- Mobile UI includes loading, empty, error and offline states where relevant.
- Admin actions are auditable.
- Documentation is updated.
