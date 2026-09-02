# Aaraagate Role and Permission Baseline

Updated: 2026-09-02

Authorization is enforced server-side. UI visibility is never a security boundary.

## Role families
- Super Admin
- Society Admin / RWA
- Committee Member
- Facility Manager / Operations
- Accountant
- Owner
- Tenant
- Family Member
- Security Supervisor
- Security Guard
- Staff
- Vendor / Service Provider

## Initial capability matrix
| Capability | Owner | Tenant | Family | Guard | Security Supervisor | Society Admin | Committee | Operations | Accountant | Vendor |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| View own household | if occupant | yes | yes | no | no | scoped | scoped | scoped | limited | no |
| Approve visitor for own unit | if occupant | yes | policy-based | no | no | support | support | support | no | no |
| Create visitor pass for own unit | if occupant | yes | policy-based | no | no | support | support | support | no | no |
| Register gate entry/exit | no | no | no | yes | yes | yes | view/support | yes | no | no |
| View gate queue | no | no | no | yes | yes | yes | view | yes | no | no |
| Manage guards/gates | no | no | no | no | scoped | yes | approved scope | yes | no | no |
| Manage residents | property/profile | own/profile | own/profile | no | no | yes | approved scope | approved scope | limited | no |
| Manage society configuration | no | no | no | no | no | yes | approved scope | approved scope | limited finance | no |
| Manage complaints | if occupant | own | own | operational | operational | yes | yes | yes | limited | assigned only |
| Manage notices | no | no | no | no | no | yes | yes | approved scope | no | no |
| Manage household services | if occupant | own bookings | own bookings | no | no | yes | approved scope | yes | no | own provider scope |
| View billing/payments | own | no | no | no | no | yes | approved scope | approved scope | yes | no |
| View audit logs | no | no | no | limited operational | scoped security | yes | approved scope | approved scope | finance-related | own events only |
| Manage feature entitlements | no | no | no | no | no | no* | no | no | no | no |

`*` Product-tier and entitlement administration is reserved for platform-level administration unless an explicitly delegated workflow is introduced.

## Mandatory security rules
- Every tenant-owned query and mutation must include society scope at the server boundary and in persistence filters where applicable.
- A valid role alone never grants access across societies. Membership/scope and permission must also match the target society.
- Cross-society reads and writes must fail closed, including Super Admin support tooling unless explicit platform-level access is intentionally designed, logged and reviewed.
- Unit/household actions require ownership, membership or explicitly delegated operational scope.
- Feature entitlements are enforced server-side in addition to RBAC/permissions where a module is commercially gated.
- Privileged mutations generate audit events with enough context for investigation without exposing unnecessary sensitive data.
- Guard APIs return only the minimum resident/visitor data required to make a gate decision.
- Sensitive visitor/identity data is minimized and retained according to policy.
- Payment and finance operations require separate permissions and server-side verification.
- Offline guard actions use durable local IDs/idempotency keys and must be reconciled without duplicate state transitions.
- Session revocation, expiry and refresh-token rotation must be enforced server-side.
- Support/admin override paths, if introduced, must be explicit, time/scope constrained where practical and fully auditable.
- Ownership and occupancy are independent. Non-resident ownership alone never grants household-private data, routine gate notifications or approval authority.
- Gate notifications and approval requests target active, time-valid occupants configured as gate contacts, whether the occupant is an owner, tenant or family member.
- Move-out revokes occupant-scoped household and gate authority immediately.
- Property profile, finance, document and voting capabilities are owner-only unless an explicit policy or delegation grants narrower access.
- Household responses use audience-specific projections and do not expose another member's phone/email by default.

## Permission design rule
Prefer capability permissions (for example `visitor.approve`, `gate.check_in`, `resident.manage`, `billing.manage`) over role-name conditionals inside business services. Roles map to permissions; business services authorize capabilities and resource scope.
