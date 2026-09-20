# Aaraagate V4.28 — Pilot Evidence and Deployable-Product Closure

Date: 2026-09-20
Status: Repository evidence contract implemented; field evidence remains external
Source of truth: `docs/v4.28-pilot-evidence.json`

## Objective

V4.28 converts repository capability into a controlled pilot/release evidence program. It does not treat green CI as production acceptance.

The repository may be described as V4.28 repository-ready when the exact-head quality gates and the V4.28 evidence contract are green. Pilot completion and production `GO` require real field evidence, named owners and recorded sign-off.

## Evidence classes

1. **Repository evidence** — CI, API/Admin/Flutter validation, dependency security, Security/Privacy, Cross-role, Role UAT, Policy Pilot, Pilot Acceptance, Staging Pilot, V4.11 readiness and this V4.28 contract.
2. **Field evidence** — measured KPI results from a named pilot society.
3. **Hosted/provider evidence** — exact deployed SHA, hosted staging, backup/restore, monitoring/alerts, live provider verification and incident tabletop.
4. **Release evidence** — candidate SHA, rollback SHA, signed Android/Play evidence when applicable, unresolved-blocker disposition and role sign-off.

Repository evidence cannot substitute for field/hosted/provider evidence.

## Evidence record rules

Every field evidence reference must identify:
- pilot identifier;
- candidate SHA;
- scenario/KPI;
- responsible role;
- date/time window;
- expected threshold;
- observed result;
- disposition;
- non-sensitive artifact/reference.

Do not store resident names, mobile numbers, visitor credentials, authentication tokens, payment secrets or unnecessary personal data in the manifest.

## Pilot roles and acceptance scripts

### Resident

Required scenarios:
1. Sign in and select the correct active property when multiple properties exist.
2. Approve/deny a visitor and verify only the current occupant has gate authority.
3. Review dues/payment status and reach the correct receipt or recovery state.
4. Raise and follow a helpdesk request.
5. Book or waitlist an amenity without cross-property leakage.
6. Confirm loading, empty, denied, error and recovery states are understandable.

Evidence owner: Society Admin with a designated Resident representative.

### Guard

Required scenarios:
1. Process visitor/delivery/cab arrivals using the correct gate and society context.
2. Reject expired/revoked/reused/wrong-society credentials.
3. Verify check-in/check-out audit evidence.
4. Exercise offline queue/retry recovery without duplicate gate mutation.
5. Exercise language/voice assistance with review-before-submit and manual fallback.
6. Escalate a scripted security incident to Security Supervisor.

Evidence owner: Security Supervisor with a designated Guard representative.

### Society Admin

Required scenarios:
1. Review Society Onboarding readiness and incomplete setup.
2. Validate operational-role boundaries and owner/tenant relationship authority separation.
3. Create/target notices and verify intended audience.
4. Review helpdesk SLA exceptions and escalation ownership.
5. Review integration readiness without viewing provider secrets.
6. Exercise one support escalation and evidence-recording path.

Evidence owner: Society Admin.

### Security Supervisor

Required scenarios:
1. Review gate queue/guard operations.
2. Validate access integration health/degradation/fallback evidence.
3. Confirm manual fallback does not bypass authorization.
4. Exercise a security incident escalation and communication path.
5. Verify no Sev-1/Sev-2 blocker remains unresolved before sign-off.

Evidence owner: Security Supervisor.

### Accountant / Treasurer

Required scenarios:
1. Verify dues/receivables and owner/tenant payment eligibility.
2. Review payment exceptions and bank-reconciliation candidates.
3. Verify accounting export totals against the same pilot period.
4. Review opening-balance/migration reconciliation evidence when applicable.
5. Confirm period-close/tax settings respect finance permissions and applicable society configuration.
6. Confirm provider transaction state never replaces accounting truth.

Evidence owner: Accountant/Treasurer.

## KPI contract

The machine-checked V4.28 manifest defines nine pilot targets:
- gate handling time;
- visitor approval latency;
- resident activation;
- maintenance collection rate;
- payment failure rate;
- helpdesk SLA attainment;
- amenity booking completion;
- crash-free sessions;
- support burden.

These are pilot acceptance targets, not claims about current real-world performance. Until a named pilot supplies evidence, every KPI remains `PENDING_EXTERNAL`.

## Training records

Training evidence must cover:
- Resident key flows and support path;
- Guard arrival/offline/fallback/escalation;
- Society Admin onboarding, role, notice/helpdesk and escalation boundaries;
- Security Supervisor gate oversight and degradation/fallback;
- Accountant reconciliation/export/period-close boundaries.

Attendance records should contain role, session date, trainer/owner and completion status. Avoid personal data beyond what is operationally necessary.

## Hosted and operational proofs

Before `GO`, the manifest requires `PASS` evidence for:
1. `HOSTED_STAGING` — deployed exact candidate SHA and public dependency readiness.
2. `BACKUP_RESTORE` — managed backup policy plus isolated restore evidence.
3. `MONITORING_ALERTS` — availability/error/crash monitoring and alert-delivery proof.
4. `INCIDENT_TABLETOP` — severity, response, rollback and communication exercise.
5. `LIVE_PROVIDERS` — required OTP/push/payment/provider configuration verified in the actual environment.
6. `ANDROID_SIGNED_PLAY` — signed Android/Play candidate evidence when release scope requires it.

Physical ANPR/RFID/boom-barrier validation remains external where deployed.

## Exact release SHA and rollback

A production decision requires both:
- `candidateSha` — exact immutable release candidate;
- `rollbackSha` — previous known-good rollback target.

Both must be 40-character commit SHAs. The existing release-readiness workflow records these automatically for a staging-to-main release PR; the V4.28 manifest remains the pilot/business evidence source of truth.

## Incident tabletop

Exercise at least:
1. API/provider degradation requiring graceful fallback.
2. Payment callback/reconciliation uncertainty with no client-trusted success.
3. Gate/device degradation with manual authorization-preserving fallback.
4. Application rollback to the recorded rollback SHA.
5. Escalation communication across Release Owner, Society Admin and operational owner.

Record scenario, severity, trigger, decision owner, action, observed recovery, follow-up and artifact reference.

## Blocker policy

`GO` is prohibited while either `blockers.sev1` or `blockers.sev2` contains an unresolved item.

A blocker record must have a stable id and title. Detailed defect tracking may remain in GitHub/issues or the operational system; the manifest should reference rather than duplicate sensitive detail.

## Sign-off

Required sign-off:
- Resident representative;
- Guard representative;
- Society Admin;
- Security Supervisor;
- Accountant/Treasurer;
- Release Owner.

A sign-off cannot become `SIGNED` without an evidence reference and a named pilot society.

## Production decision states

- `HOLD_EXTERNAL_EVIDENCE` — repository may be ready, but field/hosted evidence is incomplete.
- `NO_GO` — evidence shows a failed acceptance condition or unresolved blocker.
- `GO` — all nine KPIs PASS, all five role scripts PASS, all six external proofs PASS, candidate/rollback SHAs are recorded, no Sev-1/Sev-2 blockers remain, all required roles are signed, and overall status is COMPLETE.

The checker in `scripts/check-v4.28-deployable-evidence.mjs` enforces these invariants.

## Repository closure boundary

V4.28 repository closure means:
- the evidence model exists;
- required role scripts/KPIs/proofs/sign-offs are machine checked;
- production `GO` fails closed without external proof;
- release controls reference the V4.28 contract;
- exact-head repository quality gates are green.

It does **not** mean a real pilot has occurred or production promotion is approved. `main` promotion remains a separate explicit user/release-owner action.
