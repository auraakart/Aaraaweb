# Aaraagate V4.55.1 — Engineering Evidence Closure

Date: 2026-09-25

## Objective

V4.55.1 closes the remaining non-production engineering gaps identified after V4.55 verification. It does not add product features and does not claim hosted, provider, hardware, store, society-pilot or production acceptance.

## 1. Risk-weighted coverage enforcement

The existing risk-weighted behavioural tests now also produce measurable coverage evidence.

### API
Vitest V8 coverage is restricted to the high-risk source surface exercised by the V4.55 behavioural regression suite. Coverage floors are intentionally domain-specific rather than a single arbitrary global percentage:
- canonical payment availability: 90% statements/lines/functions and 75% branches;
- privacy self-context controller: 55% statements/lines/branches and 50% functions;
- visitor/gate access service: 30% statements/lines and 25% functions/branches;
- session authority: 20% statements/lines/functions and 15% branches;
- household authority: 12% statements/lines, 20% functions and 15% branches;
- controlled AI operations service: 15% statements/lines/functions and 10% branches.

These are regression floors for the currently exercised high-risk slice, not a claim that the whole API has equivalent coverage. Future cycles should ratchet them upward when additional behaviour is covered.

### Flutter
Resident and Guard targeted suites emit LCOV. V4.55.1 enforces measured regression floors for the critical controllers/screens/models exercised by those suites and retains the LCOV plus machine-readable risk evidence. The calibrated Resident floors are 30% for property-state control, 20% for Gate, 30% for Billing, 20% for Privacy and 10% for Home; Guard floors are 30% for the controller and 20% for workforce boundary models.

## 2. Branch-debt closure

Branch hygiene now recognizes exact source-tree equivalence in addition to ancestry and exact merged-PR-head evidence. This is important because Aaraagate deliberately uses squash and exact-tree promotions, which can make integrated branches look unmerged by ancestry alone.

The deletion boundary remains conservative:
- never delete canonical, protected, open-PR, backup, recovery, archive or snapshot branches;
- delete only when source is proven integrated by ancestry, exact tree, exact merged canonical PR head, or explicit superseded-head evidence;
- keep genuinely unique branches for review rather than guessing.

The first post-merge hygiene run safely deleted two proven-integrated branches and identified 24 branches with genuinely unproven unique source. Those 24 were then manually reconciled against canonical ancestry/tree state and all available PR history and recorded in `.github/branch-retention.json` at exact reviewed SHAs. The automation now treats an exact registered SHA as intentionally retained; if any retained branch moves, that retention becomes invalid and the branch returns to review. A subsequent branch-hygiene run with zero unexplained review branches is the authoritative closure evidence.

## 3. Release identity

V4.55.1 aligns root, API and Admin to `4.55.1`; Resident and Guard use `4.55.1+45501`.

## Exit state

V4.55.1 non-production engineering closure is complete only when:
1. the API and Flutter coverage floors pass on the exact develop candidate;
2. full existing CI remains green;
3. branch hygiene runs successfully and publishes its deletion/review evidence;
4. staging promotion, if performed, uses one exact-tree promotion commit.

Productionization remains outside this sub-version.
