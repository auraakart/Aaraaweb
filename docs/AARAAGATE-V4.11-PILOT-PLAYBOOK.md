# Aaraagate V4.11 Pilot Readiness Playbook

Date: 2026-09-18
Status: Repository-ready; external field execution pending

This playbook turns V4.11 repository capability into a controlled society pilot. It is deliberately not evidence that a pilot has happened. The authoritative machine-checkable field-evidence state is `docs/v4.11-pilot-readiness.json`.

## Entry gate

A pilot candidate must have:
- exact candidate SHA recorded;
- full CI and cross-role regression green on that SHA;
- no open Sev-1/Sev-2, tenant-isolation, authorization, finance-integrity or gate-authorization blocker;
- pilot society and named role participants recorded in the evidence plan before any KPI is changed from `PENDING_EXTERNAL`;
- supported Guard/Resident test-device matrix recorded;
- real provider credentials and hosted environment validation tracked separately where the scenario depends on them.

## Guard training

The trainer must demonstrate and the pilot guard must repeat:
1. normal visitor, delivery and cab arrival processing;
2. voice quick-fill as draft assistance only;
3. review-before-submit and resident approval boundaries;
4. ambiguous destination behavior — manual property selection is mandatory;
5. manual fallback when speech is unavailable or incorrect;
6. offline queue status, retry-safe recovery and supervisor-review conflicts;
7. emergency/escalation path and when not to improvise an access decision.

Record training attendance without resident PII or credentials.

## Accountant/Treasurer training

The accountant must demonstrate:
1. bank statement review and reconciliation health metrics;
2. candidate suggestions as review aids, never automatic postings;
3. exact journal verification before accepting a suggested match;
4. reviewed manual UUID fallback where no safe candidate exists;
5. stale unmatched disposition before close;
6. Indian financial-year and period export presets;
7. artifact hash / row-count / downstream reconciliation evidence;
8. separation between payment-provider state and accounting truth.

## Admin/support training

The Admin/support owner must demonstrate:
1. AI Action Centre domain cards for authorized roles;
2. a negative-role check proving privileged cards do not appear;
3. grounded assistant drill-down and the no-direct-mutation boundary;
4. resident multi-property context support without cross-home leakage;
5. helpdesk/facility escalation ownership;
6. incident classification and communication;
7. rollback escalation to the release owner.

## Incident severity

- **Sev-1:** cross-tenant/property disclosure, unauthorized gate access, destructive accounting corruption, credential/secret exposure, or safety-critical emergency failure. Stop pilot workflow and escalate immediately.
- **Sev-2:** repeated inability to process core gate, billing/reconciliation or resident access workflows without a safe fallback. Freeze affected rollout slice and escalate.
- **Sev-3:** localized usability defect with a documented safe workaround.
- **Sev-4:** cosmetic/non-blocking issue.

No Sev-1 or Sev-2 may be reclassified solely to preserve a pilot schedule.

## KPI execution

Use the definitions and thresholds in `docs/v4.11-pilot-readiness.json`. Thresholds are acceptance targets, not claimed achievements. A KPI may move to `PASS` only when its evidence array contains a durable, non-secret reference to the executed result.

Do not place resident phone numbers, access tokens, payment credentials, raw voice recordings or unnecessary personal data in evidence files.

## Scripted readiness exercises

Before live resident onboarding:
- execute one Guard manual-fallback drill;
- execute one ambiguous voice destination case and prove no automatic unit selection;
- reconcile a representative bank statement subset including at least one unmatched exception;
- validate one Action Centre negative-role case;
- validate a resident with multiple properties sees highlights only for the active property;
- run one support escalation tabletop;
- record candidate and rollback SHAs.

## Exit gate

Repository readiness may be described as complete when CI contracts are green. **Pilot acceptance** is complete only after:
- a pilot society is named;
- every mandatory KPI has field evidence and status `PASS` or an explicitly approved exception outside this contract;
- Security Supervisor, Accountant/Treasurer, Society Admin and Release Owner sign-offs are recorded;
- no unresolved Sev-1/Sev-2 remains.

Production promotion remains a separate decision and is not implied by V4.11 repository completion.
