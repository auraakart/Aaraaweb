# Aaraagate V4.78.2 — Staging Release-History Compatibility

Date: 2026-09-29  
Baseline: `develop@66a5b321255329dc67676b8440545d9cee25be26`

## Root cause

The V4.78.1 staging proof correctly blocked before smoke execution because the staging-only history classifier rejected a legitimate previously merged release subject:

`Release V4.78 exact develop tree to staging (#969)`

The classifier accepted `Release:`, `release(scope):` and `chore(release):`, but not the versioned GitHub merge title that had actually been used for V4.78. This meant every later exact-tree candidate would remain blocked until main caught up or the classifier grammar was reconciled.

## Fix

1. The classifier now additionally accepts only a bounded historical form:
   - `Release V<major>.<minor>[.<patch>] ... staging ...`
   - optional `Aaraagate` product token;
   - arbitrary feature/fix subjects remain rejected.
2. Self-tests include the exact V4.78 historical subject plus negative lookalikes.
3. The staging release contract executes the historical subject through the classifier, not just the classifier's internal self-test.
4. Future staging auto-merges explicitly write the canonical subject:
   - `Release: promote exact develop tree to staging (#PR)`
5. The auto-merge commit message records both successful release gates and the exact candidate SHA.

## Result

Historical safe staging release history is compatible, while future automation produces one stable title grammar. No branch is rewritten and no main-branch automation is added.
