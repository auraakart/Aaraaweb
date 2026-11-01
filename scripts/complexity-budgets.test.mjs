import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { requireComplexityCeiling } from './lib/complexity-budgets.mjs';

const file = 'services/api/src/amenities/amenities.service.ts';
for (const budget of [930, 920]) test(`accepts enforced budget ${budget}`, () => {
  requireComplexityCeiling(`['${file}', ${budget}]`, file, 930);
});
for (const [name, source] of [
  ['relaxed', `['${file}', 931]`], ['removed', 'new Map([])'],
  ['duplicate', `['${file}', 930],['${file}', 920]`],
  ['zero', `['${file}', 0]`], ['invalid', `['${file}', NaN]`],
  ['different path', "['services/api/src/amenities/amenitiesXserviceXts',930]"],
]) test(`rejects ${name} budget`, () => assert.throws(() => requireComplexityCeiling(source, file, 930)));

test('checked-in core and extraction budgets retain their ceilings', () => {
  const source = readFileSync('scripts/check-complexity-boundaries.mjs', 'utf8');
  for (const [path, maximum] of [[file, 930], ['apps/resident/lib/screens/helpdesk_screen.dart', 880],
    ['apps/resident/lib/widgets/helpdesk_ticket_card.dart', 120], ['services/api/src/amenities/amenity-blackout-assessment.ts', 75]]) {
    requireComplexityCeiling(source, path, maximum);
  }
});

for (const gate of ['check-v4.81.2-maintainability-tenant-hardening.mjs', 'check-v4.81.5-maintainability-hygiene.mjs']) {
  test(`${gate} permits further tightening but rejects relaxation`, () => {
    for (const [limit, expected] of [[920, 0], [931, 1]]) {
      const code = `import fs from 'node:fs'; const read=fs.readFileSync;
        fs.readFileSync=function(path,...args){const content=read.call(this,path,...args); return path==='scripts/check-complexity-boundaries.mjs'?content.replace(${JSON.stringify(`['${file}', 930]`)},${JSON.stringify(`['${file}', ${limit}]`)}):content;};
        await import(${JSON.stringify(new URL(`./${gate}`, import.meta.url).href)});`;
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
      assert.equal(result.status, expected, result.stdout + result.stderr);
      if (expected) assert.match(result.stderr, /Complexity budget must remain/);
    }
  });
}
