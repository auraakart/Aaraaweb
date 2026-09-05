# Aaraagate UAT and Pilot Checklist

This checklist is the acceptance evidence for a production candidate after technical CI and staging validation are green.

## Entry criteria
- [ ] Candidate promoted from `develop` to `staging` through PR.
- [ ] Full CI, staging smoke and backup/restore smoke green on the candidate.
- [ ] No unresolved Sev-1/Sev-2, tenant-isolation, authorization or payment-integrity blocker.
- [ ] Candidate SHA and current `main` rollback SHA recorded.
- [ ] Pilot Admin, Guard and Resident test accounts/devices ready.

## Authentication, tenancy and role boundaries
- [ ] User can sign in only to societies where an active membership exists.
- [ ] Cross-society requests fail closed.
- [ ] Society Admin cannot grant `SUPER_ADMIN`, `SOCIETY_ADMIN`, `VENDOR`, OWNER, TENANT or FAMILY_MEMBER through operational-role administration.
- [ ] OWNER/TENANT/FAMILY_MEMBER authority comes only from valid unit relationships.
- [ ] Society operational role grant is limited to Committee Member, Facility Manager, Accountant, Security Supervisor, Security Guard and Staff.
- [ ] Removing an operational role revokes the affected user's active society sessions.
- [ ] Security Supervisor Admin access is limited to Gate/SOS operations.
- [ ] Tenant Admin creation/linking of an existing phone does not overwrite that person's canonical profile identity across other societies.

## Platform administration
- [ ] Super Admin can list societies and inspect status/tier/feature overrides.
- [ ] Super Admin can update product tier and validated feature overrides.
- [ ] Suspending a society revokes active sessions for that society.
- [ ] Only platform authority can provision/deactivate `SOCIETY_ADMIN`.
- [ ] Society Admin cannot access platform society/entitlement controls.
- [ ] Only platform provider-verification authority can verify/reject/suspend/reactivate global service providers.

## Property hierarchy and parking
- [ ] Property setup follows Society → Building/Block → Floor → Unit.
- [ ] Existing migrated units remain usable with unchanged unit IDs and existing ownership/occupancy/billing/gate references.
- [ ] Building/floor/unit creation is tenant scoped.
- [ ] Resident can register/deactivate a vehicle but cannot assign/edit/clear its parking bay.
- [ ] Society configuration-authorised Admin can search vehicles and assign/change/clear parking bays only within the selected society.
- [ ] Vehicle deactivation clears the bay mapping.

## Visitor, gate, delivery and cab
- [ ] Resident/occupant visitor access works only for authorised current units.
- [ ] Gate approval routes to configured active occupants, not non-resident owner by ownership alone.
- [ ] Wrong society/gate/expired/revoked/reused credentials fail closed.
- [ ] Guard check-in/out is auditable and retry-safe.
- [ ] Offline Guard queue replays safely without duplicate gate actions.
- [ ] Delivery and cab use their dedicated access semantics and current-occupant routing.

## Ownership, household and workforce
- [ ] Owner and physical occupant relationships remain independent.
- [ ] Ended occupancy immediately loses household/gate authority.
- [ ] Tenant cannot see owner-only finance/legal information.
- [ ] Domestic-help assignment, leave, suspension, rating and gate flows remain society/unit scoped.

## Marketplace — Resident choice
- [ ] Equivalent services are grouped and Resident must choose a specific verified/society-approved provider.
- [ ] Provider comparison shows business name, price, description, duration, rating summary and completed-job count where available.
- [ ] Provider phone/email remain hidden from Resident comparison/history payloads.
- [ ] Selected provider offering ID remains booking source of truth and price/commission are snapshotted.
- [ ] Overlapping active bookings for the same provider/time window are rejected.
- [ ] Non-overlapping bookings remain possible.
- [ ] Provider confirmation creates linked service-provider gate access.
- [ ] Cancellation invalidates linked access where applicable.
- [ ] Completion/rating transitions remain state constrained.

## Marketplace — Admin/platform lifecycle
- [ ] Society Admin/Facility Manager can submit a provider only into the selected society context.
- [ ] New submission remains visible as PENDING to that society while awaiting platform verification.
- [ ] Other societies cannot see pending provider contact details.
- [ ] Society approval requires platform verification first.
- [ ] Society can approve/reject/suspend a linked provider without changing that provider's status in another society.
- [ ] Platform suspension removes provider availability globally.
- [ ] Offering activation/deactivation is platform-catalog controlled.
- [ ] Global category/offering changes are inaccessible to Society Admin/Facility Manager.

## Billing, notices, helpdesk, SOS and reports
- [ ] Verified owner and current tenant can view/pay the unit's dues as defined.
- [ ] Dues notification reaches owner + current tenant when owner is non-resident.
- [ ] Tenant payment history is payer-own; owner retains permitted broader property history.
- [ ] OWNER_ONLY and OWNER_AND_OCCUPANTS notices resolve against current relationships.
- [ ] Helpdesk/SOS operations remain tenant scoped and role constrained.
- [ ] Non-finance report users can see counts but not billed/collected/outstanding monetary totals.
- [ ] Audit output contains no secrets, credentials or unnecessary payment/provider PII.

## Runtime and operational acceptance
- [ ] `/api/v1/health/live` reports process liveness without depending on database/Redis availability.
- [ ] `/api/v1/health/ready` reports expected release metadata and validates PostgreSQL + Redis/auth-state readiness.
- [ ] Staging migration completes on a clean PostgreSQL database.
- [ ] CI backup/restore drill passes.
- [ ] Hosted environment separately proves managed backup retention/PITR/encryption policy and an isolated restore before commercial rollout.
- [ ] Production preflight validates OTP, Redis, push, payment, CORS and release metadata configuration.
- [ ] Monitoring/log destination, alert owner and rollback target are recorded.

## UX/device acceptance
- [ ] Resident key flows work on representative supported Android devices.
- [ ] Guard operations remain fast/readable with large touch targets and clear offline state.
- [ ] Admin, Platform, Property, Roles and Parking screens render correctly at supported desktop widths.
- [ ] Loading, empty, denied, error and recovery states are understandable.
- APK/demo packaging is not a production-entry requirement unless explicitly re-enabled by release owner.

## Exit criteria
Production promotion may proceed only when:
- [ ] all mandatory scenarios pass or have an explicitly accepted non-blocking exception;
- [ ] no unresolved Sev-1/Sev-2 or security/payment-integrity blocker remains;
- [ ] exact staging candidate has green smoke and backup/restore evidence;
- [ ] candidate and rollback SHAs are recorded;
- [ ] release owner/business UAT approval is recorded;
- [ ] independent PR approval and production release checks pass.

Record candidate SHA, approver, date, accepted exceptions and pilot identifier. Do not record resident PII, credentials, tokens or payment secrets.
