# Aaraagate V4.11 Development Program

Version: 4.11
Date: 2026-09-18
Baseline branch: `develop`
Baseline commit: `6ee6a9c38244400ed6a27ba85e9097dca79e24b3`
Repository completion commit before final reconciliation: `f2a3c5e875eee80362a714a4ccdf38fbe513bab9`
Status: **Repository development complete; external pilot evidence pending**

## Mission
V4.11 is a focused competitive-depth cycle across five areas: Guard field UX/voice input, finance depth/accountant usability, a permission-aware AI Action Centre, resident experience polish, and pilot-readiness instrumentation/playbooks.

`main` remains untouched during V4.11. Each development slice merged to `develop` only after its relevant validation gates were green.

## Engineering rules
- Reuse existing bounded contexts before adding new models or services.
- Preserve tenant/property scoping, capability authorization, auditability and idempotency.
- High-impact AI and finance actions require explicit confirmation/approval through normal APIs.
- Device speech is assistive input only; it never auto-authorizes gate access or auto-submits an arrival.
- Repository evidence is not field evidence. Real providers, hardware, representative-device certification and society pilot acceptance remain external gates.
- Score movement is evidence-only.

## Completed sequence

| Slice | PR | Merge commit | Repository outcome |
|---|---:|---|---|
| V4.11.1 Guard field UX / voice input | #650 | `d60b91946e5800d5add76343e13910ad51cbd896` | Short-phrase device speech abstraction, eight-language locale mapping, deterministic provider/destination parsing, ambiguity-safe manual selection and review-before-submit quick-fill |
| V4.11.2 Finance depth | #651 | `dc411771a9406c5574470433f75eeabcccee5b70` | Reconciliation review metrics, read-only tenant-scoped exact-movement candidates, safer accountant review UX and export date presets including Indian FY |
| V4.11.3 AI Action Centre | #652 | `7fe8dbd1a5c2f6f7b2900b1c6db45269f28db0a8` | Permission-scoped, severity-ordered read-only cards grounded in finance/helpdesk/security/facilities; no mutation path added |
| V4.11.4 Resident experience | #653 | `72edbc7d2bac8cf387a2c29b19e9a5ac39753e33` | Property-scoped next actions for unsettled dues, active services and notices; reuses Updates timeline and excludes settled/completed work |
| V4.11.5 Pilot readiness | #654 | `f2a3c5e875eee80362a714a4ccdf38fbe513bab9` | Machine-checked KPI/evidence contract plus Guard/Accountant/Admin-support training and incident/escalation playbook |

## Scope clarifications

The cycle intentionally avoided duplicate or unsafe expansion:
- V4.11.2 did not add a second tax engine; the existing GST/TDS metadata foundation remains authoritative. This cycle concentrated on accountant reconciliation and export usability.
- V4.11.3 did not introduce direct AI writes. Existing allow-listed proposal/confirmation flows remain the mutation boundary.
- V4.11.4 reused the existing Updates timeline instead of creating a second activity feed. No separate event/RSVP subsystem was added where the repository did not justify a new primitive.
- V4.11.5 records repository readiness, not a completed society pilot.

## Final V4.11 gate

Repository evidence at closure:
- full CI green on the development slices;
- Flutter Resident/Guard analyze and tests green;
- API lint/typecheck/tests/build/runtime readiness green;
- Admin tests/typecheck/build green;
- cross-role, role, security/privacy and pilot contracts green where applicable;
- V4.11 Pilot Readiness Contract green on #654;
- field KPI evidence remains external and unclaimed.

The final evidence-only competitive score is maintained in `docs/AARAAGATE-V4-COMPETITIVE-SCORECARD.md`. `main` remains unchanged until an explicit release-promotion approval.
