import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateTenantIsolationCatalog as evaluate } from './lib/tenant-isolation-policy.mjs';

const role = { superuser: false, bypassRls: false };
const table = { name: 'Payment', rlsEnabled: true, rlsForced: true, policyCount: 1, ownerReachable: false };

test('requires nonempty and unambiguous catalog evidence', () => {
  for (const args of [[[], [], []], [[role], [], []], [[role], [table, table], ['Payment']]]) {
    assert.throws(() => evaluate(...args));
  }
});

test('rejects privileged reachable roles and missing/disabled/unforced policies', () => {
  for (const badRole of [{ ...role, superuser: true }, { ...role, bypassRls: true }, {}]) {
    assert.equal(evaluate([badRole], [table], ['Payment']).status, 'CATALOG_REVIEW_REQUIRED');
  }
  for (const badTable of [{ ...table, rlsEnabled: false }, { ...table, rlsForced: false },
    { ...table, policyCount: 0 }, { ...table, policyCount: '1' }, { ...table, ownerReachable: true }]) {
    assert.equal(evaluate([role], [badTable], ['Payment']).status, 'CATALOG_REVIEW_REQUIRED');
  }
  assert.deepEqual(evaluate([role], [], ['Payment']).gaps, [{ table: 'Payment', reasons: ['TABLE_MISSING'] }]);
});

test('catalog prerequisites never substitute for semantic or runtime isolation evidence', () => {
  const report = evaluate([role], [table], ['Payment', 'Payment']);
  assert.equal(report.status, 'CATALOG_PREREQUISITES_MET');
  assert.equal(report.requiredTableCount, 1);
  assert.equal(report.isolationProven, false);
  assert.ok(report.remainingAcceptance.includes('CROSS_TENANT_NEGATIVES'));
});
