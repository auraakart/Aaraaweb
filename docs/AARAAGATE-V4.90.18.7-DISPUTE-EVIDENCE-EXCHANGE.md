# V4.90.18.7 — Service dispute evidence exchange
**Baseline:** develop `da742aa85f03e34797749614e41bf6278c1d9702`.

## Closed gap
Residents can open and later read the resolution of a service dispute, while providers can view raised disputes. Neither side can add dated, auditable follow-up evidence after the case is created.

## Implementation
- New dispute-scoped evidence records with author role (RESIDENT/PROVIDER), text note (5–2000 characters), optional **plain-text** external reference (max 400 characters), creation timestamp, and stable idempotency key (8–120 characters).
- Resident endpoints verify the **consumer + booking + dispute** together; provider endpoints resolve the authenticated provider and verify dispute ownership. Both see the conversation without revealing author account IDs. Platform reviewers get permission-gated read access.
- Database locks the dispute row before appending a note to serialize against closing the dispute. Only OPEN/UNDER_REVIEW accepts new notes. Exact same-actor/same-content retry returns immutable receipt even after resolution; changed content conflicts.
- Resident Flutter service issue history and Provider Readiness case cards show thread notes and allow deliberate submissions; transport failures retain retry identity in the active UI session, with discard controls.
- DPDP data subject exports include this thread for a consumer or author. Approved erasure minimises note/reference text before minimising dispute detail. No file uploads, arbitrary URL opening, direct payment, refund, automatic repricing, or case status changes.
- Bounded latest 100 notes per dispute; field UAT and linked document/photograph storage are separate acceptance slices.

## Validation
Focused API tests cover scope isolation, state gating, lock ordering, idempotent replay, changed payload conflict, and inserts. Full API/Admin/Flutter CI and migrations must pass before merge. Promote only to develop; staging/main untouched.
