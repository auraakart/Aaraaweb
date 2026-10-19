# Guard Field Operations handover-card accessibility

Date: 2026-10-19
Baseline: `develop` `96fffa7d3e3ae85f373a2bb96047a3306e6d59fb` after the verified green merge of #1474.

## Source finding
The original Field Operations handover card shows the outgoing guard/gate identity and the status on a fixed row. On a 320dp viewport at 200% text, long guard and gate names compete with OPEN/ACKNOWLEDGED status, and the ACKNOWLEDGE action can become cramped. The acknowledgement mutation and authorization are already implemented in GuardOperationsClient and must remain untouched.

## Targeted remediation
- Extract the existing handover presentation into a bounded GuardFieldHandoverCard widget.
- At system text scale above 130%, render complete guard/gate identity above status and give ACKNOWLEDGE the full card width.
- At default font sizes retain a single identity/status row and right-aligned action.
- Preserve up to six visible outstanding items, summary, OPEN-only acknowledgement, busy disabling, original callback, backend authority, existing themes and locale presentation.
- Add widget regressions for open/acknowledged, light/dark, 390dp normal and 320dp 200% text, plus disabled busy actions.

## Validation limits
This is presentation-only with no contract, workflow, role, permission, sync, gate or API changes. Require targeted Guard tests, Flutter format/analyze, broad Guard regression and all protected PR gates before integration into `develop`. Physical device, multilingual and TalkBack acceptance remain pending. Staging/main and demo APK must remain unchanged.
