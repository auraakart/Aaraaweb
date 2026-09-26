import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(p,'utf8');
const json=p=>JSON.parse(read(p));
const root=json('package.json');
const api=json('services/api/package.json');
const admin=json('apps/admin/package.json');
const parts=root.version.split('.').map(Number);
const atLeast4552=parts.length===3 && (
  parts[0]>4 ||
  (parts[0]===4 && parts[1]>55) ||
  (parts[0]===4 && parts[1]===55 && parts[2]>=2)
);
assert.ok(atLeast4552,'Current release identity must not regress below V4.55.2.');
assert.equal(api.version,root.version);
assert.equal(admin.version,root.version);
const residentVersion=read('apps/resident/pubspec.yaml').match(/^version: (\d+\.\d+\.\d+)\+\d+$/m)?.[1];
const guardVersion=read('apps/guard/pubspec.yaml').match(/^version: (\d+\.\d+\.\d+)\+\d+$/m)?.[1];
assert.equal(residentVersion,root.version);
assert.equal(guardVersion,root.version);
const index=read('docs/CURRENT-CAPABILITY-INDEX.md');
for (const token of ['V4.55.2 Release Truth Closure','late-fee batch idempotency','verified current ownership/current occupancy','payment reconciliation','reversal/refund evidence','unconfirmed Resident AI complaint proposal']) assert.ok(index.includes(token),`Missing capability evidence: ${token}`);
const closure=read('docs/AARAAGATE-V4.55.2-RELEASE-TRUTH-CLOSURE.md');
for (const token of ['PRs #902–#906','does not claim staging/main promotion','4.55.2+45502']) assert.ok(closure.includes(token),`Missing closure boundary: ${token}`);
console.log('V4.55.2 historical release-truth closure: PASS');
