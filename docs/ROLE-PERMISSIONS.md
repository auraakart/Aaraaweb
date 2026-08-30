# Aaraagate Initial Role Permissions

| Capability | Resident | Family | Guard | Society Admin | Committee | Operations |
|---|---:|---:|---:|---:|---:|---:|
| View own household | yes | yes | no | yes | yes | yes |
| Approve visitor for own unit | yes | yes* | no | support | support | support |
| Create visitor pass | yes | yes* | no | support | support | support |
| Register gate entry | no | no | yes | yes | view | yes |
| View gate queue | no | no | yes | yes | view | yes |
| Manage residents | no | no | no | yes | approved scope | approved scope |
| Manage society configuration | no | no | no | yes | approved scope | approved scope |
| Manage complaints | own | own | operational | yes | yes | yes |
| Manage notices | no | no | no | yes | yes | approved scope |
| View audit logs | no | no | limited operational | yes | approved scope | approved scope |

`*` Family permissions are granted by the resident/household policy and can be revoked.

## Security rules

- Authorization is enforced server-side; UI visibility is not a security boundary.
- Scope must include the society and, where applicable, unit/household ownership.
- Privileged mutations generate audit events.
- Guards must not receive unnecessary resident personal data.
- Sensitive visitor/identity data is minimized and retained only according to policy.
- Offline guard actions receive local temporary IDs and are reconciled idempotently when connectivity returns.
