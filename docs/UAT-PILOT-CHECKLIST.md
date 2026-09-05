# Aaraagate UAT and Pilot Checklist

This checklist is the acceptance evidence for a production candidate after technical CI and staging validation are green.

## Entry criteria

- Candidate is promoted from `develop` to `staging` through a protected PR.
- CI, staging smoke and backup/restore smoke are green for the release state.
- No open critical/high security defect blocks the candidate.
- Release candidate SHA and current `main` rollback SHA are recorded.
- Pilot society configuration, Admin accounts, Guard devices and Resident test accounts are ready.

## Core UAT scenarios

### Authentication, tenancy and roles
- [ ] User can sign in only to societies where an active membership exists.
- [ ] Cross-society access attempts fail closed.
- [ ] Admin, Accountant, Security Supervisor, Guard, Owner, Tenant and Family Member permissions match the approved matrix.
- [ ] Historic/ended occupancy cannot access current household-private actions.

### Visitor and gate operations
- [ ] Resident/occupant can create and manage visitor access as permitted.
- [ ] Walk-in visitor approval reaches the configured active occupant, not a non-resident owner by ownership alone.
- [ ] Guard can process entry/exit with clear success/failure states.
- [ ] Offline Guard action queues recover without duplicate processing when connectivity returns.

### Delivery and cab
- [ ] Delivery approval uses the direct allow-entry flow and does not expose visitor QR behaviour.
- [ ] Cab approval shows the relevant provider/vehicle details and uses the configured short access window.
- [ ] Delivery/cab approval reaches the current authorised occupant rather than a non-resident owner by ownership alone.

### Ownership, occupancy and household
- [ ] Owner and occupant relationships remain distinct.
- [ ] Tenant cannot see owner-only finance/legal information.
- [ ] Household, vehicles and emergency contacts are restricted to current valid occupancy.

### Vehicles and basic parking
- [ ] Current Owner/Tenant can register and deactivate their household vehicle as permitted.
- [ ] Family Member cannot perform vehicle/parking write actions unless explicitly granted an approved future capability.
- [ ] Resident can see the society-assigned parking bay for an active vehicle.
- [ ] Resident cannot assign, edit or clear the parking bay from the Resident app/API.
- [ ] Society Admin/configuration-authorised user can assign, update or clear a parking bay within the selected society and household scope.
- [ ] Vehicle deactivation removes the associated parking assignment.

### Maintenance billing and payments
- [ ] Maintenance dues are visible/payable by verified owner and current tenant for the unit.
- [ ] Due notification reaches both owner and current tenant when owner is non-resident.
- [ ] Payment retry/idempotency prevents duplicate payment creation.
- [ ] Receipt/history visibility follows owner/payer rules.

### Notices and broadcasts
- [ ] OWNER_ONLY broadcast is visible only to current verified owners.
- [ ] OWNER_AND_OCCUPANTS broadcast reaches owner plus current occupants/tenant.
- [ ] Expired/unpublished notices are not exposed as current announcements.

### Workforce/domestic help
- [ ] Domestic-help profiles and assignments stay society/unit scoped.
- [ ] Leave/suspension/gate-interception behaviour matches Admin configuration.
- [ ] Resident rating flow is restricted to valid relationship/action state.

### Helpdesk and SOS
- [ ] Resident can create/view tickets only for valid current household scope.
- [ ] Admin/helpdesk role can operate tickets only within the selected society.
- [ ] SOS creation, visibility and handling obey society/relationship permissions.

### Resident marketplace
- [ ] Resident can browse approved offerings and book for a current household unit.
- [ ] Cancel/rate transitions are limited to valid booking states.
- [ ] Cross-unit/cross-society booking access is rejected.
- [ ] Resident booking payload does not expose unnecessary provider contact data or sensitive linked access-request fields.

### Reports and audit
- [ ] Reports contain only society-scoped data available to the requesting role.
- [ ] Non-finance report users can see operational counts but not billed/collected/outstanding monetary totals.
- [ ] Accountant cannot access audit-only views.
- [ ] Security Supervisor cannot access society configuration/billing-management functions.
- [ ] Audit output does not expose secrets, credentials or unnecessary sensitive payment data.

## UX/device acceptance

- [ ] Resident primary flows are usable on representative supported Android devices.
- [ ] Guard primary flows remain fast and readable in low-distraction operational use.
- [ ] Admin key surfaces render correctly at supported desktop widths.
- [ ] Loading, empty, denied, failure and recovery states are understandable.
- APK/demo packaging is currently on hold and is not a pilot-entry blocker unless explicitly re-enabled by the release owner.

## Operational acceptance

- [ ] `/api/v1/health` identifies expected service/environment/version/commit.
- [ ] Database migration completes on staging from a clean database.
- [ ] Backup/restore smoke proves logical backup can restore schema and verification data.
- [ ] Production preflight confirms required OTP, Redis, push, payment, CORS and release metadata configuration before live deployment.
- [ ] Rollback target SHA is recorded before production promotion.
- [ ] Rollback procedure has been reviewed by the release owner.
- [ ] Monitoring/log destination and alert ownership are assigned for the pilot.

## Pilot execution

Recommended initial pilot: one society with a controlled group of Admin, Guard and Resident users.

Track during pilot:
- authentication/access failures;
- gate approval delivery and latency;
- Guard offline recovery;
- billing/payment failures or duplicates;
- notification delivery issues;
- helpdesk/SOS reliability;
- vehicle/parking assignment issues;
- user-blocking UX defects;
- API error rate and service availability;
- data-integrity or tenant-isolation anomalies.

## Exit criteria

Production rollout may proceed when:
- [ ] no unresolved severity-1 or severity-2 defect remains;
- [ ] no tenant-isolation, authorization or payment-integrity defect remains;
- [ ] all mandatory UAT scenarios above pass or have an explicitly accepted non-blocking exception;
- [ ] staging smoke and backup/restore evidence are green;
- [ ] release candidate and rollback SHA are documented;
- [ ] release owner and business/UAT approver sign off;
- [ ] pilot feedback contains no launch-blocking issue.

Record sign-off with candidate SHA, approver, date, accepted exceptions and pilot society identifier. Do not place resident personal data, credentials, tokens or payment secrets in the sign-off record.
