import assert from 'node:assert/strict';
import { test } from 'node:test';
import { releaseAtLeast } from './lib/release-version.mjs';

test('historical release floors accept V5 while preserving old-version rejection', () => {
  for (const floor of [[4, 63, 0], [4, 64, 0], [4, 64, 1], [4, 65, 0], [4, 66, 0], [4, 67, 0]]) {
    assert.equal(releaseAtLeast('5.10.0', ...floor), true);
    assert.equal(releaseAtLeast('4.99.3', ...floor), true);
    assert.equal(releaseAtLeast('4.62.99', ...floor), false);
    assert.equal(releaseAtLeast(floor.join('.'), ...floor), true);
  }
  assert.equal(releaseAtLeast('4.64.0', 4, 64, 1), false);
  for (const invalid of ['5.10', '05.10.0', '5.10.0-beta', '5.10.0garbage', 'x', null, '999999999999999999.1.0']) {
    assert.equal(releaseAtLeast(invalid, 4, 63), false);
  }
});
