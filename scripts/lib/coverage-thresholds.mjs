import assert from 'node:assert/strict';

// Historical contracts enforce minimums, allowing later releases to raise them.
export function requireCoverageFloor(source, file, floors) {
  const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = source.match(new RegExp(`['"]${escaped}['"]\\s*:\\s*\\{([^}]+)\\}`))?.[1];
  assert.ok(block, `Missing coverage threshold for ${file}`);
  for (const [metric, minimum] of Object.entries(floors)) {
    const value = block.match(new RegExp(`\\b${metric}\\s*:\\s*(\\d+(?:\\.\\d+)?)\\s*[,}]?`))?.[1];
    assert.ok(value !== undefined && Number(value) >= minimum && Number(value) <= 100,
      `${file} ${metric} must be between ${minimum} and 100`);
  }
}
