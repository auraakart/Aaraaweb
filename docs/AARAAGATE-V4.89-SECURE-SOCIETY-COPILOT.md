# Aaraagate V4.89 — Secure Society Copilot Expansion

## V4.89.1: property-relationship authorization foundations

- Assistant visitor/gate, household staff and private utility queries now require an **active selected-unit occupancy**; verified ownership alone is not enough to inspect daily occupant activity.
- Payable invoice reads require a **current verified owner or current tenant payer** for that unit, not an unrelated OWNER role from another apartment. Payment history is **payer-user scoped**, including for owners, so one payer's private history is never exposed to another.
- Resident certificate/NOC request summaries now select only the signed-in creator's requests, not another occupant's requests for the same unit.
- Explicit negative regressions cover non-resident ownership, cross-property role combinations, and private request scoping.
- Existing society authorization, role checks, tool entitlements and explicit mutation confirmations remain in force.

## Remaining ordered slices

1. V4.89.2: authorized My Home tools and read-only household/visitor/parking/dues query expansion; relationship and minimal-field projections.
2. V4.89.3: approved society FAQ/rules/notices/docs and authoritative citations.
3. V4.89.4: conversational intent handling, follow-ups and vernacular routing with safe no-answer behavior.
4. V4.89.5: permission-gated action proposal UX and source deep-links.
5. V4.89.6: opt-in daily briefing, user feedback and evidence-based validation.

## Governance and acceptance

All work targets `develop` until staged release approval. Full API/Resident/Admin security and tenant regression gates are mandatory; no score increase or production/device readiness is implied. Validate owner of Unit A/tenant of Unit B, move-out expiry, family role, revoked owner, independent payer and other-household denial. Financial/gate mutations still follow authoritative domain services and require confirmation.

## V4.89.2: first authorized My Home read tool (candidate)

- `RESIDENT_HOUSEHOLD` answers a family's member-list question only with an active, time-valid selected-unit occupant relationship and `HOUSEHOLD_READ_OWN` permission.
- Minimal projection returns only active approved `FAMILY_MEMBER` names and relationship; no phone/email, other units, pending or ended occupants.
- The Assistant provides a grounded answer and routes to Profile → Family members for detailed or management flows.
- A missing unit context does not trigger a cross-unit lookup; a non-resident owner or former occupant is denied.
- Further V4.89.2 read tools (vehicles, deliveries and personalized account status) remain planned; this is an initial capability slice.

## V4.89.3: society knowledge answer quality (candidate)

- Route common published society rules, pet/parking/pool policies, waste collection and office-hour questions to existing audience-checked SocietyDocument retrieval.
- Return a brief **attributed excerpt** from the current top matching published document, preserving version and document citation; do not synthesize unsupported details.
- Improve resident notice answers to give titles rather than an unhelpful generic label. Route practical water/power/lift outage queries to visible published notices.
- Continue to return an explicit no-evidence answer when society documentation is missing.
- Test published-content and missing-knowledge behaviors; the underlying role/audience filters remain authoritative.

## V4.89.4: understandable personalized answers and vernacular coverage (candidate)

- Replace generic selected-property status copy with safe invoice, payer-history, complaint, booking, and count summaries based on already authorized backend records.
- Invoice face value is **not** labelled net outstanding; CREATED payments are not treated as settled. Family members do not obtain finance answers.
- Add Hindi, Tamil, Telugu, Kannada, Malayalam and Bengali family/society-rule intent hints without changing server-side authorization.
- Validate Tamil household routing and source-limited, null-safe personal answer composition. Multi-turn memory and natural free-form generative AI remain separate future work.

## V4.89.5: review-first complaint assistance (candidate)

- Explicit create/raise/file/report complaints offer `Prepare complaint for review` after an Assistant answer on the selected home; passive complaint status queries never trigger this.
- Preparation reuses the existing authorized helpdesk proposal endpoint and independent confirmation; asking never auto-submits a complaint.
- Editing the submitted question hides stale proposed action; no cross-topic draft activation.
- Resident widget regressions prove separate preparation and confirmation plus passive-query denial. Source deep links and persisted feedback remain separate roadmap items.

## V4.89.6: current-home briefing, read-only and permission scoped (candidate)

- Recognize on-demand daily/morning briefing prompts and require current, time-valid occupancy and selected property. A nonresident owner or former tenant is denied.
- Compose current visible notice titles, pending visitor requests, caller-created open helpdesk requests and payer-eligible invoice record counts from independent source-authorized existing tools. Explicitly describe a **current snapshot**, not false claims of events occurring today.
- No background monitoring, automatic notifications or new data-provider sharing is performed. Proactive opt-in reminders and persisted resident feedback require a distinct consent/preference and notification design before release.
- Regression covers the authorized tenant, nonresident/expired occupant denial and missing property context. Acceptance still includes cross-role negative integration, multilingual physical-device usability and comprehensive policy coverage; no fabricated >8.5 score.

## V4.89 version identity and closure discipline (pending release checks)

The planned consolidated develop release candidate uses root/API/Admin version `4.89.6` and Resident/Guard `4.89.6+48906`. It is **not** automatically a staging/main release.

The bounded V4.89 slices introduce selected-property occupant/payer read restrictions, current family queries, audience-grounded policy and notice answers, readable personal status, review-first complaint initiation and on-demand current-home briefing.

**Items still needing separate acceptance/work:** wider society FAQ catalog/coverage, natural multi-turn conversations beyond routing hints, genuine opt-in notifications with consent/retention controls, actionable source deep links, persisted feedback, full adversarial privacy/e2e matrix and physical device multilingual usability. No claims that all society questions are answered, no unexplained 8.5+ score, and no productionization or external-provider integration acceptance.

No main merge is permitted without a separately approved, green release PR; the earlier V4.88.6 main release is still governed independently.

## V4.89.7: active household vehicle query (development candidate)

- Add read-only RESIDENT_VEHICLES tool gated by HOUSEHOLD_READ_OWN and current selected-unit occupancy; ownership of another home is not sufficient.
- The database query filters society, unit and active household vehicle state; returns only sanitized make/type and last four plate characters. No unmasked vehicle registration is placed in answers or structured facts.
- Missing selected unit, nonresident owner, unrelated security role and parking-bay allocation requests fail without guessing or exposing another household's inventory.
- Add targeted negative privacy and no-hallucination tests. Other parking assignment and delivery tools remain separate work.
- Version identity changes only on the consolidated release; staging/main untouched during development.
