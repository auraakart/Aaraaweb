import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parameterContractFindings as findings } from './check-postgres-parameter-contracts.mjs';

for (const unit of ['years', 'months', 'weeks', 'days', 'hours', 'mins']) {
  test(`rejects uncast ${unit} but accepts explicit integer casts`, () => {
    assert.equal(findings('make_interval(' + unit + ' => ${duration})').length, 1);
    for (const cast of ['int', 'integer', 'int4', 'smallint']) {
      assert.deepEqual(findings('make_interval(' + unit + ' => ${duration} :: ' + cast + ')'), []);
    }
  });
}
test('retains double precision seconds and literal integer arguments', () => {
  assert.deepEqual(findings('make_interval(secs => ${seconds}, mins => 10)'), []);
});
test('detects tagged and Prisma.sql uncast void lock results', () => {
  for (const query of [
    'tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))',
    'tx.$queryRaw(Prisma.sql`\n SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))',
  ]) {
    assert.equal(findings(query + '`);').length, 1);
    assert.deepEqual(findings(query + '::text`);'), []);
  }
});
test('executeRaw lock results do not require deserialization', () => {
  assert.deepEqual(findings('tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;'), []);
});
