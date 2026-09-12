# Aaraagate Role and Permission Baseline

Updated: 2026-09-12  
Scope: V1 baseline + Aaraagate V2 society operations

Authorization is enforced server-side. UI visibility is never a security boundary. V2 sensitive modules authorize **capability + society/resource scope**, not role name alone.

## Role and responsibility families
- Super Admin / platform operations
- Society Admin / RWA administrator
- Committee Member / Committee Admin responsibility
- Facility Manager / Estate Operations
- Accountant / Treasurer
- Helpdesk operator responsibility
- Read-only auditor responsibility
- Owner
- Tenant
- Family Member
- Security Supervisor
- Security Guard
- Staff
- Society-appointed vendor / contractor
- External Services marketplace provider

Aaraagate should prefer scoped permission bundles over unnecessary permanent role enums. A new persisted role is introduced only when assignment/lifecycle/audit requirements cannot be represented safely by existing roles plus permissions.

## Core V1 capability matrix
| Capability | Owner | Tenant | Family | Guard | Security Supervisor | Society Admin | Committee | Facility | Accountant | Vendor |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| View own household | if occupant | yes | yes | no | no | scoped | scoped | scoped | limited | no |
| Approve visitor for own unit | if occupant | yes | policy-based | no | no | support | support | support | no | no |
| Register gate entry/exit | no | no | no | yes | yes | support | view | support | no | no |
| Manage guards/gates | no | no | no | no | scoped | yes | approved scope | approved scope | no | no |
| Manage residents | property/profile | own/profile | own/profile | no | no | yes | approved scope | approved scope | limited | no |
| Manage complaints | own | own | own | operational | operational | yes | review | yes | limited | assigned only |
| Manage notices | no | no | no | no | no | yes | yes | approved scope | no | no |
| External Services | use | use | use | no | no | provider lifecycle | review | provider ops | no | provider scope |
| View own billing/payment | yes | eligible dues/payment | no by default | no | no | scoped | finance summary | no | yes | no |
| Audit logs | no | no | no | limited | security scope | yes | approved scope | operational scope | finance scope | own events only |

## V2 society-operations capability matrix

Legend: **M** manage/mutate, **R** read, **—** no default access. Society policy may narrow a capability; it must not silently broaden it beyond server-side permissions.

| V2 domain | Super Admin | Society Admin | Committee | Facility Manager | Accountant | Security Supervisor | Resident/Owner |
|---|---:|---:|---:|---:|---:|---:|---:|
| Finance | M | R* | R | — | M | — | own/property only |
| Governance | M | M | M | — | — | — | eligible owner/resident views/actions only |
| Facilities/assets | M | M | R | M | — | — | resident-visible status only |
| Society vendors/procurement | M | M | R | M | finance-link only | — | — |
| Society documents | M | M | R/M by classification | R by classification | R finance docs | — | owner/resident classification only |
| Privacy operations | M | R | — | — | — | — | own request initiation/status |
| Gate/security operations | platform support only when explicitly scoped | M/support | R | R/support | — | M | own gate actions only |

`*` Society Admin receives finance read by default in the v2 foundation but not `FINANCE_MANAGE`. Financial mutation is intentionally assigned to Accountant/Treasurer responsibility or explicitly designed future delegated approval workflows. This is a deliberate segregation-of-duties baseline.

## V2 permission namespaces in code
The v2 foundation introduces:
- `FINANCE_READ`
- `FINANCE_MANAGE`
- `GOVERNANCE_READ`
- `GOVERNANCE_MANAGE`
- `FACILITIES_READ`
- `FACILITIES_MANAGE`
- `SOCIETY_VENDORS_READ`
- `SOCIETY_VENDORS_MANAGE`
- `DOCUMENTS_READ`
- `DOCUMENTS_MANAGE`
- `PRIVACY_OPERATIONS_READ`
- `PRIVACY_OPERATIONS_MANAGE`

These permissions exist before the corresponding domain APIs so later controllers/services cannot default to broad `SOCIETY_ADMIN` checks.

## Required segregation-of-duties rules
- Accountant/Treasurer may manage society finance but does not automatically manage gates, resident roles, facilities or procurement operations.
- Committee may read finance and manage governance but does not automatically post accounting entries or manage facility/vendor operations.
- Facility Manager may manage facilities and society vendors but cannot mutate society finance.
- Security Supervisor does not receive finance, governance, facility procurement, document-management or privacy-operations authority.
- Residents, tenants and family members never receive society-operations permissions merely because they belong to a unit.
- Society Admin can coordinate operations but should not become the universal financial mutation role. Sensitive approval workflows may later implement maker-checker rules.
- `PRIVACY_OPERATIONS_MANAGE` remains platform-only in the v2 foundation until a society-scoped privacy workflow explicitly defines safe delegation.
- Platform permissions must never be grantable through society-scoped role administration.

## Owner / tenant / occupant boundaries
- Ownership and occupancy are independent.
- Non-resident ownership alone never grants household-private data, routine gate notifications or gate approval authority.
- Gate notifications and approval requests target active, time-valid occupants configured as gate contacts.
- Move-out revokes occupant-scoped household and gate authority immediately.
- Owner-only property finance, document, governance/voting and tenancy capabilities remain separate from occupant daily operations.
- General society dues may be visible/payable by current tenant and non-resident owner according to the approved Aaraagate policy, without exposing one payer's private payment instrument/data to the other.

## Mandatory security rules
- Every tenant-owned query/mutation includes society scope at the server boundary and persistence filters where applicable.
- A valid role alone never grants access across societies.
- Cross-society access fails closed, including support tooling unless explicit platform access is intentionally designed, logged and reviewed.
- Unit/household actions require valid active relationship or delegated operational scope.
- Feature entitlements are enforced server-side in addition to RBAC where commercially gated.
- Privileged mutations generate audit events with enough context for investigation while minimizing sensitive data.
- Guard APIs return only minimum information required for gate decisions.
- Payment and finance operations require separate permissions and server-side verification.
- Accounting entries must not be editable/destructively deleted in ways that destroy audit history; corrections use controlled reversing/adjusting events.
- Offline Guard actions use durable IDs/idempotency keys and safe reconciliation.
- Session revocation/expiry/refresh-token rotation remain server-enforced.
- Support/admin override paths, if introduced, are explicit, constrained and auditable.
- Document download/read authorization is enforced at access time; private object URLs alone are not authorization.
- Privacy data requests never bypass statutory/accounting/security/dispute retention rules silently.

## Permission design rule
Prefer capability permissions (for example `FINANCE_MANAGE`, `FACILITIES_READ`) over role-name conditionals in business services. Roles map to permissions; business services authorize permission + resource scope + tenant membership + relevant relationship.
