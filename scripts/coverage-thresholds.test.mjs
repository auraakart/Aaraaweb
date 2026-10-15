import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireCoverageFloor } from './lib/coverage-thresholds.mjs';

test('historical floors accept stronger per-file thresholds', () => {
  requireCoverageFloor("'src/a.ts': { statements: 75, branches: 80, }", 'src/a.ts', { statements: 30, branches: 28 });
});
test('missing, reduced, or unrelated thresholds fail closed', () => {
  for (const source of ["'src/a.ts': { statements: 29 }", "'src/b.ts': { statements: 90 }", "'src/a.ts': { branches: 90 }", "'src/a.ts': { statements: 101 }"]) {
    assert.throws(() => requireCoverageFloor(source, 'src/a.ts', { statements: 30 }));
  }
});
