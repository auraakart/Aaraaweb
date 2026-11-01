import assert from 'node:assert/strict';

/** Historical contracts permit tighter ceilings, never removed or relaxed ones. */
export function requireComplexityCeiling(source, file, maximum) {
  assert.ok(Number.isSafeInteger(maximum) && maximum > 0, 'Invalid complexity ceiling');
  const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = new RegExp(`\\[\\s*(['"])${escaped}\\1\\s*,\\s*(\\d+)\\s*\\]`, 'g');
  const matches = [...source.matchAll(expression)];
  assert.equal(matches.length, 1, `Missing or duplicate complexity budget: ${file}`);
  const budget = Number(matches[0][2]);
  assert.ok(Number.isSafeInteger(budget) && budget > 0 && budget <= maximum,
    `Complexity budget must remain at most ${maximum}: ${file}`);
}
