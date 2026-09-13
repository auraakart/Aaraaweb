# V2.1C Governance Core Foundation

## Scope

This slice establishes the authoritative society-governance record model before Admin UI work.

It covers:
- committee roster and tenure history;
- explicit tenure end/handover notes;
- AGM, SGM, committee and business meeting records;
- ordered agenda items;
- resolution evidence;
- action-item ownership and due dates;
- append-only governance evidence events;
- configurable quorum, approval-rule and bye-law references.

## Authorization

All reads use the existing `GOVERNANCE_READ` permission. All mutations use `GOVERNANCE_MANAGE`. The implementation does not introduce broad role-name checks or weaken the existing typed permission model.

## Legal / jurisdiction boundary

Aaraagate records governance evidence; it does not encode a single jurisdiction's statutory quorum or voting rule as product logic.

`quorumRequired`, `quorumPresent`, `approvalRequired`, `approvalRecorded`, `quorumRuleReference`, `approvalRuleReference`, and `byeLawReference` capture the society's applicable evidence and references. Whether a particular meeting or resolution is legally valid remains governed by the society's registered bye-laws and applicable law.

## Audit integrity

`GovernanceEvidenceEvent` is append-only at the database layer. Meeting creation, agenda additions, resolution recording, action creation and meeting-outcome recording append evidence without rewriting prior events.

Committee tenures are historical records. Ending a tenure sets its effective end and optional handover notes rather than deleting the tenure.

## API baseline

- `GET /governance/committee`
- `POST /governance/committee/tenures`
- `POST /governance/committee/tenures/:id/end`
- `GET /governance/meetings`
- `GET /governance/meetings/:id`
- `POST /governance/meetings`
- `POST /governance/meetings/:id/outcome`
- `POST /governance/meetings/:id/agenda`
- `POST /governance/meetings/:id/resolutions`
- `POST /governance/meetings/:id/actions`

## Deliberately deferred

The following remain subsequent V2.1C batches:
- Admin governance workspace;
- supporting-document reference/verification workflow;
- action status transitions and reminders;
- poll/survey foundation, explicitly non-statutory by default;
- any electronic-voting capability, which requires separate legal approval, permissions and feature gating.

`main` is not part of this development slice.