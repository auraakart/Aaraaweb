# Aaraagate V4.11 Development Program

Version: 4.11
Date: 2026-09-18
Baseline branch: `develop`
Baseline commit: `6ee6a9c38244400ed6a27ba85e9097dca79e24b3`
Status: Mastermind execution

## Mission
V4.11 is a focused competitive-depth cycle across five areas: Guard field UX/voice input, finance depth/accountant usability, a permission-aware AI Action Centre, resident experience polish, and pilot-readiness instrumentation/playbooks.

`main` remains untouched during V4.11. Each slice merges to `develop` only after affected tests and CI are green.

## Engineering rules
- Reuse existing bounded contexts before adding new models or services.
- Preserve tenant/property scoping, capability authorization, auditability and idempotency.
- High-impact AI and finance actions require explicit confirmation/approval through normal APIs.
- Device speech is assistive input only; it never auto-authorizes gate access or auto-submits an arrival.
- Repository evidence is not field evidence. Real providers, hardware, representative-device certification and society pilot acceptance remain external gates.
- No score increase is recorded until merged code and regression evidence justify it.

## V4.11.1 — Guard field UX and voice input
Scope: short-phrase device speech input for delivery/cab quick arrivals; eight-language locale mapping; deterministic provider/type/destination parsing; review-before-submit; test-safe speech abstraction; manual/offline fallback.
Exit: Guard analyze/tests green; ambiguous destinations never auto-selected; no voice path bypasses resident approval or authorization.

## V4.11.2 — Finance depth and accountant usability
Scope: reconciliation review/exception visibility; vendor-bill tax/withholding presentation and approval traceability; accountant export presets/summaries using existing accounting contracts.
Exit: finance negative authorization/reconciliation/export tests green; no destructive ledger mutation or hidden auto-posting.

## V4.11.3 — AI Action Centre
Scope: role-aware operational cards for collections/ageing, SLA risk, security and maintenance; allow-listed normal API actions; explicit mutation confirmation; privacy-minimal audit context.
Exit: tenant/permission, allow-list and confirmation tests green.

## V4.11.4 — Resident experience polish
Scope: unified action timeline for dues, gate, helpdesk, bookings and notices; contextual reminders/next actions; event/RSVP entry points only where existing primitives support them; preserve independent-home and multi-property isolation.
Exit: loading/empty/error/denied, isolation and accessibility regressions green.

## V4.11.5 — Pilot readiness
Scope: KPI/threshold manifest for guard throughput, collections/reconciliation, helpdesk SLA and activation; automated pilot-readiness contract; guard/admin/support training and escalation playbooks.
Exit: CI pilot contract green; KPI source/owner/rule explicit; real-world evidence remains pending until executed.

## Final V4.11 gate
Run full CI and cross-role regression, reconcile requirements/evidence, re-score only proven dimensions, and leave `main` unchanged unless release promotion is explicitly approved.
