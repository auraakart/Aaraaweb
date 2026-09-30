import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=(path)=>fs.readFileSync(path,'utf8');
const root=JSON.parse(read('package.json'));
const api=JSON.parse(read('services/api/package.json'));
const admin=JSON.parse(read('apps/admin/package.json'));

const parseVersion=(value)=>{
  const parts=value.split('.').map(Number);
  assert.equal(parts.length,3,'Release identity must be major.minor.patch.');
  assert.ok(parts.every(Number.isInteger),'Release identity must contain numeric major/minor/patch values.');
  return parts;
};
const compare=(a,b)=>{
  for(let i=0;i<3;i++){
    if(a[i]!==b[i])return a[i]-b[i];
  }
  return 0;
};

const current=parseVersion(root.version);
assert.ok(compare(current,[4,80,11])>=0,'Current release identity must not regress below V4.80.11.');
assert.equal(api.version,root.version,'API release identity must match root.');
assert.equal(admin.version,root.version,'Admin release identity must match root.');

const buildCode=`${current[0]}${String(current[1]).padStart(2,'0')}${String(current[2]).padStart(2,'0')}`;
const runtimeVersion=`version: ${root.version}+${buildCode}`;
for(const pubspec of ['apps/resident/pubspec.yaml','apps/guard/pubspec.yaml']){
  assert.ok(read(pubspec).includes(runtimeVersion),`${pubspec} must match ${runtimeVersion}.`);
}

const demo=read('.github/workflows/resident-demo-apk.yml');
for(const token of [
  'id: release_identity',
  'steps.release_identity.outputs.build_version',
  'steps.release_identity.outputs.version',
  'tag: resident-demo-latest',
  'Source commit:',
]){
  assert.ok(demo.includes(token),`Resident demo workflow missing traceability token: ${token}`);
}
assert.ok(demo.includes("github.ref == 'refs/heads/main'"),'Stable demo release must remain main-push gated.');

const legacy=read('scripts/check-v4.68-emergency-contact-recovery.mjs');
assert.ok(legacy.includes('must remain aligned at V4.68.0 or newer.'),'Historical V4.68 release guard must remain forward-compatible.');

const evidence=read('docs/AARAAGATE-V4.80.11-RELEASE-IDENTITY-TRACEABILITY.md');
for(const token of [
  'Root/API/Admin: `4.80.11`',
  'Resident/Guard: `4.80.11+48011`',
  '`resident-demo-latest` remains stable',
  'version and exact source commit',
]){
  assert.ok(evidence.includes(token),`V4.80.11 evidence missing: ${token}`);
}

console.log('V4.80.11 release identity and artifact traceability contract: PASS');
