# Guard Field Operations overstay and checkpoint action readability

Date: 2026-10-19
Base: `develop` `1070e83e4514233c83c9dea72ae3418f716cb83a`, after verified merged Guard handover PR #1475.

## Source-level issue
The Overstays and Patrol checkpoints sections still use ListTile trailing actions. At 320dp, 200% system text, the ESCALATE and SCAN/SCAN NOW buttons compete with long visitor identities and checkpoint status wording. Resident approval, guard escalation, patrol registration, backend permission and safety contracts already exist; they do not need redesign.

## Scoped UI correction
- Extract a focused presentational `GuardFieldActionCard` to cover Overstays and Patrol checkpoints.
- Keep the original compact ListTile, icon and button position at standard scale.
- At text scale above 130%, put long identity and operational status above a full-width tonal action.
- Keep existing callbacks, gateId handling, busy disabling, 20-overstay cap, all checkpoint rows, stale patrol age wording, status meaning and original action labels.
- Add 8 narrow dark/light, large/standard, icon/no-icon widget cases plus a disabled action case.

## Gates and exclusions
Require protected Flutter analyzer, changed Guard tests, risk-weighted Guard regression and coverage, full Flutter job and mandatory merge gates before integrating `develop`. This is not physical-device, TalkBack, multilingual or real security-operator acceptance. No staging/main or APK changes.

## CI contract reconciliation
V4.48's historical source check was coupled to the literal `Text('ESCALATE')` in the old monolithic Guard screen. It failed after the UI was extracted even though the action remained bound. The validation now accepts the historical inline label **or** an extracted `actionLabel` when `GuardFieldActionCard` renders it through its enabled/disabled `onPressed` callback. Patrol SCAN/SCAN NOW receives the same protection; existing overdue/patrol intelligence tokens, backend contracts, and other V4.48 checks are unchanged. This repairs the quality gate instead of bypassing it.
